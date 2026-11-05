"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  consoEquipement,
  facteurEffectif,
  normaliserSurcharge,
} from "@/lib/calc";
import { controleCompletude, type EquipementAssembleur } from "@/lib/assembleur";
import { construireSnapshot, type ModeleSnapshot, type DistributionEntree } from "@/lib/rapport";
import { SECTIONS, NARRATIVE_SECTIONS, type NarrativeSection } from "@/lib/statuts";
import { numFr } from "@/lib/num";
import { lirePlaque, type ImageEntree } from "@/lib/plaque";
import { lireFacture, totalFacturesKwh, type Facture } from "@/lib/factures";
import { type Zone } from "@/lib/zones";
import { type Revision } from "@/lib/revisions";
import {
  extraireFichesValidees,
  redigerDescriptionInstallations,
} from "@/lib/redaction";
import { envoyerCourriel, lienDossier } from "@/lib/courriel";
import { DUREE_VERROU_MS, etatVerrou, type EtatVerrou } from "@/lib/verrou";

function strOrNull(v: FormDataEntryValue | null): string | null {
  return String(v ?? "").trim() || null;
}

// Garde-fou capacité (miroir du check is_admin déjà utilisé) : la RLS est le vrai rempart,
// ceci donne un message clair avant l'écriture. cap ∈ 'modifier'|'valider'|'exporter'.
async function exige(cap: "modifier" | "valider" | "exporter") {
  const supabase = await createClient();
  const { data: ok } = await supabase.rpc(`peut_${cap}`);
  if (!ok) {
    const quoi =
      cap === "modifier" ? "modifier" : cap === "valider" ? "valider" : "exporter";
    throw new Error(`Droit insuffisant : vous ne pouvez pas ${quoi} (voir un administrateur).`);
  }
}

type DbClient = Awaited<ReturnType<typeof createClient>>;

// Notifie l'ingénieur du dossier (best-effort). Join email via la FK dossiers_ingenieur_id_fkey.
async function notifierIngenieur(
  supabase: DbClient,
  dossierId: string,
  sujet: (client: string) => string,
  html: (client: string, lien: string) => string,
) {
  const { data: d } = await supabase
    .from("dossiers")
    .select("client, ingenieur:profiles!dossiers_ingenieur_id_fkey(email)")
    .eq("id", dossierId)
    .single();
  if (!d) return;
  const ing = d.ingenieur as unknown as { email: string | null } | { email: string | null }[] | null;
  const email = (Array.isArray(ing) ? ing[0]?.email : ing?.email) ?? null;
  await envoyerCourriel({ to: email, sujet: sujet(d.client), html: html(d.client, lienDossier(dossierId)) });
}

// Champs IA validables champ par champ (US-17/18). marque/modele/annee ont leur propre colonne ;
// puissance utilise puissance_valeur/unite existantes (Phase 1).
const CHAMPS_IA = ["marque", "modele", "puissance", "annee"] as const;
type ChampIA = (typeof CHAMPS_IA)[number];

function mediaTypeDepuisChemin(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf"; // factures souvent en PDF
  return "image/jpeg"; // défaut : les HEIC sont convertis en JPEG avant upload
}

export async function createDossier(formData: FormData) {
  const client = String(formData.get("client") ?? "").trim();
  if (!client) throw new Error("Le nom du client est obligatoire.");
  const adresse = String(formData.get("adresse") ?? "").trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dossiers")
    .insert({ client, adresse })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  redirect(`/dossiers/${data.id}`);
}

export async function createEquipement(formData: FormData) {
  await exige("modifier");
  const dossierId = String(formData.get("dossier_id"));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipements")
    .insert({ dossier_id: dossierId, nom: "Nouvel équipement" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  redirect(`/dossiers/${dossierId}/equipements/${data.id}`);
}

export async function updateEquipement(formData: FormData) {
  await exige("modifier");
  const id = String(formData.get("id"));
  const dossierId = String(formData.get("dossier_id"));
  const nom = strOrNull(formData.get("nom"));
  const puissanceUnite = String(formData.get("puissance_unite") ?? "");
  const puissanceValeur = numFr(formData.get("puissance_valeur"));
  const heuresParAn = numFr(formData.get("heures_par_an"));
  const surcharge = numFr(formData.get("facteur_charge")); // surcharge saisie (Phase 3)
  const typeId = strOrNull(formData.get("type_id")); // vide = hors catégorie
  const raison = strOrNull(formData.get("facteur_charge_raison"));
  // Champs IA saisissables (US-17/18) + champs ingénieur (US-19/20).
  const marque = strOrNull(formData.get("marque"));
  const modele = strOrNull(formData.get("modele"));
  const annee = numFr(formData.get("annee"));
  const etat = strOrNull(formData.get("etat"));
  const emplacement = strOrNull(formData.get("emplacement"));
  const dessert = strOrNull(formData.get("dessert"));
  const rendement = numFr(formData.get("rendement"));
  const rendementSource = strOrNull(formData.get("rendement_source"));

  const supabase = await createClient();

  // Facteur du type (pour normaliser la surcharge et calculer le facteur effectif).
  let facteurType: number | null = null;
  if (typeId) {
    const { data: t } = await supabase
      .from("valeurs_defaut")
      .select("facteur_charge")
      .eq("id", typeId)
      .single();
    facteurType = t?.facteur_charge ?? null;
  }

  // Une surcharge égale au défaut (ou vide) n'est pas une surcharge. Surcharge d'un type => raison.
  const { facteurCharge, raisonRequise } = normaliserSurcharge(surcharge, facteurType);
  if (typeId && raisonRequise && !raison) {
    throw new Error("Une surcharge du facteur de charge exige une raison.");
  }

  // LE CODE calcule (source unique = calc.ts). conso_kwh_an = cache seulement (relu nulle part en Phase 3).
  const fe = facteurEffectif({ typeId, facteurType, surcharge: facteurCharge });
  const conso = consoEquipement({
    puissanceValeur,
    puissanceUnite: puissanceUnite || null,
    heuresParAn,
    facteurEffectif: fe,
  });

  // On lit l'état courant pour ne valider QUE les champs IA réellement modifiés par l'ingénieur
  // (saisie manuelle). Un champ IA inchangé garde son état validé/confiance => jamais de validation
  // en bloc sur simple enregistrement du formulaire.
  const { data: actuel } = await supabase
    .from("equipements")
    .select("marque, modele, annee, puissance_valeur, puissance_unite")
    .eq("id", id)
    .single();

  const update: Record<string, unknown> = {
    nom,
    type_id: typeId,
    facteur_charge_raison: facteurCharge !== null ? raison : null,
    puissance_valeur: puissanceValeur,
    puissance_unite: puissanceUnite || null,
    heures_par_an: heuresParAn,
    facteur_charge: facteurCharge,
    conso_kwh_an: conso,
    marque,
    modele,
    annee,
    etat,
    emplacement,
    dessert,
    rendement,
    rendement_source: rendementSource,
  };

  // Saisie manuelle d'un champ IA => validé=true + confiance effacée.
  if (actuel) {
    if (marque !== (actuel.marque ?? null)) {
      update.marque_validated = true;
      update.marque_confiance = null;
    }
    if (modele !== (actuel.modele ?? null)) {
      update.modele_validated = true;
      update.modele_confiance = null;
    }
    if (annee !== (actuel.annee ?? null)) {
      update.annee_validated = true;
      update.annee_confiance = null;
    }
    if (
      puissanceValeur !== (actuel.puissance_valeur ?? null) ||
      (puissanceUnite || null) !== (actuel.puissance_unite ?? null)
    ) {
      update.puissance_validated = true;
      update.puissance_confiance = null;
    }
  }

  const { error } = await supabase.from("equipements").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}`);
  redirect(`/dossiers/${dossierId}`);
}

/**
 * Confirme un groupe de photos et l'assigne à un équipement (US-13) : crée l'équipement si besoin,
 * puis pose equipement_id + nom_affichage sur chaque photo du groupe (confirmer + assigner en une étape).
 */
export async function assignerGroupe(input: {
  dossierId: string;
  equipementId?: string | null;
  nouvelEquipementNom?: string | null;
  photos: { id: string; nom_affichage: string | null }[];
}) {
  await exige("modifier");
  const supabase = await createClient();

  let equipementId = input.equipementId ?? null;
  if (!equipementId) {
    const { data, error } = await supabase
      .from("equipements")
      .insert({
        dossier_id: input.dossierId,
        nom: input.nouvelEquipementNom?.trim() || "Nouvel équipement",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    equipementId = data.id;
  }

  for (const ph of input.photos) {
    const { error } = await supabase
      .from("photos")
      .update({ equipement_id: equipementId, nom_affichage: ph.nom_affichage?.trim() || null })
      .eq("id", ph.id);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/dossiers/${input.dossierId}/photos`);
  revalidatePath(`/dossiers/${input.dossierId}`);
}

/**
 * Gate Loi 25 : le câblage de l'appel Claude existe, mais il est déclenché EXPLICITEMENT par
 * l'ingénieur (ce bouton). À N'UTILISER QUE sur des photos anonymisées tant que Luis n'a pas donné
 * son accord écrit pour l'envoi de photos de chantier à un tiers (API Anthropic). La saisie manuelle
 * fonctionne sans l'IA.
 *
 * Écrit SEULEMENT les champs non-null proposés, avec *_confiance + *_validated=false
 * (un champ incertain reste vide). conso_kwh_an reste écrite par le code (inchangée).
 */
export async function lirePlaqueAction(equipementId: string, dossierId: string) {
  // Garde-fou Loi 25 : bloqué par défaut. N'autoriser (ALLOW_PLAQUE_AI=true, server-only) que pour
  // tester sur des photos anonymisées, tant que Luis n'a pas donné son accord écrit.
  if (process.env.ALLOW_PLAQUE_AI !== "true") {
    throw new Error(
      "Lecture de plaque désactivée (Loi 25) : l'envoi de photos à Anthropic est bloqué tant que Luis n'a pas donné son accord écrit. Mettre ALLOW_PLAQUE_AI=true (photos anonymisées uniquement) pour tester.",
    );
  }

  const supabase = await createClient();

  const { data: photos, error: ePhotos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("equipement_id", equipementId);
  if (ePhotos) throw new Error(ePhotos.message);
  if (!photos || photos.length === 0) throw new Error("Aucune photo assignée à cet équipement.");

  // Télécharge les octets depuis Storage (session de l'ingénieur, RLS authenticated) → base64.
  const images: ImageEntree[] = [];
  for (const ph of photos) {
    const { data: blob, error } = await supabase.storage.from("photos").download(ph.storage_path);
    if (error) throw new Error(error.message);
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    images.push({ base64, mediaType: mediaTypeDepuisChemin(ph.storage_path) });
  }

  const p = await lirePlaque(images);

  const update: Record<string, unknown> = {};
  if (p.marque !== null) {
    update.marque = p.marque;
    update.marque_confiance = p.confiance.marque;
    update.marque_validated = false;
  }
  if (p.modele !== null) {
    update.modele = p.modele;
    update.modele_confiance = p.confiance.modele;
    update.modele_validated = false;
  }
  if (p.puissance_valeur !== null) {
    update.puissance_valeur = p.puissance_valeur;
    update.puissance_unite = p.puissance_unite;
    update.puissance_confiance = p.confiance.puissance;
    update.puissance_validated = false;
  }
  if (p.annee !== null) {
    update.annee = p.annee;
    update.annee_confiance = p.confiance.annee;
    update.annee_validated = false;
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("equipements").update(update).eq("id", equipementId);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/dossiers/${dossierId}/equipements/${equipementId}`);
}

/** Validation champ par champ (US-18), jamais en bloc : pose {champ}_validated = true. */
export async function validerChamp(equipementId: string, dossierId: string, champ: ChampIA) {
  await exige("valider");
  if (!CHAMPS_IA.includes(champ)) throw new Error(`Champ inconnu : ${champ}`);
  const supabase = await createClient();
  const { error } = await supabase
    .from("equipements")
    .update({ [`${champ}_validated`]: true })
    .eq("id", equipementId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dossiers/${dossierId}/equipements/${equipementId}`);
}

// ───────────────────────── Factures (Phase 6, US-32) ─────────────────────────
// L'IA LIT/PROPOSE (confirme=false), le CODE vérifie, l'ingénieur CONFIRME. Les factures
// confirmées alimentent la cohérence (assembleur). Saisie manuelle = chemin par défaut sans IA.

/**
 * Gate Loi 25 (miroir lirePlaqueAction) : l'envoi d'une facture à Anthropic est bloqué par défaut.
 * N'autoriser (ALLOW_FACTURE_AI=true, server-only) que pour tester sur des factures ANONYMISÉES.
 * Écrit les champs proposés avec source='ia', conso_confiance, confirme=false (à revoir par l'ingénieur).
 */
export async function lireFactureAction(factureId: string, dossierId: string) {
  if (process.env.ALLOW_FACTURE_AI !== "true") {
    throw new Error(
      "Lecture de facture désactivée (Loi 25) : l'envoi à Anthropic est bloqué tant que Luis n'a pas donné son accord écrit. Mettre ALLOW_FACTURE_AI=true (factures anonymisées uniquement) pour tester.",
    );
  }

  const supabase = await createClient();

  const { data: facture, error: eFacture } = await supabase
    .from("factures")
    .select("storage_path")
    .eq("id", factureId)
    .single();
  if (eFacture) throw new Error(eFacture.message);
  if (!facture?.storage_path) throw new Error("Aucun fichier à lire pour cette facture.");

  const { data: blob, error: eDl } = await supabase.storage.from("factures").download(facture.storage_path);
  if (eDl) throw new Error(eDl.message);
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  const p = await lireFacture({ base64, mediaType: mediaTypeDepuisChemin(facture.storage_path) });

  // Écrit toute la proposition (y compris les null : un champ non lu reste vide). confirme=false.
  const { error } = await supabase
    .from("factures")
    .update({
      energie: p.energie,
      fournisseur: p.fournisseur,
      periode_debut: p.periode_debut,
      periode_fin: p.periode_fin,
      conso_valeur: p.conso_valeur,
      conso_unite: p.conso_unite,
      conso_confiance: p.confiance,
      source: "ia",
      confirme: false,
    })
    .eq("id", factureId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}/factures`);
}

/**
 * Création / édition manuelle d'une facture (saisie = repli sans IA). confirme suit la case :
 * une facture saisie à la main est confirmée par défaut (l'ingénieur l'a renseignée).
 * Le CHECK factures_confirme_complet garantit qu'une confirmée porte energie + conso + unité.
 */
export async function updateFacture(formData: FormData) {
  await exige("modifier");
  const id = strOrNull(formData.get("id")); // null = création
  const dossierId = String(formData.get("dossier_id"));
  const row = {
    energie: strOrNull(formData.get("energie")),
    fournisseur: strOrNull(formData.get("fournisseur")),
    periode_debut: strOrNull(formData.get("periode_debut")),
    periode_fin: strOrNull(formData.get("periode_fin")),
    conso_valeur: numFr(formData.get("conso_valeur")),
    conso_unite: strOrNull(formData.get("conso_unite")),
    confirme: formData.get("confirme") === "on",
    source: "manuel" as const,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("factures").update(row).eq("id", id)
    : await supabase.from("factures").insert({ ...row, dossier_id: dossierId });
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}/factures`);
}

/** Confirme une proposition IA après revue de l'ingénieur (US-32). */
export async function confirmerFacture(factureId: string, dossierId: string) {
  await exige("modifier");
  const supabase = await createClient();
  const { error } = await supabase.from("factures").update({ confirme: true }).eq("id", factureId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dossiers/${dossierId}/factures`);
}

// ───────────────────────── Annexe Optima (Phase 12, US-50/US-51) ─────────────────────────
// L'ingénieur TÉLÉVERSE le PDF Optima (upload Storage côté navigateur, miroir factures) et le
// CONFIRME comme les autres parties. AUCUN appel IA, AUCUNE extraction, AUCUN recalcul : le PDF
// est fusionné tel quel en annexe du rapport final (Option B). Un seul PDF par dossier.

/** Pose le chemin + sha256 du PDF Optima et dé-confirme (re-upload = nouvelle pièce à revoir). */
export async function enregistrerOptima(dossierId: string, path: string, sha256: string) {
  await exige("modifier");
  const supabase = await createClient();
  const { error } = await supabase
    .from("dossiers")
    .update({ optima_path: path, optima_sha256: sha256, optima_confirme: false })
    .eq("id", dossierId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath(`/dossiers/${dossierId}/rapport`);
}

/** Confirme le rapport Optima (US-50). Aucune lecture, aucune extraction, aucun recalcul. */
export async function confirmerOptima(dossierId: string) {
  await exige("modifier");
  const supabase = await createClient();
  const { error } = await supabase
    .from("dossiers")
    .update({ optima_confirme: true })
    .eq("id", dossierId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath(`/dossiers/${dossierId}/rapport`);
}

// ───────────────────────── Zones du bâtiment (Phase 9, US-53) ─────────────────────────
// Saisie INGÉNIEUR, purement DESCRIPTIVE : les zones n'entrent dans AUCUN calcul (l'intensité
// reste basée sur la superficie TOTALE, Phase 3). CRUD inline dans la page dossier.

/** Création / édition d'une zone (create si id vide). */
export async function updateZone(formData: FormData) {
  await exige("modifier");
  const id = strOrNull(formData.get("id"));
  const dossierId = String(formData.get("dossier_id"));
  const row = {
    nom: strOrNull(formData.get("nom")),
    superficie: numFr(formData.get("superficie")),
    unite: strOrNull(formData.get("unite")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("zones").update(row).eq("id", id)
    : await supabase.from("zones").insert({ ...row, dossier_id: dossierId });
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}`);
}

export async function supprimerZone(zoneId: string, dossierId: string) {
  await exige("modifier");
  const supabase = await createClient();
  const { error } = await supabase.from("zones").delete().eq("id", zoneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dossiers/${dossierId}`);
}

// ───────────────────────── Distribution électrique (Phase 10, US-54) ─────────────────────────
// Saisie INGÉNIEUR pure, purement DESCRIPTIVE : aucune valeur calculée ni devinée. Le nombre
// d'entrées est dérivé du nombre de lignes. CRUD inline dans la page dossier (patron zones).

/** Création / édition d'une entrée électrique (create si id vide). */
export async function updateDistribution(formData: FormData) {
  await exige("modifier");
  const id = strOrNull(formData.get("id"));
  const dossierId = String(formData.get("dossier_id"));
  const row = {
    amperes: numFr(formData.get("amperes")),
    tension: numFr(formData.get("tension")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("distribution_electrique").update(row).eq("id", id)
    : await supabase.from("distribution_electrique").insert({ ...row, dossier_id: dossierId });
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}`);
}

export async function supprimerDistribution(entreeId: string, dossierId: string) {
  await exige("modifier");
  const supabase = await createClient();
  const { error } = await supabase.from("distribution_electrique").delete().eq("id", entreeId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dossiers/${dossierId}`);
}

// ───────────────────────── Registre des révisions (Phase 11, US-59) ─────────────────────────
// Saisie INGÉNIEUR pure, purement DESCRIPTIVE : aucun calcul. `numero` = texte libre, `ordre` = tri.
// CRUD inline dans la page dossier (patron distribution). Éditer n'invalide PAS le snapshot (voulu :
// le registre se complète souvent après l'export).

/** Création / édition d'une révision (create si id vide). */
export async function updateRevision(formData: FormData) {
  await exige("modifier");
  const id = strOrNull(formData.get("id"));
  const dossierId = String(formData.get("dossier_id"));
  const row = {
    numero: strOrNull(formData.get("numero")),
    date: strOrNull(formData.get("date")),
    description: strOrNull(formData.get("description")),
    ordre: numFr(formData.get("ordre")) ?? 0,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("revisions").update(row).eq("id", id)
    : await supabase.from("revisions").insert({ ...row, dossier_id: dossierId });
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}`);
}

export async function supprimerRevision(revisionId: string, dossierId: string) {
  await exige("modifier");
  const supabase = await createClient();
  const { error } = await supabase.from("revisions").delete().eq("id", revisionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dossiers/${dossierId}`);
}

/**
 * Pré-remplit le registre depuis les exports déjà faits (rapport_versions). Idempotent :
 * insère une ligne par version absente (dédoublonnage sur `numero`). Bouton manuel, pas de synchro auto.
 */
export async function prefillRevisions(dossierId: string) {
  await exige("modifier");
  const supabase = await createClient();

  const [{ data: versions }, { data: existantes }] = await Promise.all([
    supabase.from("rapport_versions").select("version, exporte_le").eq("dossier_id", dossierId),
    supabase.from("revisions").select("numero").eq("dossier_id", dossierId),
  ]);

  const dejaLa = new Set((existantes ?? []).map((r) => r.numero));
  const aInserer = (versions ?? [])
    .filter((v) => !dejaLa.has(String(v.version)))
    .map((v) => ({
      dossier_id: dossierId,
      numero: String(v.version),
      date: v.exporte_le ? String(v.exporte_le).slice(0, 10) : null,
      description: "",
      ordre: v.version,
    }));

  if (aInserer.length) {
    const { error } = await supabase.from("revisions").insert(aInserer);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/dossiers/${dossierId}`);
}

// ───────────────────────── Sections narratives (Phase 7, US-41/42/43) ─────────────────────────
// L'IA RÉDIGE un brouillon (source='ia', valide=false) sous validation ; sinon saisie à la main.
// L'assembleur ne lit QUE valide=true. upsert sur (dossier_id, section).

/** Saisie/édition manuelle d'une section → source='humain'. Modifier un brouillon le dévalide. */
export async function updateTexteSection(formData: FormData) {
  await exige("modifier");
  const dossierId = String(formData.get("dossier_id"));
  const section = String(formData.get("section")) as NarrativeSection;
  if (!NARRATIVE_SECTIONS.some((s) => s.cle === section)) {
    throw new Error(`Section inconnue : ${section}`);
  }
  const texte = strOrNull(formData.get("texte"));
  const valide = formData.get("valide") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("rapport_textes")
    .upsert({ dossier_id: dossierId, section, texte, source: "humain", valide }, { onConflict: "dossier_id,section" });
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}/rapport`);
}

/** Marque une section comme validée (entre dans le snapshot). */
export async function validerTexteSection(dossierId: string, section: NarrativeSection) {
  await exige("valider");
  const supabase = await createClient();
  const { error } = await supabase
    .from("rapport_textes")
    .update({ valide: true })
    .eq("dossier_id", dossierId)
    .eq("section", section);
  if (error) throw new Error(error.message);
  revalidatePath(`/dossiers/${dossierId}/rapport`);
}

/**
 * Gate Loi 25 (miroir lirePlaqueAction/lireFactureAction) : l'envoi de données à Anthropic est
 * bloqué par défaut. N'autoriser (ALLOW_REDACTION_AI=true, server-only) que sur des données
 * synthétiques tant que Luis n'a pas donné son accord écrit. La saisie manuelle fonctionne sans IA.
 * Écrit un brouillon source='ia', valide=false (à revoir par l'ingénieur).
 */
export async function redigerSection(dossierId: string, section: NarrativeSection) {
  if (process.env.ALLOW_REDACTION_AI !== "true") {
    throw new Error(
      "Rédaction IA désactivée (Loi 25) : l'envoi à Anthropic est bloqué tant que Luis n'a pas donné son accord écrit. Mettre ALLOW_REDACTION_AI=true (données synthétiques uniquement) pour tester.",
    );
  }
  const meta = NARRATIVE_SECTIONS.find((s) => s.cle === section);
  if (!meta || meta.source !== "ia") throw new Error(`Section non rédigeable par l'IA : ${section}`);

  const supabase = await createClient();

  // Phase 13 : seule `description_installations` est rédigée par l'IA (mesures_mise_en_forme retirée).
  const { data: eqs } = await supabase
    .from("equipements")
    .select(
      "nom, marque, marque_validated, modele, modele_validated, puissance_valeur, puissance_unite, puissance_validated, annee, annee_validated, etat, emplacement, dessert",
    )
    .eq("dossier_id", dossierId);
  const texte = await redigerDescriptionInstallations(extraireFichesValidees(eqs ?? []));

  const { error } = await supabase
    .from("rapport_textes")
    .upsert({ dossier_id: dossierId, section, texte, source: "ia", valide: false }, { onConflict: "dossier_id,section" });
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}/rapport`);
}

// ───────────────────────── Modèle de rapport (Phase 7, admin-only, versionné) ─────────────────────────

/** Édite les textes fixes du modèle et incrémente version (mutable + compteur). RLS is_admin(). */
export async function updateTemplate(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();

  const { data: actuel } = await supabase
    .from("report_templates")
    .select("version")
    .eq("id", id)
    .maybeSingle();
  if (!actuel) throw new Error("Modèle introuvable.");

  const { data: rows, error } = await supabase
    .from("report_templates")
    .update({
      methodologie: strOrNull(formData.get("methodologie")),
      norme_ashrae: strOrNull(formData.get("norme_ashrae")),
      risques_sse: strOrNull(formData.get("risques_sse")),
      version: actuel.version + 1,
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) {
    throw new Error("Écriture refusée : la modification du modèle est réservée aux administrateurs.");
  }

  revalidatePath("/admin/modele");
  redirect("/admin/modele");
}

// ───────────────────────── Valeurs par défaut (US-22→24) ─────────────────────────
// CRUD ouvert à tout ingénieur (RLS) ; le trigger vd_reset force confirme=false pour un
// ingénieur connecté. Journalisé par log_change.

export async function createValeurDefaut(formData: FormData) {
  const type = strOrNull(formData.get("type"));
  const poste = strOrNull(formData.get("poste"));
  const facteurCharge = numFr(formData.get("facteur_charge"));
  if (!type) throw new Error("Le nom du type est obligatoire.");
  if (!poste) throw new Error("Le poste est obligatoire.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("valeurs_defaut")
    .insert({ type, poste, facteur_charge: facteurCharge });
  if (error) throw new Error(error.message);

  revalidatePath("/valeurs-defaut");
  redirect("/valeurs-defaut");
}

export async function updateValeurDefaut(formData: FormData) {
  const id = String(formData.get("id"));
  const type = strOrNull(formData.get("type"));
  const poste = strOrNull(formData.get("poste"));
  const facteurCharge = numFr(formData.get("facteur_charge"));
  if (!type) throw new Error("Le nom du type est obligatoire.");
  if (!poste) throw new Error("Le poste est obligatoire.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("valeurs_defaut")
    .update({ type, poste, facteur_charge: facteurCharge })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/valeurs-defaut");
  redirect("/valeurs-defaut");
}

/**
 * Confirme une valeur par défaut directement (US-24), réservé à l'admin. L'autre chemin de
 * confirmation est l'approbation d'un rapport (approuver_dossier). Journalisé par log_valeurs_defaut.
 */
export async function confirmerValeurDefaut(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();

  const { data: estAdmin } = await supabase.rpc("is_admin");
  if (!estAdmin) throw new Error("Confirmation réservée aux administrateurs.");

  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("valeurs_defaut")
    .update({ confirme: true, confirme_par: user.user?.id ?? null, confirme_le: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/valeurs-defaut");
  redirect("/valeurs-defaut");
}

export async function deleteValeurDefaut(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();

  // Message clair ; la FK `on delete restrict` est le vrai garde-fou.
  const { count } = await supabase
    .from("equipements")
    .select("id", { count: "exact", head: true })
    .eq("type_id", id);
  if (count && count > 0) {
    throw new Error(`Type utilisé par ${count} équipement(s) : impossible de le supprimer.`);
  }

  const { error } = await supabase.from("valeurs_defaut").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/valeurs-defaut");
  redirect("/valeurs-defaut");
}

// ───────────────────────── Paramètres (facteur gaz, admin-only) ─────────────────────────

export async function updateParametre(formData: FormData) {
  const cle = String(formData.get("cle"));
  const valeur = numFr(formData.get("valeur"));
  const source = strOrNull(formData.get("source"));
  const confirmeCoche = formData.get("confirme") === "on";

  const supabase = await createClient();

  // Lecture courante (SELECT lisible par tous) : changer la valeur repasse à "à confirmer".
  const { data: actuel } = await supabase
    .from("parametres")
    .select("valeur")
    .eq("cle", cle)
    .maybeSingle();

  const valeurChangee = (actuel?.valeur ?? null) !== valeur;
  const confirme = valeurChangee ? false : confirmeCoche;

  const { data: rows, error } = await supabase
    .from("parametres")
    .update({ valeur, source, confirme }) // unité figée par le seed, jamais modifiée ici
    .eq("cle", cle)
    .select("id");
  if (error) throw new Error(error.message);

  // 0 ligne : distinguer refus RLS (la clé existe) de clé absente.
  if (!rows || rows.length === 0) {
    if (actuel) {
      throw new Error("Écriture refusée : la modification des paramètres est réservée aux administrateurs.");
    }
    throw new Error(`Paramètre introuvable : ${cle}.`);
  }

  revalidatePath("/admin/parametres");
  redirect("/admin/parametres");
}

// ───────────────────────── Description du bâtiment (US-25→29) ─────────────────────────

export async function updateBatiment(formData: FormData) {
  await exige("modifier");
  const dossierId = String(formData.get("dossier_id"));
  const supabase = await createClient();

  const { error } = await supabase
    .from("dossiers")
    .update({
      superficie_valeur: numFr(formData.get("superficie_valeur")),
      superficie_unite: strOrNull(formData.get("superficie_unite")),
      annee_construction: numFr(formData.get("annee_construction")),
      usage: strOrNull(formData.get("usage")),
      gaz_quantite: numFr(formData.get("gaz_quantite")),
      gaz_unite: strOrNull(formData.get("gaz_unite")),
      gaz_periode: strOrNull(formData.get("gaz_periode")),
    })
    .eq("id", dossierId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}`);
  redirect(`/dossiers/${dossierId}`);
}

// ───────────────────────── Soumission + gel du snapshot (Phase 5) ─────────────────────────
// Soumission gardée par la complétude (controleCompletude). À la soumission, on GÈLE le snapshot
// (US-44) : le rapport affiché en soumis/approuve/exporte vient de là, plus du calcul vivant.
// Gère brouillon→soumis, a_corriger→soumis et soumis→soumis (re-soumission après retour auto).

export async function soumettreDossier(formData: FormData) {
  const dossierId = String(formData.get("dossier_id"));
  const raison = strOrNull(formData.get("raison"));
  const supabase = await createClient();

  const { data: dossier, error: eDossier } = await supabase
    .from("dossiers")
    .select(
      "client, adresse, superficie_valeur, superficie_unite, annee_construction, usage, gaz_quantite, gaz_unite, gaz_periode, optima_path, optima_sha256, optima_confirme",
    )
    .eq("id", dossierId)
    .single();
  if (eDossier) throw new Error(eDossier.message);

  // Mêmes colonnes que la page rapport, AVEC les champs IA (confiance/validated) pour la règle 1.
  const { data: equipements } = await supabase
    .from("equipements")
    .select(
      "id, nom, puissance_valeur, puissance_unite, heures_par_an, facteur_charge, type_id, type:valeurs_defaut(poste, confirme, facteur_charge), marque_confiance, marque_validated, modele_confiance, modele_validated, puissance_confiance, puissance_validated, annee_confiance, annee_validated",
    )
    .eq("dossier_id", dossierId)
    .returns<EquipementAssembleur[]>();

  const { data: paramGaz } = await supabase
    .from("parametres")
    .select("valeur")
    .eq("cle", "facteur_conversion_gaz")
    .maybeSingle();

  // Factures confirmées → total gelé dans le snapshot (cohérence du rapport figé).
  const { data: factures } = await supabase
    .from("factures")
    .select("id, energie, periode_debut, periode_fin, conso_valeur, conso_unite, confirme")
    .eq("dossier_id", dossierId)
    .returns<Facture[]>();
  const facteurGaz = paramGaz?.valeur ?? null;

  // Phase 7/13 : sections narratives VALIDÉES (dont sommaire + mesures_etudiees, texte libre) +
  // textes fixes du modèle courant. Plus de mesures/ROI calculés (Phase 13).
  const { data: textesRows } = await supabase
    .from("rapport_textes")
    .select("section, texte")
    .eq("dossier_id", dossierId)
    .eq("valide", true);
  const textes: Partial<Record<NarrativeSection, string>> = {};
  for (const t of textesRows ?? []) {
    if (t.texte) textes[t.section as NarrativeSection] = t.texte;
  }

  const { data: modeleRow } = await supabase
    .from("report_templates")
    .select("methodologie, norme_ashrae, risques_sse, version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const modele: ModeleSnapshot = modeleRow ?? {
    methodologie: null,
    norme_ashrae: null,
    risques_sse: null,
    version: 0,
  };

  // Phase 9 : zones descriptives, gelées dans le snapshot (hors calcul).
  const { data: zones } = await supabase
    .from("zones")
    .select("nom, superficie, unite")
    .eq("dossier_id", dossierId)
    .order("ordre", { ascending: true })
    .returns<Zone[]>();

  // Phase 10 : distribution électrique descriptive, gelée dans le snapshot (hors calcul).
  const { data: distribution } = await supabase
    .from("distribution_electrique")
    .select("amperes, tension")
    .eq("dossier_id", dossierId)
    .order("ordre", { ascending: true })
    .returns<DistributionEntree[]>();

  // Phase 11 : registre des révisions descriptif, gelé dans le snapshot (hors calcul).
  const { data: revisions } = await supabase
    .from("revisions")
    .select("numero, date, description, ordre")
    .eq("dossier_id", dossierId)
    .order("ordre", { ascending: true })
    .returns<Revision[]>();

  const eqs = equipements ?? [];
  const completude = controleCompletude(eqs, dossier);

  const { data: user } = await supabase.auth.getUser();
  const snapshot = construireSnapshot(dossier, eqs, {
    facteurGaz,
    totalFacturesKwh: totalFacturesKwh(factures ?? [], facteurGaz),
    textes,
    modele,
    zones: zones ?? [],
    distribution: distribution ?? [],
    revisions: revisions ?? [],
    // Phase 12 : annexe Optima figée telle quelle (seulement si confirmée + présente).
    optima:
      dossier.optima_confirme && dossier.optima_path
        ? { path: dossier.optima_path, sha256: dossier.optima_sha256 ?? "" }
        : undefined,
  });

  const update: Record<string, unknown> = {
    statut: "soumis",
    rapport_snapshot: snapshot,
    snapshot_perime: false,
    soumis_par: user.user?.id ?? null,
    soumis_le: new Date().toISOString(),
    commentaires: null, // re-soumission : efface le fil de corrections précédent
  };

  if (completude.bloquant) {
    // Incomplet : réservé à un admin, avec une raison écrite (tracée par log_change).
    const { data: estAdmin } = await supabase.rpc("is_admin");
    if (!estAdmin) {
      throw new Error("Soumission bloquée : corrigez les points manquants ou demandez à un administrateur.");
    }
    if (!raison) {
      throw new Error("Une soumission incomplète exige une raison écrite.");
    }
    update.soumission_incomplete_raison = raison;
    update.soumission_incomplete_par = user.user?.id ?? null;
  }

  const { error } = await supabase.from("dossiers").update(update).eq("id", dossierId);
  if (error) throw new Error(error.message);

  // Notifier les admins actifs (best-effort). Lien vers le dossier.
  const { data: admins } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .eq("actif", true);
  const lien = lienDossier(dossierId);
  for (const a of admins ?? []) {
    await envoyerCourriel({
      to: a.email,
      sujet: `Dossier ${dossier.client} soumis`,
      html: `<p>Le dossier <strong>${dossier.client}</strong> a été soumis pour approbation.</p><p><a href="${lien}">Ouvrir le dossier</a></p>`,
    });
  }

  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath(`/dossiers/${dossierId}/rapport`);
  redirect(`/dossiers/${dossierId}/rapport`);
}

// ───────────────────────── Approbation / renvoi (Phase 5, US-45→47) ─────────────────────────

/**
 * Approbation atomique via RPC (security definer). Confirme en même temps les valeurs par défaut
 * non confirmées utilisées par le SNAPSHOT (effet GLOBAL : la table est partagée). La RPC refuse
 * si non-admin, dossier non soumis, périmé, ou si une valeur a changé depuis la soumission.
 */
export async function approuverDossier(dossierId: string, valeurIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approuver_dossier", {
    p_dossier: dossierId,
    p_valeurs: valeurIds,
  });
  if (error) throw new Error(error.message);

  await notifierIngenieur(
    supabase,
    dossierId,
    (client) => `Dossier ${client} approuvé`,
    (client, lien) =>
      `<p>Votre dossier <strong>${client}</strong> a été approuvé.</p><p><a href="${lien}">Ouvrir le dossier</a></p>`,
  );

  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath(`/dossiers/${dossierId}/rapport`);
  redirect(`/dossiers/${dossierId}/rapport`);
}

/** Renvoi « À corriger » (admin) : commentaires par section (liste fixe SECTIONS), bornés. */
export async function renvoyerDossier(dossierId: string, commentaires: Record<string, string>) {
  const supabase = await createClient();

  const { data: estAdmin } = await supabase.rpc("is_admin");
  if (!estAdmin) throw new Error("Renvoi à corriger réservé aux administrateurs.");

  // Valider les clés contre SECTIONS et borner la longueur (A11).
  const propre: Record<string, string> = {};
  for (const [section, texte] of Object.entries(commentaires)) {
    if (!SECTIONS.includes(section as (typeof SECTIONS)[number])) continue;
    const t = texte.trim();
    if (!t) continue;
    if (t.length > 4000) throw new Error(`Commentaire « ${section} » trop long (max 4000 caractères).`);
    propre[section] = t;
  }

  const { error } = await supabase
    .from("dossiers")
    .update({ statut: "a_corriger", commentaires: propre })
    .eq("id", dossierId);
  if (error) throw new Error(error.message);

  await notifierIngenieur(
    supabase,
    dossierId,
    (client) => `Dossier ${client} à corriger`,
    (client, lien) =>
      `<p>Votre dossier <strong>${client}</strong> est renvoyé pour correction. Les commentaires sont consultables dans l'application.</p><p><a href="${lien}">Ouvrir le dossier</a></p>`,
  );

  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath(`/dossiers/${dossierId}/rapport`);
  redirect(`/dossiers/${dossierId}/rapport`);
}

// ───────────────────────── Gestion des comptes (Phase 8, admin) ─────────────────────────
// Édite role/actif/droits d'un profil existant. RLS profiles_update = is_admin() (vrai rempart).
// Pas de création de compte in-app (pas de service-role) : nouveaux comptes via dashboard Supabase.

export async function majCompte(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("profiles")
    .update({
      role: formData.get("role") === "admin" ? "admin" : "engineer",
      actif: formData.get("actif") === "on",
      peut_modifier: formData.get("peut_modifier") === "on",
      peut_valider: formData.get("peut_valider") === "on",
      peut_exporter: formData.get("peut_exporter") === "on",
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) {
    throw new Error("Écriture refusée : la gestion des comptes est réservée aux administrateurs.");
  }
  revalidatePath("/admin/comptes");
  redirect("/admin/comptes");
}

// ───────────────────────── Verrou d'édition advisoire (Phase 8, US-6) ─────────────────────────
// Advisoire : avertit, ne bloque pas. Alimente le composant client verrou-fiche.tsx (d'où le retour
// non-void). acquerirVerrou (ré)acquiert si libre/à moi (sert aussi de heartbeat au poll ~20 s).

type ReponseVerrou = { etat: EtatVerrou; detenteurEmail?: string | null; estAdmin: boolean };

export async function acquerirVerrou(ressource: string): Promise<ReponseVerrou> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const moi = user.user?.id ?? null;

  const [{ data: row }, { data: estAdmin }] = await Promise.all([
    supabase.from("verrous").select("detenteur, expire_le").eq("ressource", ressource).maybeSingle(),
    supabase.rpc("is_admin"),
  ]);

  const etat = etatVerrou(row, moi, Date.now());
  if (etat === "autrui") {
    const { data: det } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", row!.detenteur)
      .maybeSingle();
    return { etat, detenteurEmail: det?.email ?? null, estAdmin: !!estAdmin };
  }

  // libre (jamais posé ou expiré) ou à moi → (ré)acquérir et étendre l'expiration.
  const now = Date.now();
  const { error } = await supabase.from("verrous").upsert(
    {
      ressource,
      detenteur: moi,
      detenu_le: new Date(now).toISOString(),
      expire_le: new Date(now + DUREE_VERROU_MS).toISOString(),
    },
    { onConflict: "ressource" },
  );
  if (error) throw new Error(error.message);
  return { etat: "a_moi", estAdmin: !!estAdmin };
}

export async function libererVerrou(ressource: string): Promise<void> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  // RLS : ne supprime que mon verrou (ou expiré). Pas de .eq detenteur → la RLS tranche.
  await supabase.from("verrous").delete().eq("ressource", ressource).eq("detenteur", user.user?.id ?? "");
}

export async function forcerVerrou(ressource: string): Promise<ReponseVerrou> {
  // Admin : écrase le détenteur sans condition (acquerirVerrou laisserait un verrou d'autrui
  // non expiré intact). RLS verrous_update/insert accepte is_admin().
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const now = Date.now();
  const { error } = await supabase.from("verrous").upsert(
    {
      ressource,
      detenteur: user.user?.id ?? null,
      detenu_le: new Date(now).toISOString(),
      expire_le: new Date(now + DUREE_VERROU_MS).toISOString(),
    },
    { onConflict: "ressource" },
  );
  if (error) throw new Error(error.message);
  return { etat: "a_moi", estAdmin: true };
}

// ───────────────────────── Suppression de dossier (Phase 8, admin) ─────────────────────────
// Purge les fichiers des 3 buckets (préfixe {dossierId}/), puis delete dossiers (cascade DB +
// trigger d'audit DELETE). RLS dossiers_delete + *_objects_delete = is_admin().

export async function supprimerDossier(formData: FormData) {
  const dossierId = String(formData.get("dossier_id"));
  const supabase = await createClient();

  const { data: estAdmin } = await supabase.rpc("is_admin");
  if (!estAdmin) throw new Error("Suppression réservée aux administrateurs.");

  for (const bucket of ["photos", "factures", "rapports", "optima"] as const) {
    const { data: fichiers } = await supabase.storage.from(bucket).list(dossierId);
    const chemins = (fichiers ?? []).map((f) => `${dossierId}/${f.name}`);
    if (chemins.length) await supabase.storage.from(bucket).remove(chemins);
  }

  const { error } = await supabase.from("dossiers").delete().eq("id", dossierId);
  if (error) throw new Error(error.message);

  revalidatePath("/dossiers");
  redirect("/dossiers");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
