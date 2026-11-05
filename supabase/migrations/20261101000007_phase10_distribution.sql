-- Phase 10 : distribution électrique du bâtiment (US-54). Additif uniquement
-- (jamais DROP/RENAME). Purement DESCRIPTIF : saisie ingénieur pure, AUCUN calcul ni devinette.
-- Le « nombre d'entrées » est DÉRIVÉ du nombre de lignes (pas de colonne). Calqué sur `zones`.

create table public.distribution_electrique (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null references public.dossiers (id) on delete cascade,
  amperes     numeric check (amperes is null or amperes >= 0),
  tension     numeric check (tension is null or tension >= 0),
  ordre       integer not null default 0,            -- tri d'affichage
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index distribution_electrique_dossier_id_idx on public.distribution_electrique (dossier_id);

create trigger touch_distribution        before update          on public.distribution_electrique for each row execute function public.touch_updated_at();
create trigger log_distribution          after insert or update on public.distribution_electrique for each row execute function public.log_change();
create trigger log_distribution_delete   after delete           on public.distribution_electrique for each row execute function public.log_change();

alter table public.distribution_electrique enable row level security;
create policy distribution_select on public.distribution_electrique for select to authenticated using (true);
create policy distribution_insert on public.distribution_electrique for insert to authenticated with check (true);
create policy distribution_update on public.distribution_electrique for update to authenticated using (true) with check (true);
create policy distribution_delete on public.distribution_electrique for delete to authenticated using (true);
