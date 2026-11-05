-- Phase 15 : factures mensuelles (US-55). Additif uniquement (jamais DROP/RENAME).
-- Le CODE calcule tableaux mensuels + tarifs + GES + intensité réelle + $/pi² (source unique
-- dérivée des factures) ; les GRAPHIQUES restent des images collées d'Optima (hors calcul serveur).

-- Montant $ de la facture (lisible IA, saisie manuelle). Nullable : inconnu tant qu'illisible.
alter table public.factures
  add column montant numeric check (montant is null or montant >= 0);

-- ────────────────────────────── Degrés-jours (saisie manuelle) ──────────────────────────────
-- Un relevé mensuel de degrés-jours par dossier. Patron CRUD journalisé (zones/distribution).
create table public.degres_jours (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null references public.dossiers (id) on delete cascade,
  mois        date not null,
  valeur      numeric check (valeur is null or valeur >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index degres_jours_dossier_id_idx on public.degres_jours (dossier_id);

create trigger touch_degres_jours      before update          on public.degres_jours for each row execute function public.touch_updated_at();
create trigger log_degres_jours        after insert or update on public.degres_jours for each row execute function public.log_change();
create trigger log_degres_jours_delete after delete           on public.degres_jours for each row execute function public.log_change();

-- RLS miroir zones : toute la firme (authenticated) voit/insère/met à jour/supprime.
alter table public.degres_jours enable row level security;
create policy degres_jours_select on public.degres_jours for select to authenticated using (true);
create policy degres_jours_insert on public.degres_jours for insert to authenticated with check (true);
create policy degres_jours_update on public.degres_jours for update to authenticated using (true) with check (true);
create policy degres_jours_delete on public.degres_jours for delete to authenticated using (true);

-- ────────────────────────────── Facteurs GES (admin-only) ──────────────────────────────
-- Seedés confirme=false : valeurs À CONFIRMER par Luis. parametres est admin-only (Phase 3).
insert into public.parametres (cle, valeur, unite, source, confirme) values
  ('facteur_ges_gaz',  1.879,  'kgCO2e/m3',  'seed', false),
  ('facteur_ges_elec', 0.0006, 'kgCO2e/kWh', 'seed', false)
on conflict (cle) do nothing;

-- ────────────────────────────── Graphiques degrés-jours (images collées d'Optima) ──────────────
-- Patron optima_path : chemin Storage (bucket 'factures' réutilisé). PNG collé, hors calcul.
alter table public.dossiers
  add column graphique_dj_elec_path text,
  add column graphique_dj_gaz_path  text;
