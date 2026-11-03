-- Phase 6 : factures d'énergie (US-32). Additif uniquement (jamais DROP/RENAME).
-- Règle fondatrice : le CODE convertit/somme/vérifie, l'IA LIT/PROPOSE (confirme=false),
-- l'ingénieur CONFIRME. Les factures CONFIRMÉES alimentent le contrôle de cohérence (Phase 4).

-- ────────────────────────────── Table factures ──────────────────────────────
-- energie/conso_unite nullables : inconnus tant que l'IA n'a pas lu / l'ingénieur saisi.
-- Le CHECK garde-fou interdit de confirmer une facture incomplète (energie + conso requises).

create table public.factures (
  id             uuid primary key default gen_random_uuid(),
  dossier_id     uuid not null references public.dossiers (id) on delete cascade,
  energie        text    check (energie in ('elec', 'gaz')),            -- null = indéterminé
  fournisseur    text,                                                  -- libre : Hydro-Québec, Énergir…
  periode_debut  date,
  periode_fin    date,
  conso_valeur   numeric check (conso_valeur is null or conso_valeur >= 0),
  conso_unite    text    check (conso_unite in ('kWh', 'm3', 'GJ')),    -- élec = kWh ; gaz = m3/GJ/kWh
  conso_confiance text   check (conso_confiance in ('lisible', 'partiel', 'illisible')),
  source         text    not null default 'manuel' check (source in ('ia', 'manuel')),
  confirme       boolean not null default false,
  storage_path   text,                                                  -- bucket 'factures' (null si saisie manuelle)
  nom_original   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Une facture confirmée doit porter de quoi calculer un kWh (sinon elle fausserait la cohérence).
  constraint factures_confirme_complet check (
    confirme is false
    or (energie is not null and conso_valeur is not null and conso_unite is not null)
  )
);

create index factures_dossier_id_idx on public.factures (dossier_id);

create trigger touch_factures before update on public.factures for each row execute function public.touch_updated_at();
create trigger log_factures   after insert or update on public.factures for each row execute function public.log_change();

-- ────────────────────────────── RLS factures ──────────────────────────────
-- Miroir photos/equipements : toute la firme (authenticated) voit/insère/met à jour.
-- Pas de DELETE (convention repo : Phase 8, avec la suppression de dossier).

alter table public.factures enable row level security;

create policy factures_select on public.factures for select to authenticated using (true);
create policy factures_insert on public.factures for insert to authenticated with check (true);
create policy factures_update on public.factures for update to authenticated using (true) with check (true);

-- ───────────────────────── Bucket Storage 'factures' ─────────────────────────
-- Privé (URLs signées). Miroir du bucket 'photos'. Pas de DELETE (Phase 8).

insert into storage.buckets (id, name, public) values ('factures', 'factures', false)
  on conflict (id) do nothing;

create policy factures_objects_select on storage.objects for select to authenticated using (bucket_id = 'factures');
create policy factures_objects_insert on storage.objects for insert to authenticated with check (bucket_id = 'factures');
create policy factures_objects_update on storage.objects for update to authenticated using (bucket_id = 'factures') with check (bucket_id = 'factures');
