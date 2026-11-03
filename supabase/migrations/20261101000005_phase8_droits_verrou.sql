-- Phase 8 : droits fins par personne, désactivation = verrou d'accès, verrou d'édition advisoire,
-- suppression de dossier (admin), notifications (côté app). Additif : drop policy if exists + recreate
-- (non destructif pour les données). Toutes les fonctions : sql / security invoker / stable /
-- search_path='' + revoke public,anon / grant authenticated (miroir is_admin, pas d'alerte advisor).

-- ─────────────────── (a) Droits par personne (tout activé par défaut) ───────────────────
alter table public.profiles
  add column peut_modifier boolean not null default true,
  add column peut_valider  boolean not null default true,
  add column peut_exporter boolean not null default true;

-- ─────────────────── (b) Fonctions capacités (miroir is_admin) ───────────────────
-- Une seule requête chacune : actif seul, ou actif ET (admin OU drapeau). admin ⇒ tout.
create or replace function public.is_active()
returns boolean language sql security invoker stable set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and actif);
$$;

create or replace function public.peut_modifier()
returns boolean language sql security invoker stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and actif and (role = 'admin' or peut_modifier)
  );
$$;

create or replace function public.peut_valider()
returns boolean language sql security invoker stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and actif and (role = 'admin' or peut_valider)
  );
$$;

create or replace function public.peut_exporter()
returns boolean language sql security invoker stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and actif and (role = 'admin' or peut_exporter)
  );
$$;

revoke execute on function public.is_active()     from public, anon;
revoke execute on function public.peut_modifier() from public, anon;
revoke execute on function public.peut_valider()  from public, anon;
revoke execute on function public.peut_exporter() from public, anon;
grant execute on function public.is_active()     to authenticated;
grant execute on function public.peut_modifier() to authenticated;
grant execute on function public.peut_valider()  to authenticated;
grant execute on function public.peut_exporter() to authenticated;

-- ─────────────────── (c) Gestion de compte par l'admin ───────────────────
-- Le trigger de garde bloque role/actif/peut_* pour un non-admin connecté ; l'admin est exempté.
create or replace function public.profiles_guard_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt()->>'role' = 'authenticated'
     and not public.is_admin()
     and (new.role          is distinct from old.role
       or new.actif         is distinct from old.actif
       or new.peut_modifier is distinct from old.peut_modifier
       or new.peut_valider  is distinct from old.peut_valider
       or new.peut_exporter is distinct from old.peut_exporter) then
    raise exception 'Modification de role/actif/droits réservée aux administrateurs.';
  end if;
  return new;
end;
$$;
revoke execute on function public.profiles_guard_role() from public, anon, authenticated;

-- profiles_select reste using(true) (pas de récursion RLS). On ouvre un UPDATE admin-only.
-- (is_admin() dans une policy UPDATE ne récurse pas : il lit profiles via profiles_select = true.)
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─────────────────── (d) Désactivation = verrou d'accès + droits d'écriture ───────────────────
-- select → is_active() (un compte désactivé ne lit plus les données). insert/update → peut_modifier(),
-- sauf equipements & rapport_textes (la validation écrit dessus) → peut_modifier() OR peut_valider().
-- dossiers → is_active() (la machine à statuts dossiers_statut_garde gère déjà les transitions).

drop policy if exists equipements_select on public.equipements;
drop policy if exists equipements_insert on public.equipements;
drop policy if exists equipements_update on public.equipements;
create policy equipements_select on public.equipements for select to authenticated using (public.is_active());
create policy equipements_insert on public.equipements for insert to authenticated with check (public.peut_modifier() or public.peut_valider());
create policy equipements_update on public.equipements for update to authenticated using (public.is_active()) with check (public.peut_modifier() or public.peut_valider());

drop policy if exists photos_select on public.photos;
drop policy if exists photos_insert on public.photos;
drop policy if exists photos_update on public.photos;
create policy photos_select on public.photos for select to authenticated using (public.is_active());
create policy photos_insert on public.photos for insert to authenticated with check (public.peut_modifier());
create policy photos_update on public.photos for update to authenticated using (public.is_active()) with check (public.peut_modifier());

drop policy if exists factures_select on public.factures;
drop policy if exists factures_insert on public.factures;
drop policy if exists factures_update on public.factures;
create policy factures_select on public.factures for select to authenticated using (public.is_active());
create policy factures_insert on public.factures for insert to authenticated with check (public.peut_modifier());
create policy factures_update on public.factures for update to authenticated using (public.is_active()) with check (public.peut_modifier());

drop policy if exists mesures_select on public.mesures;
drop policy if exists mesures_insert on public.mesures;
drop policy if exists mesures_update on public.mesures;
drop policy if exists mesures_delete on public.mesures;
create policy mesures_select on public.mesures for select to authenticated using (public.is_active());
create policy mesures_insert on public.mesures for insert to authenticated with check (public.peut_modifier());
create policy mesures_update on public.mesures for update to authenticated using (public.is_active()) with check (public.peut_modifier());
create policy mesures_delete on public.mesures for delete to authenticated using (public.peut_modifier());

drop policy if exists rapport_textes_select on public.rapport_textes;
drop policy if exists rapport_textes_insert on public.rapport_textes;
drop policy if exists rapport_textes_update on public.rapport_textes;
create policy rapport_textes_select on public.rapport_textes for select to authenticated using (public.is_active());
create policy rapport_textes_insert on public.rapport_textes for insert to authenticated with check (public.peut_modifier() or public.peut_valider());
create policy rapport_textes_update on public.rapport_textes for update to authenticated using (public.is_active()) with check (public.peut_modifier() or public.peut_valider());

drop policy if exists valeurs_defaut_select on public.valeurs_defaut;
drop policy if exists valeurs_defaut_insert on public.valeurs_defaut;
drop policy if exists valeurs_defaut_update on public.valeurs_defaut;
drop policy if exists valeurs_defaut_delete on public.valeurs_defaut;
create policy valeurs_defaut_select on public.valeurs_defaut for select to authenticated using (public.is_active());
create policy valeurs_defaut_insert on public.valeurs_defaut for insert to authenticated with check (public.peut_modifier());
create policy valeurs_defaut_update on public.valeurs_defaut for update to authenticated using (public.is_active()) with check (public.peut_modifier());
create policy valeurs_defaut_delete on public.valeurs_defaut for delete to authenticated using (public.peut_modifier());

drop policy if exists dossiers_select on public.dossiers;
drop policy if exists dossiers_insert on public.dossiers;
drop policy if exists dossiers_update on public.dossiers;
create policy dossiers_select on public.dossiers for select to authenticated using (public.is_active());
create policy dossiers_insert on public.dossiers for insert to authenticated with check (public.peut_modifier());
create policy dossiers_update on public.dossiers for update to authenticated using (public.is_active()) with check (public.is_active());

-- ─────────────────── (e) Verrou d'édition (advisoire, éphémère — pas d'audit) ───────────────────
create table public.verrous (
  ressource  text primary key,
  detenteur  uuid references public.profiles (id),
  detenu_le  timestamptz not null default now(),
  expire_le  timestamptz not null
);

alter table public.verrous enable row level security;
-- Chacun gère son verrou ; l'admin force n'importe lequel ; un verrou expiré est reprenable par tous.
create policy verrous_select on public.verrous for select to authenticated using (public.is_active());
create policy verrous_insert on public.verrous for insert to authenticated with check (detenteur = auth.uid() or public.is_admin());
create policy verrous_update on public.verrous for update to authenticated
  using (detenteur = auth.uid() or public.is_admin() or expire_le < now())
  with check (detenteur = auth.uid() or public.is_admin());
create policy verrous_delete on public.verrous for delete to authenticated
  using (detenteur = auth.uid() or public.is_admin() or expire_le < now());

-- ─────────────────── (f) Suppression de dossier (admin) ───────────────────
-- log_change gère déjà le DELETE (phase 3) ; il manque juste le trigger after delete sur dossiers.
create trigger log_dossiers_delete after delete on public.dossiers for each row execute function public.log_change();

create policy dossiers_delete on public.dossiers for delete to authenticated using (public.is_admin());

-- Les tables enfant ont on delete cascade (le cascade FK bypass la RLS → rien à ajouter côté enfants).
-- Fichiers Storage : suppression admin-only sur les 3 buckets (la purge passe par .remove() dans l'action).
create policy photos_objects_delete   on storage.objects for delete to authenticated using (bucket_id = 'photos'   and public.is_admin());
create policy factures_objects_delete on storage.objects for delete to authenticated using (bucket_id = 'factures' and public.is_admin());
create policy rapports_objects_delete on storage.objects for delete to authenticated using (bucket_id = 'rapports' and public.is_admin());
