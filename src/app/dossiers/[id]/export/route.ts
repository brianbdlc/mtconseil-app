import { readFileSync } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createClient } from "@/lib/supabase/server";
import { ligneEquipement } from "@/lib/calc";

type TypeJoint = { poste: string; confirme: boolean; facteur_charge: number | null } | null;

// ponytail: export docx SYNCHRONE (Phase 1). SWAP Phase 2 → job Trigger.dev + dépôt Storage
// + versionnage (US-48 en Phase 5). SWAP MODÈLE → remplacer src/templates/rapport-provisoire.docx
// par le vrai modèle Word de Luis (mêmes placeholders), cf. scripts/build-template.mjs.
// ponytail: template lu depuis le filesystem (process.cwd) — OK en dev ; vérifier le bundling
// (outputFileTracingIncludes) au 1er déploiement Vercel.

const fmt = (n: number | null) =>
  n === null
    ? ""
    : new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: dossier } = await supabase
    .from("dossiers")
    .select("client, adresse, statut")
    .eq("id", id)
    .single();
  if (!dossier) return new Response("Dossier introuvable", { status: 404 });

  // Join type + calcul à la lecture (source unique = calc.ts). conso_kwh_an (cache) non relu.
  const { data: equipements } = await supabase
    .from("equipements")
    .select(
      "nom, puissance_valeur, puissance_unite, heures_par_an, facteur_charge, type_id, type:valeurs_defaut(poste, confirme, facteur_charge)",
    )
    .eq("dossier_id", id)
    .order("created_at", { ascending: true })
    .returns<
      {
        nom: string | null;
        puissance_valeur: number | null;
        puissance_unite: string | null;
        heures_par_an: number | null;
        facteur_charge: number | null;
        type_id: string | null;
        type: TypeJoint;
      }[]
    >();

  const templatePath = path.join(
    process.cwd(),
    "src/templates/rapport-provisoire.docx",
  );
  const zip = new PizZip(readFileSync(templatePath, "binary"));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render({
    client: dossier.client,
    adresse: dossier.adresse ?? "",
    statut: dossier.statut,
    equipements: (equipements ?? []).map((e) => ({
      nom: e.nom ?? "",
      puissance_valeur: e.puissance_valeur ?? "",
      puissance_unite: e.puissance_unite ?? "",
      conso_kwh_an: fmt(ligneEquipement(e).conso),
    })),
  });

  const buf: Buffer = doc.getZip().generate({ type: "nodebuffer" });
  const safe = dossier.client.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="rapport-${safe}.docx"`,
    },
  });
}
