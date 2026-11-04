-- Phase 9 : tableau de zones du bâtiment (US-53). Additif uniquement — Phase 9, US-53
-- (jamais DROP/RENAME). Purement DESCRIPTIF : la superficie TOTALE (dossiers.superficie_valeur,
-- Phase 3) reste la seule source de l'intensité ; les zones n'entrent dans AUCUN calcul.
-- Calqué exactement sur le bloc `mesures` (PK uuid pour réutiliser log_change tel quel).

create table public.zones (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null references public.dossiers (id) on delete cascade,
  nom         text,
  superficie  numeric check (superficie is null or superficie >= 0),
  unite       text check (unite in ('m2', 'pi2')),
  ordre       integer not null default 0,            -- tri d'affichage
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index zones_dossier_id_idx on public.zones (dossier_id);

create trigger touch_zones        before update          on public.zones for each row execute function public.touch_updated_at();
create trigger log_zones          after insert or update on public.zones for each row execute function public.log_change();
create trigger log_zones_delete   after delete           on public.zones for each row execute function public.log_change();

alter table public.zones enable row level security;
create policy zones_select on public.zones for select to authenticated using (true);
create policy zones_insert on public.zones for insert to authenticated with check (true);
create policy zones_update on public.zones for update to authenticated using (true) with check (true);
create policy zones_delete on public.zones for delete to authenticated using (true);
