import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createClient } from "@/lib/supabase/server";
import { libellePoste } from "@/lib/calc";
import { sommeSuperficieZonesM2 } from "@/lib/zones";
import type { Snapshot } from "@/lib/rapport";

// ponytail: export docx SYNCHRONE + dépôt Storage + versionnage (Phase 5, US-48) — c'est la
// solution retenue (pas de Trigger.dev, décision validée). Rendu DEPUIS le snapshot gelé, jamais
// du calcul vivant. SWAP MODÈLE (Phase 7) → remplacer src/templates/rapport-provisoire.docx par
// le vrai modèle Word de Luis (mêmes placeholders), cf. scripts/build-template.mjs.
// ponytail: template lu depuis le filesystem (process.cwd) — vérifier outputFileTracingIncludes au
// 1er déploiement Vercel.

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

function reponseDocx(buf: Uint8Array, client: string): Response {
  const safe = client.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);
  return new Response(buf as BodyInit, {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="rapport-${safe}.docx"`,
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
    return reponseDocx(new Uint8Array(await blob.arrayBuffer()), dossier.client);
  }

  // Approuvé : rendre depuis le snapshot gelé, déposer, versionner (sinon rollback du fichier).
  const snapshot = dossier.rapport_snapshot as Snapshot | null;
  if (!snapshot) return new Response("Aucun instantané à exporter.", { status: 409 });

  const buf = rendreDocx(snapshot, dossier.statut);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const storagePath = `${id}/${crypto.randomUUID()}.docx`;

  const { error: eUp } = await supabase.storage
    .from("rapports")
    .upload(storagePath, buf, { contentType: DOCX_MIME });
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

  return reponseDocx(new Uint8Array(buf), dossier.client);
}
