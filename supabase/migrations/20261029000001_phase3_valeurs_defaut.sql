-- Phase 3 : valeurs par défaut (type → poste + facteur de charge) + bilan par poste.
-- Additif uniquement (jamais DROP/RENAME destructif).
-- Règle fondatrice : LE CODE calcule ; un champ incertain reste vide ; aucun total n'est
-- complet s'il ne l'est pas, ni compté deux fois.
-- Cadrage : valeurs_defaut CRUD ouvert à tout ingénieur (journalisé) ; toute écriture connectée
-- non-admin force confirme=false (confirmation reportée à l'approbation, Phase 5). Seuls
-- parametres (facteur gaz) et profiles.role/actif restent admin-only.

-- ────────────────────────────── (a) Tables ──────────────────────────────

create table public.valeurs_defaut (
  id             uuid primary key default gen_random_uuid(),
  type           text not null,
  poste          text not null
                   check (poste in ('chauffage','refroidissement','ventilation','eclairage','eau_chaude','procedes','autre')),
  facteur_charge numeric check (facteur_charge is null or (facteur_charge > 0 and facteur_charge <= 1)),
  confirme       boolean not null default false,
  confirme_par   uuid references public.profiles (id),
  confirme_le    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Unicité du type insensible à la casse/espaces (le nom libre identifie le type).
create unique index valeurs_defaut_type_uniq on public.valeurs_defaut (lower(btrim(type)));

create table public.parametres (
  id         uuid primary key default gen_random_uuid(), -- requis : log_change lit new.id (row_id uuid)
  cle        text not null unique,
  valeur     numeric,
  unite      text,     -- facteur_conversion_gaz : FIXÉ 'kWh/m3' par le code
  source     text,
  confirme   boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ────────────────────────── (b) is_admin() ──────────────────────────

-- SECURITY INVOKER (pas DEFINER) : évite l'alerte advisor 0029 tout en marchant partout.
-- En RLS, s'exécute comme l'appelant (qui lit son propre profil via profiles_select).
-- Appelée depuis les triggers DEFINER, elle s'exécute sous le rôle propriétaire (bypass RLS) ;
-- auth.uid() reste l'utilisateur de la session dans les deux cas. profiles n'utilise PAS is_admin()
-- dans ses policies → aucune récursion RLS.
create or replace function public.is_admin()
returns boolean
language sql
security invoker
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and actif
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ─────────────────── (c) Triggers de garde (profiles) ───────────────────
-- Défense en profondeur : profiles n'a aucune policy UPDATE client (phase1), ce trigger
-- empêche un ingénieur connecté de changer role/actif. Les appels sans utilisateur connecté
-- (migration, éditeur SQL, service role) passent → promotion du 1er admin possible.

create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.jwt()->>'role' = 'authenticated'
     and not public.is_admin()
     and (new.role is distinct from old.role or new.actif is distinct from old.actif) then
    raise exception 'Modification de role/actif réservée aux administrateurs.';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_guard_role() from public, anon, authenticated;

-- valeurs_defaut : toute écriture connectée non-admin repasse à "à confirmer".
create or replace function public.vd_reset_confirme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.jwt()->>'role' = 'authenticated' and not public.is_admin() then
    new.confirme     := false;
    new.confirme_par := null;
    new.confirme_le  := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.vd_reset_confirme() from public, anon, authenticated;

-- ────────── (d) ALTER equipements / dossiers + CHECK + index ──────────

alter table public.equipements
  add column type_id               uuid references public.valeurs_defaut (id) on delete restrict,
  add column facteur_charge_raison text,
  -- surcharge d'un type => raison obligatoire (hors catégorie ou pas de surcharge => libre)
  add constraint equipements_surcharge_raison_chk
    check (type_id is null or facteur_charge is null or btrim(coalesce(facteur_charge_raison,'')) <> '');

create index equipements_type_id_idx on public.equipements (type_id);

alter table public.dossiers
  add column superficie_valeur numeric,
  add column superficie_unite  text check (superficie_unite in ('m2','pi2')),
  add column annee_construction int,
  add column usage             text,
  add column gaz_quantite      numeric check (gaz_quantite is null or gaz_quantite >= 0),
  add column gaz_unite         text check (gaz_unite in ('m3','GJ','kWh')),
  add column gaz_periode       text;

-- ─────────────────── (e) Seed (avant triggers) ───────────────────
-- Types usuels, facteur_charge null (à renseigner), confirme=false ("à confirmer avec Luis").
-- Noms avec note d'ambiguïté énergie là où elle existe (gaz/électrique) : confirme=false la porte déjà.

insert into public.valeurs_defaut (type, poste) values
  ('Fournaise/chaudière (énergie à confirmer)', 'chauffage'),
  ('Thermopompe',                               'chauffage'),
  ('Refroidisseur',                             'refroidissement'),
  ('Climatiseur',                               'refroidissement'),
  ('Réfrigération commerciale',                 'refroidissement'),
  ('Unité de ventilation (CTA/VRC)',            'ventilation'),
  ('Ventilateur',                               'ventilation'),
  ('Éclairage DEL',                             'eclairage'),
  ('Éclairage fluorescent',                     'eclairage'),
  ('Chauffe-eau',                               'eau_chaude'),
  ('Compresseur d''air',                        'procedes'),
  ('Pompe (usage à confirmer)',                 'procedes'),
  ('Moteur (usage à confirmer)',                'procedes'),
  ('Séchoir/four',                              'procedes')
on conflict do nothing;

insert into public.parametres (cle, valeur, unite, source, confirme) values
  ('facteur_conversion_gaz', null, 'kWh/m3', null, false)
on conflict (cle) do nothing;

-- ─────────────── (f) log_change étendu (gère le DELETE) ───────────────
-- Le DELETE casse l'ancienne version (new.id null) ; on prend coalesce(new.id, old.id).

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
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;

revoke execute on function public.log_change() from public, anon, authenticated;

-- ─────────────────── (g) Attacher les triggers ───────────────────

create trigger touch_valeurs_defaut before update on public.valeurs_defaut for each row execute function public.touch_updated_at();
create trigger touch_parametres     before update on public.parametres     for each row execute function public.touch_updated_at();

create trigger vd_reset before insert or update on public.valeurs_defaut for each row execute function public.vd_reset_confirme();

create trigger log_valeurs_defaut        after insert or update on public.valeurs_defaut for each row execute function public.log_change();
create trigger log_valeurs_defaut_delete after delete            on public.valeurs_defaut for each row execute function public.log_change();
create trigger log_parametres            after insert or update on public.parametres     for each row execute function public.log_change();

create trigger guard_profiles_role before update on public.profiles for each row execute function public.profiles_guard_role();

-- ────────────────────────────── (h) RLS ──────────────────────────────
-- valeurs_defaut : CRUD ouvert à tout ingénieur (vd_reset force confirme=false ; journal garde la trace).
-- parametres : lecture pour tous ; écriture admin-only (is_admin()).

alter table public.valeurs_defaut enable row level security;
alter table public.parametres     enable row level security;

create policy valeurs_defaut_select on public.valeurs_defaut for select to authenticated using (true);
create policy valeurs_defaut_insert on public.valeurs_defaut for insert to authenticated with check (true);
create policy valeurs_defaut_update on public.valeurs_defaut for update to authenticated using (true) with check (true);
create policy valeurs_defaut_delete on public.valeurs_defaut for delete to authenticated using (true);

create policy parametres_select on public.parametres for select to authenticated using (true);
create policy parametres_insert on public.parametres for insert to authenticated with check (public.is_admin());
create policy parametres_update on public.parametres for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy parametres_delete on public.parametres for delete to authenticated using (public.is_admin());
