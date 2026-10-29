-- Phase 2 : photos + lecture de plaques IA. Additif uniquement (jamais DROP/RENAME).
-- Règle fondatrice : le CODE calcule, l'IA LIT/PROPOSE (champs non validés), l'ingénieur CONFIRME.
-- Chaque champ IA porte sa confiance (3 états) + son drapeau validé ; un champ incertain reste vide.

-- ────────────────────────────── Table photos ──────────────────────────────
-- Un groupe CONFIRMÉ = les photos partageant un equipement_id. Les groupes PROPOSÉS
-- sont calculés à la volée (clustering par prise_le) côté code : pas de table photo_groupes.

create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null references public.dossiers (id) on delete cascade,
  -- null = pool non assigné ; set null si l'équipement disparaît (la photo reste au dossier)
  equipement_id uuid references public.equipements (id) on delete set null,
  storage_path  text not null,           -- chemin dans le bucket 'photos'
  nom_original  text,                     -- nom de fichier d'origine (affichage + secours de tri)
  nom_affichage text,                     -- renommage dans l'app (fichiers d'origine intacts)
  prise_le      timestamptz,              -- EXIF DateTimeOriginal, nullable => secours par nom
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index photos_dossier_id_idx    on public.photos (dossier_id);
create index photos_equipement_id_idx on public.photos (equipement_id);

create trigger touch_photos before update on public.photos for each row execute function public.touch_updated_at();
create trigger log_photos   after insert or update on public.photos for each row execute function public.log_change();

-- ─────────────────────────── ALTER equipements ───────────────────────────
-- Champs IA : marque / modele / puissance / annee — chacun avec confiance (3 états) + validé.
-- puissance_valeur / puissance_unite existent déjà (Phase 1) : on ajoute juste confiance + validé.
-- Champs saisis par l'ingénieur (US-19, US-20) : pas de confiance.
-- conso_kwh_an reste écrit par le CODE (inchangé). Les nouvelles colonnes passent automatiquement
-- au journal via le trigger log_equipements existant (to_jsonb(new)).

alter table public.equipements
  add column marque              text,
  add column marque_confiance    text    check (marque_confiance    in ('lisible', 'partiel', 'illisible')),
  add column marque_validated    boolean not null default false,
  add column modele              text,
  add column modele_confiance    text    check (modele_confiance    in ('lisible', 'partiel', 'illisible')),
  add column modele_validated    boolean not null default false,
  add column puissance_confiance text    check (puissance_confiance in ('lisible', 'partiel', 'illisible')),
  add column puissance_validated boolean not null default false,
  add column annee               int,
  add column annee_confiance     text    check (annee_confiance     in ('lisible', 'partiel', 'illisible')),
  add column annee_validated     boolean not null default false,
  add column etat                text,
  add column emplacement         text,
  add column dessert             text,
  add column rendement           numeric,
  add column rendement_source    text;

-- ────────────────────────────── RLS photos ──────────────────────────────
-- Miroir equipements : toute la firme (authenticated) voit/insère/met à jour. Pas de DELETE (Phase 8).
-- RLS est forcée par l'event trigger rls_auto_enable ; on écrit les policies explicitement.

alter table public.photos enable row level security;

create policy photos_select on public.photos for select to authenticated using (true);
create policy photos_insert on public.photos for insert to authenticated with check (true);
create policy photos_update on public.photos for update to authenticated using (true) with check (true);

-- ───────────────────────── Bucket Storage 'photos' ─────────────────────────
-- Versionné dans la migration plutôt que créé par clics dashboard. Bucket privé (URLs signées).

insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;

-- Policies sur storage.objects pour le bucket 'photos', to authenticated. Pas de DELETE (Phase 8).
create policy photos_objects_select on storage.objects for select to authenticated using (bucket_id = 'photos');
create policy photos_objects_insert on storage.objects for insert to authenticated with check (bucket_id = 'photos');
create policy photos_objects_update on storage.objects for update to authenticated using (bucket_id = 'photos') with check (bucket_id = 'photos');
