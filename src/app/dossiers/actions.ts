"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { consoAnnuelleKwh, UNITES } from "@/lib/calc";

function numOrNull(v: FormDataEntryValue | null): number | null {
  const n = Number(String(v ?? "").trim());
  return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
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
  const nom = String(formData.get("nom") ?? "").trim() || null;
  const puissanceUnite = String(formData.get("puissance_unite") ?? "");
  const puissanceValeur = numOrNull(formData.get("puissance_valeur"));
  const heuresParAn = numOrNull(formData.get("heures_par_an"));
  const facteurCharge = numOrNull(formData.get("facteur_charge"));

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

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipements")
    .update({
      nom,
      puissance_valeur: puissanceValeur,
      puissance_unite: puissanceUnite || null,
      heures_par_an: heuresParAn,
      facteur_charge: facteurCharge,
      conso_kwh_an: conso,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/dossiers/${dossierId}`);
  redirect(`/dossiers/${dossierId}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
