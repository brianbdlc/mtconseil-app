"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { consoAnnuelleKwh, UNITES } from "@/lib/calc";
import { lirePlaque, type ImageEntree } from "@/lib/plaque";

function numOrNull(v: FormDataEntryValue | null): number | null {
  const n = Number(String(v ?? "").trim());
  return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  return String(v ?? "").trim() || null;
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
  const id = String(formData.get("id"));
  const dossierId = String(formData.get("dossier_id"));
  const nom = strOrNull(formData.get("nom"));
  const puissanceUnite = String(formData.get("puissance_unite") ?? "");
  const puissanceValeur = numOrNull(formData.get("puissance_valeur"));
  const heuresParAn = numOrNull(formData.get("heures_par_an"));
  const facteurCharge = numOrNull(formData.get("facteur_charge"));
  // Champs IA saisissables (US-17/18) + champs ingénieur (US-19/20).
  const marque = strOrNull(formData.get("marque"));
  const modele = strOrNull(formData.get("modele"));
  const annee = numOrNull(formData.get("annee"));
  const etat = strOrNull(formData.get("etat"));
  const emplacement = strOrNull(formData.get("emplacement"));
  const dessert = strOrNull(formData.get("dessert"));
  const rendement = numOrNull(formData.get("rendement"));
  const rendementSource = strOrNull(formData.get("rendement_source"));

  const supabase = await createClient();

  // On lit l'état courant pour ne valider QUE les champs IA réellement modifiés par l'ingénieur
  // (saisie manuelle). Un champ IA inchangé garde son état validé/confiance => jamais de validation
  // en bloc sur simple enregistrement du formulaire.
  const { data: actuel } = await supabase
    .from("equipements")
    .select("marque, modele, annee, puissance_valeur, puissance_unite")
    .eq("id", id)
    .single();

  // LE CODE calcule. Conso nulle tant qu'un champ manque ou que l'unité est absente.
  let conso: number | null = null;
  if (
    puissanceValeur !== null &&
    heuresParAn !== null &&
    facteurCharge !== null &&
    (UNITES as string[]).includes(puissanceUnite)
  ) {
    conso = consoAnnuelleKwh({
      puissanceValeur,
      puissanceUnite,
      heuresParAn,
      facteurCharge,
    });
  }

  const update: Record<string, unknown> = {
    nom,
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
  if (!CHAMPS_IA.includes(champ)) throw new Error(`Champ inconnu : ${champ}`);
  const supabase = await createClient();
  const { error } = await supabase
    .from("equipements")
    .update({ [`${champ}_validated`]: true })
    .eq("id", equipementId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dossiers/${dossierId}/equipements/${equipementId}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
