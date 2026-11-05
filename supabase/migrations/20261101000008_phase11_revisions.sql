-- Phase 11 : registre des révisions du rapport (US-59). Additif uniquement
-- (jamais DROP/RENAME). Purement DESCRIPTIF : saisie ingénieur pure, AUCUN calcul.
-- `numero` = texte libre (« 0 », « A », « 1.0 ») + `ordre` (entier) pour le tri. Calqué sur `distribution_electrique`.

create table public.revisions (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null references public.dossiers (id) on delete cascade,
  numero      text,
  date        date,
  description text,
  ordre       integer not null default 0,            -- tri d'affichage
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index revisions_dossier_id_idx on public.revisions (dossier_id);

create trigger touch_revisions        before update          on public.revisions for each row execute function public.touch_updated_at();
create trigger log_revisions          after insert or update on public.revisions for each row execute function public.log_change();
create trigger log_revisions_delete   after delete           on public.revisions for each row execute function public.log_change();

alter table public.revisions enable row level security;
create policy revisions_select on public.revisions for select to authenticated using (true);
create policy revisions_insert on public.revisions for insert to authenticated with check (true);
create policy revisions_update on public.revisions for update to authenticated using (true) with check (true);
create policy revisions_delete on public.revisions for delete to authenticated using (true);
