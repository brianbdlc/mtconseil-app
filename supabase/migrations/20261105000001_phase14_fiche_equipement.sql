-- Phase 14 : fiche d'équipement alignée sur le rapport Andalos (US-56).
-- Additif uniquement (jamais DROP/RENAME). Les nouveaux champs sont de la SAISIE INGÉNIEUR pure
-- (nullable = N/D, aucune confiance/validation IA). heures_par_an/facteur_charge restent sur la
-- fiche (calcul de conso US-26 intact) mais n'apparaissent pas dans le rapport (décision Luis).
-- Les triggers log_equipements/log_photos (to_jsonb(new)) journalisent déjà ces colonnes. RLS inchangée.

alter table public.equipements
  add column if not exists identifiant text,
  add column if not exists description text,
  add column if not exists debit_pcm numeric,
  add column if not exists air_frais_pct numeric,
  add column if not exists ventilateur text,
  add column if not exists refroidissement text,
  add column if not exists chauffage text,
  add column if not exists humidificateur text,
  add column if not exists capacite_refroidissement_kw numeric,
  add column if not exists capacite_chauffage_kw numeric,
  add column if not exists efficacite_pct numeric,
  add column if not exists constat text;

-- Rôle d'une photo dans la fiche : unité ou plaque signalétique (embarquées dans le .docx).
alter table public.photos
  add column if not exists role text check (role in ('unite', 'plaque'));
