import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createClient } from "@/lib/supabase/server";
import { libellePoste } from "@/lib/calc";
import { sommeSuperficieZonesM2 } from "@/lib/zones";
import type { Snapshot } from "@/lib/rapport";

// ponytail: export SYNCHRONE + dépôt Storage + versionnage (Phase 5, US-48). Rendu DEPUIS le
// snapshot gelé, jamais du calcul vivant. SWAP MODÈLE (Phase 7) → remplacer
// src/templates/rapport-provisoire.docx par le vrai modèle Word de Luis (mêmes placeholders).
// ponytail: template lu depuis le filesystem (process.cwd) — vérifier outputFileTracingIncludes au
// 1er déploiement Vercel.
// ponytail: Option B (Phase 12) tranchée — le livrable devient un PDF : le .docx est converti via
// Gotenberg auto-hébergé ca-central (Loi 25 : données au Canada), puis l'annexe Optima est
// fusionnée TELLE QUELLE (pdfengines/merge, aucun re-rendu). Gotenberg = 1 service à maintenir,
// prix assumé d'Option B ; upgrade path si trop lourd : API managée dédiée.

const PDF_MIME = "application/pdf";

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined
    ? ""
    : new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n);

function rendreDocx(snapshot: Snapshot, statut: string): Buffer {
  const templatePath = path.join(process.cwd(), "src/templates/rapport-provisoire.docx");
  const zip = new PizZip(readFileSync(templatePath, "binary"));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  doc.render({
    client: snapshot.dossier.client,
    adresse: snapshot.dossier.adresse ?? "",
    statut,
    sommaire_texte: snapshot.sommaire.texte,
    intensite: snapshot.intensite !== null ? fmt(snapshot.intensite) : "—",
    total_kwh: fmt(snapshot.bilan.totalEquipementsKwh),
    gaz_kwh: snapshot.gazKwh !== null ? fmt(snapshot.gazKwh) : "—",
    bilan_postes: snapshot.bilan.parPoste.map((p) => ({
      poste: libellePoste(p.poste),
      kwh: fmt(p.kwh),
      pct: Math.round(p.pct),
    })),
    equipements: snapshot.equipements.map((e) => ({
      nom: e.nom ?? "",
      puissance_valeur: e.puissance_valeur ?? "",
      puissance_unite: e.puissance_unite ?? "",
      conso_kwh_an: fmt(e.conso),
    })),
    // Phase 7 : mesures/ROI, sections narratives validées, textes fixes du modèle gelés + version.
    mesures: snapshot.mesures.map((m) => ({
      nom: m.nom ?? "",
      economies_annuelles: fmt(m.economies_annuelles),
      cout_investissement: fmt(m.cout_investissement),
      subvention: fmt(m.subvention),
      retour_annees:
        m.retour_annees === null
          ? "—"
          : new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(m.retour_annees),
    })),
    // Phase 9 : zones descriptives (hors calcul) + total informatif.
    zones: snapshot.zones.map((z) => ({
      nom_zone: z.nom ?? "",
      superficie_zone: fmt(z.superficie),
      unite_zone: z.unite === "pi2" ? "pi²" : z.unite === "m2" ? "m²" : "",
    })),
    zones_total_m2: fmt(sommeSuperficieZonesM2(snapshot.zones)),
    // Phase 10 : distribution électrique descriptive + compteur d'entrées dérivé des lignes.
    // `?? []` : rétrocompat des snapshots gelés AVANT la Phase 10 (sans champ distribution).
    distribution: (snapshot.distribution ?? []).map((d) => ({
      amperes: fmt(d.amperes),
      tension: fmt(d.tension),
    })),
    distribution_nb_entrees: (snapshot.distribution ?? []).length,
    // Phase 11 : registre des révisions. `?? []` : rétrocompat des snapshots gelés AVANT Phase 11.
    revisions: (snapshot.revisions ?? []).map((r) => ({
      numero_rev: r.numero ?? "",
      date_rev: r.date ?? "",
      description_rev: r.description ?? "",
    })),
    description_installations: snapshot.textes.description_installations ?? "",
    mesures_mise_en_forme: snapshot.textes.mesures_mise_en_forme ?? "",
    problemes_techniques: snapshot.textes.problemes_techniques ?? "",
    phasage_travaux: snapshot.textes.phasage_travaux ?? "",
    risques_sse: snapshot.textes.risques_sse ?? "",
    conclusions: snapshot.textes.conclusions ?? "",
    methodologie: snapshot.modele.methodologie ?? "",
    norme_ashrae: snapshot.modele.norme_ashrae ?? "",
    modele_risques_sse: snapshot.modele.risques_sse ?? "",
    modele_version: snapshot.modele_version,
  });

  return doc.getZip().generate({ type: "nodebuffer" });
}

type DbClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Rendu du livrable PDF (Option B) : docx gelé → PDF via Gotenberg, puis fusion de l'annexe Optima
 * telle quelle. Lève une Error avec `.gotenberg` pour que l'appelant renvoie 502/503.
 */
async function rendrePdf(snapshot: Snapshot, statut: string, supabase: DbClient): Promise<Buffer> {
  const base = process.env.GOTENBERG_URL;
  if (!base) throw Object.assign(new Error("GOTENBERG_URL absent"), { gotenberg: "config" as const });

  const bufDocx = rendreDocx(snapshot, statut);

  // 1. Conversion docx → PDF (LibreOffice).
  const convForm = new FormData();
  convForm.append("files", new Blob([new Uint8Array(bufDocx)]), "rapport.docx");
  const conv = await fetch(`${base}/forms/libreoffice/convert`, { method: "POST", body: convForm });
  if (!conv.ok) {
    throw Object.assign(new Error(`Gotenberg convert ${conv.status}: ${await conv.text()}`), { gotenberg: "http" as const });
  }
  let bufPdf = Buffer.from(await conv.arrayBuffer());

  // 2. Annexe : fusionner le PDF Optima TEL QUEL (sans Optima dans le snapshot → on saute).
  // Gotenberg fusionne par ordre ALPHABÉTIQUE des noms → préfixes 01_/02_ pour l'ordre voulu.
  if (snapshot.optima?.path) {
    const { data: blob, error } = await supabase.storage.from("optima").download(snapshot.optima.path);
    if (error || !blob) {
      throw Object.assign(new Error("Annexe Optima introuvable dans le Storage."), { gotenberg: "http" as const });
    }
    const optimaBytes = new Uint8Array(await blob.arrayBuffer());
    const mergeForm = new FormData();
    mergeForm.append("files", new Blob([new Uint8Array(bufPdf)]), "01_rapport.pdf");
    mergeForm.append("files", new Blob([optimaBytes]), "02_optima.pdf");
    const merge = await fetch(`${base}/forms/pdfengines/merge`, { method: "POST", body: mergeForm });
    if (!merge.ok) {
      throw Object.assign(new Error(`Gotenberg merge ${merge.status}: ${await merge.text()}`), { gotenberg: "http" as const });
    }
    bufPdf = Buffer.from(await merge.arrayBuffer());
  }

  return bufPdf;
}

function reponsePdf(buf: Uint8Array, client: string): Response {
  const safe = client.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);
  return new Response(buf as BodyInit, {
    headers: {
      "Content-Type": PDF_MIME,
      "Content-Disposition": `attachment; filename="rapport-${safe}.pdf"`,
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  // Droit d'export (Phase 8) : la RLS laisse lire le snapshot, mais l'export est une capacité à part.
  const { data: peutExporter } = await supabase.rpc("peut_exporter");
  if (!peutExporter) {
    return new Response("Droit insuffisant : export réservé aux comptes autorisés.", { status: 403 });
  }

  const { data: dossier } = await supabase
    .from("dossiers")
    .select("client, statut, rapport_snapshot")
    .eq("id", id)
    .single();
  if (!dossier) return new Response("Dossier introuvable", { status: 404 });

  // Hors approuve|exporte : export bloqué (B/US-30).
  if (!["approuve", "exporte"].includes(dossier.statut)) {
    return new Response("Export réservé à un dossier approuvé.", { status: 403 });
  }

  // Idempotent (A5/B5) : déjà exporté → re-télécharger la dernière version, aucune régénération.
  if (dossier.statut === "exporte") {
    const { data: derniere } = await supabase
      .from("rapport_versions")
      .select("storage_path")
      .eq("dossier_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!derniere) return new Response("Version introuvable", { status: 404 });
    const { data: blob, error } = await supabase.storage.from("rapports").download(derniere.storage_path);
    if (error || !blob) return new Response("Fichier introuvable", { status: 404 });
    return reponsePdf(new Uint8Array(await blob.arrayBuffer()), dossier.client);
  }

  // Approuvé : rendre depuis le snapshot gelé, déposer, versionner (sinon rollback du fichier).
  const snapshot = dossier.rapport_snapshot as Snapshot | null;
  if (!snapshot) return new Response("Aucun instantané à exporter.", { status: 409 });

  let buf: Buffer;
  try {
    buf = await rendrePdf(snapshot, dossier.statut, supabase);
  } catch (e) {
    const kind = (e as { gotenberg?: string }).gotenberg;
    if (kind === "config") {
      return new Response("Conversion PDF non configurée (GOTENBERG_URL).", { status: 503 });
    }
    return new Response(`Échec de la conversion PDF : ${(e as Error).message}`, { status: 502 });
  }

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const storagePath = `${id}/${crypto.randomUUID()}.pdf`;

  const { error: eUp } = await supabase.storage
    .from("rapports")
    .upload(storagePath, buf, { contentType: PDF_MIME });
  if (eUp) return new Response(`Échec du dépôt : ${eUp.message}`, { status: 500 });

  const { error: eRpc } = await supabase.rpc("enregistrer_export", {
    p_dossier: id,
    p_path: storagePath,
    p_sha256: sha256,
  });
  if (eRpc) {
    // Pas d'orphelin : jamais de fichier sans ligne rapport_versions.
    await supabase.storage.from("rapports").remove([storagePath]);
    return new Response(`Échec de l'enregistrement : ${eRpc.message}`, { status: 500 });
  }

  return reponsePdf(new Uint8Array(buf), dossier.client);
}
