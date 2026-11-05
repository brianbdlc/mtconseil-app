import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { createClient } from "@/lib/supabase/server";
import type { Snapshot } from "@/lib/rapport";
import { donneesRender } from "@/lib/rapport-render";

// Phase 14 : PNG 1×1 transparent, repli si une photo désignée a disparu du Storage (évite de faire
// échouer tout l'export pour une image manquante — la section conditionnelle reste alignée).
const FALLBACK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

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

type DbClient = Awaited<ReturnType<typeof createClient>>;

// Phase 14 : rendu async — pré-télécharge les photos désignées (unité/plaque) du Storage, puis les
// embarque via le module image (getImage SYNCHRONE lisant une Map path→bytes). Loi 25 : les octets
// restent au Canada (Storage → Gotenberg ca-central), aucun envoi Anthropic.
async function rendreDocx(snapshot: Snapshot, statut: string, supabase: DbClient): Promise<Buffer> {
  const paths = new Set<string>();
  for (const e of snapshot.equipements ?? []) {
    if (e.photo_unite_path) paths.add(e.photo_unite_path);
    if (e.photo_plaque_path) paths.add(e.photo_plaque_path);
  }
  const images = new Map<string, Buffer>();
  for (const p of paths) {
    const { data: blob } = await supabase.storage.from("photos").download(p);
    if (blob) images.set(p, Buffer.from(await blob.arrayBuffer()));
  }

  const imageModule = new ImageModule({
    centered: false,
    getImage: (tagValue) => images.get(tagValue) ?? FALLBACK_PNG,
    getSize: () => [180, 180],
  });

  const templatePath = path.join(process.cwd(), "src/templates/rapport-provisoire.docx");
  const zip = new PizZip(readFileSync(templatePath, "binary"));
  const doc = new Docxtemplater(zip, { modules: [imageModule], paragraphLoop: true, linebreaks: true });
  doc.render(donneesRender(snapshot, statut));
  return doc.getZip().generate({ type: "nodebuffer" });
}

/**
 * Rendu du livrable PDF (Option B) : docx gelé → PDF via Gotenberg, puis fusion de l'annexe Optima
 * telle quelle. Lève une Error avec `.gotenberg` pour que l'appelant renvoie 502/503.
 */
async function rendrePdf(snapshot: Snapshot, statut: string, supabase: DbClient): Promise<Buffer> {
  const base = process.env.GOTENBERG_URL;
  if (!base) throw Object.assign(new Error("GOTENBERG_URL absent"), { gotenberg: "config" as const });

  const bufDocx = await rendreDocx(snapshot, statut, supabase);

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
