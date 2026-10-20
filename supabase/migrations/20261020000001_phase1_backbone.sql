-- Phase 1 : colonne vertébrale (sans IA). Additif uniquement (jamais DROP/RENAME destructif).
-- Tables : profiles, dossiers, equipements, audit_log. RLS + journal immuable.

-- ────────────────────────────── Tables ──────────────────────────────

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'engineer' check (role in ('admin', 'engineer')),
  actif      boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.dossiers (
  id           uuid primary key default gen_random_uuid(),
  client       text not null,
  adresse      text,
  -- statuts complets posés dès maintenant (machine d'états = Phase 5) ; Phase 1 reste en 'brouillon'
  statut       text not null default 'brouillon'
                 check (statut in ('brouillon', 'soumis', 'approuve', 'exporte', 'a_corriger')),
  ingenieur_id uuid references public.profiles (id) default auth.uid(),
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.equipements (
  id              uuid primary key default gen_random_uuid(),
  dossier_id      uuid not null references public.dossiers (id) on delete cascade,
  nom             text,
  -- L'unité d'origine est CONSERVÉE ; le code convertit avant de calculer (règle fondatrice).
  puissance_valeur numeric,
  puissance_unite  text check (puissance_unite in ('kW', 'HP', 'BTU/h')),
  heures_par_an    numeric,
  facteur_charge   numeric,
  conso_kwh_an     numeric, -- écrit par le CODE, jamais par l'IA
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index equipements_dossier_id_idx on public.equipements (dossier_id);

-- Journal immuable (US-7) : append-only, écrit uniquement par trigger security definer.
create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     uuid,
  action     text not null,
  actor      uuid,
  old_data   jsonb,
  new_data   jsonb,
  at         timestamptz not null default now()
);

-- ────────────────────────────── Triggers ──────────────────────────────

-- Crée le profil à l'inscription. Le TOUT PREMIER profil devient admin (= Luis, seedé via dashboard).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when exists (select 1 from public.profiles) then 'engineer' else 'admin' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at auto
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_dossiers    before update on public.dossiers    for each row execute function public.touch_updated_at();
create trigger touch_equipements before update on public.equipements for each row execute function public.touch_updated_at();

-- Journal : enregistre insert/update (qui, quand, ancienne/nouvelle valeur).
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (table_name, row_id, action, actor, old_data, new_data)
  values (
    tg_table_name,
    new.id,
    tg_op,
    auth.uid(),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return null;
end;
$$;

create trigger log_dossiers    after insert or update on public.dossiers    for each row execute function public.log_change();
create trigger log_equipements after insert or update on public.equipements for each row execute function public.log_change();

-- ────────────────────────────── RLS ──────────────────────────────
-- Modèle Phase 1 : toute la firme (authenticated) voit tout ; insert/update ouverts.
-- Droits fins par personne = Phase 8. Suppression = Phase 8 (admin).

alter table public.profiles    enable row level security;
alter table public.dossiers    enable row level security;
alter table public.equipements enable row level security;
alter table public.audit_log   enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (true);

create policy dossiers_select on public.dossiers for select to authenticated using (true);
create policy dossiers_insert on public.dossiers for insert to authenticated with check (true);
create policy dossiers_update on public.dossiers for update to authenticated using (true) with check (true);

create policy equipements_select on public.equipements for select to authenticated using (true);
create policy equipements_insert on public.equipements for insert to authenticated with check (true);
create policy equipements_update on public.equipements for update to authenticated using (true) with check (true);

-- audit_log : SELECT seulement. Aucune policy INSERT/UPDATE/DELETE => immuable côté client ;
-- seul le trigger log_change (security definer) peut écrire.
create policy audit_log_select on public.audit_log for select to authenticated using (true);
