-- Phase 5 : statuts, approbation, versions. Additif uniquement (jamais DROP/RENAME destructif).
-- Invariants imposés EN BASE (pas seulement dans l'app) :
--   1. statut ne change que selon la matrice (dossiers_statut_garde) sinon raise.
--   2. rapport_snapshot ne change qu'à une transition vers 'soumis'.
--   3. approuve_par/approuve_le/commentaires : écriture admin-only (commentaires : sauf vidage à la (re)soumission).
--   4. approuve→exporte UNIQUEMENT via enregistrer_export() (GUC transaction-local app.export_ok).
--   5. rapport_versions + bucket 'rapports' : aucune écriture directe (fonctions security definer seulement).
--   6. on n'approuve jamais un rapport périmé ni une valeur par défaut différente du snapshot.
-- Matrice (miroir SQL de src/lib/statuts.ts — garder les deux en phase) :
--   brouillon→soumis (tous) · a_corriger→soumis (tous) · soumis→soumis (si périmé) ·
--   soumis→approuve (admin) · soumis→a_corriger (admin) ·
--   approuve|exporte→soumis (retour auto) · approuve→exporte (via enregistrer_export).

-- ─────────────────── (a) Colonnes dossiers ───────────────────
alter table public.dossiers
  add column rapport_snapshot jsonb,
  add column snapshot_perime  boolean not null default false,
  add column soumis_par        uuid references public.profiles (id),
  add column soumis_le         timestamptz,
  add column approuve_par      uuid references public.profiles (id),
  add column approuve_le       timestamptz,
  add column commentaires      jsonb;

-- ─────────────────── (b) Table rapport_versions ───────────────────
-- Chaque export conservé (US-48). Écriture réservée à enregistrer_export (security definer).
create table public.rapport_versions (
  id             uuid primary key default gen_random_uuid(),
  dossier_id     uuid not null references public.dossiers (id) on delete cascade,
  version        int  not null,
  snapshot       jsonb not null,
  storage_path   text not null,
  sha256         text not null,
  modele_version text not null default 'provisoire', -- vrai n° de modèle = Phase 7 (report_templates)
  exporte_par    uuid references public.profiles (id) default auth.uid(),
  exporte_le     timestamptz not null default now(),
  unique (dossier_id, version)
);

create index rapport_versions_dossier_id_idx on public.rapport_versions (dossier_id);

alter table public.rapport_versions enable row level security;
-- SELECT seulement. AUCUNE policy insert/update/delete → écriture via security definer uniquement.
create policy rapport_versions_select on public.rapport_versions for select to authenticated using (true);

create trigger log_rapport_versions after insert on public.rapport_versions
  for each row execute function public.log_change();

-- ─────────────────── (c) Bucket privé 'rapports' + policies storage ───────────────────
-- Un seul client Supabase (session, pas de service-role) → les uploads passent par la RLS.
insert into storage.buckets (id, name, public) values ('rapports', 'rapports', false)
on conflict (id) do nothing;

-- Lecture : tout authenticated. Dépôt : seulement dans le dossier d'un rapport APPROUVÉ,
-- chemin = {dossier_id}/... Aucune policy UPDATE/DELETE → fichiers non falsifiables.
-- Phase 8 : à la suppression d'un dossier, supprimer aussi ses fichiers 'rapports'.
create policy rapports_select on storage.objects for select to authenticated
  using (bucket_id = 'rapports');

create policy rapports_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'rapports'
    and (storage.foldername(name))[1] in (
      select id::text from public.dossiers where statut = 'approuve'
    )
  );

-- ─────────────────── (d) vd_reset_confirme étendu ───────────────────
-- Ajout : changer facteur_charge/poste d'une valeur dé-confirme, MÊME pour un admin (PLAN L139).
-- L'ancien bloc (toute écriture non-admin force confirme=false) est conservé ensuite.
-- approuver_dossier/bouton Confirmer ne touchent PAS facteur_charge/poste → confirme=true persiste.
create or replace function public.vd_reset_confirme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.facteur_charge is distinct from old.facteur_charge
          or new.poste is distinct from old.poste) then
    new.confirme     := false;
    new.confirme_par := null;
    new.confirme_le  := null;
  end if;

  if auth.jwt()->>'role' = 'authenticated' and not public.is_admin() then
    new.confirme     := false;
    new.confirme_par := null;
    new.confirme_le  := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.vd_reset_confirme() from public, anon, authenticated;

-- ─────────────────── (e) Garde du cycle (BEFORE UPDATE on dossiers) ───────────────────
create or replace function public.dossiers_statut_garde()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1. Retour auto (A8) : éditer un dossier approuvé/exporté le renvoie en 'soumis' + périmé.
  --    Soit une colonne de données du rapport a changé, soit un trigger equipements a déjà
  --    posé statut='soumis'. (Un verrou d'édition plus large viendra en Phase 8.)
  if old.statut in ('approuve', 'exporte')
     and (
       new.superficie_valeur  is distinct from old.superficie_valeur or
       new.superficie_unite   is distinct from old.superficie_unite  or
       new.annee_construction is distinct from old.annee_construction or
       new.usage              is distinct from old.usage             or
       new.gaz_quantite       is distinct from old.gaz_quantite      or
       new.gaz_unite          is distinct from old.gaz_unite         or
       new.gaz_periode        is distinct from old.gaz_periode       or
       new.statut = 'soumis'
     ) then
    new.statut         := 'soumis';
    new.snapshot_perime := true;
  end if;

  -- 2. Matrice de transitions (seulement quand le statut CHANGE ; sinon = simple édition de données,
  --    libre — sauf soumis→soumis qui exige une re-soumission après retour auto).
  if new.statut = old.statut then
    if new.statut = 'soumis' and not old.snapshot_perime then
      raise exception 'Transition soumis→soumis interdite hors re-soumission après retour auto.';
    end if;
  else
    if    old.statut = 'brouillon'  and new.statut = 'soumis' then      -- tous
    elsif old.statut = 'a_corriger' and new.statut = 'soumis' then      -- tous
    elsif old.statut = 'soumis'     and new.statut = 'approuve' then
      if not public.is_admin() then raise exception 'Approbation réservée aux administrateurs.'; end if;
    elsif old.statut = 'soumis'     and new.statut = 'a_corriger' then
      if not public.is_admin() then raise exception 'Renvoi à corriger réservé aux administrateurs.'; end if;
    elsif old.statut in ('approuve','exporte') and new.statut = 'soumis' then  -- retour auto
      null;
    elsif old.statut = 'approuve'   and new.statut = 'exporte' then
      if current_setting('app.export_ok', true) is distinct from '1' then
        raise exception 'Passage à exporté réservé à enregistrer_export().';
      end if;
    else
      raise exception 'Transition de statut interdite : %→%.', old.statut, new.statut;
    end if;
  end if;

  -- 3. Gardes par champ.
  if new.rapport_snapshot is distinct from old.rapport_snapshot and new.statut <> 'soumis' then
    raise exception 'rapport_snapshot ne change qu''à la soumission.';
  end if;
  if (new.approuve_par is distinct from old.approuve_par
      or new.approuve_le is distinct from old.approuve_le)
     and not public.is_admin() then
    raise exception 'approuve_par/approuve_le réservés aux administrateurs.';
  end if;
  -- commentaires : admin only, SAUF vidage lors d'une (re)soumission (statut→soumis par un ingénieur).
  if new.commentaires is distinct from old.commentaires
     and new.statut <> 'soumis'
     and not public.is_admin() then
    raise exception 'Les commentaires de correction sont réservés aux administrateurs.';
  end if;

  return new;
end;
$$;

revoke execute on function public.dossiers_statut_garde() from public, anon, authenticated;

create trigger dossiers_statut_garde before update on public.dossiers
  for each row execute function public.dossiers_statut_garde();

-- ─────────────────── (f) approuver_dossier (atomique, admin, security definer) ───────────────────
create or replace function public.approuver_dossier(p_dossier uuid, p_valeurs uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut   text;
  v_perime   boolean;
  v_snapshot jsonb;
  v_used     uuid[];
  v_eq       jsonb;
  v_tid      uuid;
  v_cur_fact numeric;
  v_cur_poste text;
begin
  if not public.is_admin() then
    raise exception 'Approbation réservée aux administrateurs.';
  end if;

  select statut, snapshot_perime, rapport_snapshot
    into v_statut, v_perime, v_snapshot
    from public.dossiers where id = p_dossier for update;
  if not found then raise exception 'Dossier introuvable.'; end if;
  if v_statut <> 'soumis' then raise exception 'Seul un dossier soumis peut être approuvé (statut : %).', v_statut; end if;
  if v_perime then raise exception 'Dossier modifié depuis la soumission : re-soumettre avant approbation.'; end if;
  if v_snapshot is null then raise exception 'Aucun instantané (snapshot) à approuver.'; end if;

  -- Valeurs par défaut NON confirmées utilisées par le SNAPSHOT (pas les équipements vivants).
  select coalesce(array_agg(distinct vd.id), '{}')
    into v_used
    from jsonb_array_elements(v_snapshot->'equipements') e
    join public.valeurs_defaut vd on vd.id = nullif(e->>'type_id','')::uuid
    where vd.confirme = false;

  -- La liste affichée à l'admin doit correspondre exactement (sinon elle a changé → recharger).
  if not (v_used <@ p_valeurs and p_valeurs <@ v_used) then
    raise exception 'La liste des valeurs à confirmer a changé — recharger la page d''approbation.';
  end if;

  -- A3 : facteur/poste actuels = ceux figés dans le snapshot.
  for v_eq in select * from jsonb_array_elements(v_snapshot->'equipements')
  loop
    v_tid := nullif(v_eq->>'type_id','')::uuid;
    if v_tid is null or not (v_tid = any(p_valeurs)) then continue; end if;
    select facteur_charge, poste into v_cur_fact, v_cur_poste
      from public.valeurs_defaut where id = v_tid;
    if v_cur_fact is distinct from nullif(v_eq->>'type_facteur_charge','')::numeric
       or v_cur_poste is distinct from (v_eq->>'type_poste') then
      raise exception 'Une valeur par défaut (%) a changé depuis la soumission.', v_tid;
    end if;
  end loop;

  update public.dossiers
    set statut = 'approuve', approuve_par = auth.uid(), approuve_le = now()
    where id = p_dossier;

  update public.valeurs_defaut
    set confirme = true, confirme_par = auth.uid(), confirme_le = now()
    where id = any(p_valeurs);
end;
$$;

revoke execute on function public.approuver_dossier(uuid, uuid[]) from public, anon;
grant execute on function public.approuver_dossier(uuid, uuid[]) to authenticated;

-- ─────────────────── (g) enregistrer_export (atomique, security definer) ───────────────────
create or replace function public.enregistrer_export(p_dossier uuid, p_path text, p_sha256 text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut   text;
  v_snapshot jsonb;
  v_version  int;
begin
  select statut, rapport_snapshot into v_statut, v_snapshot
    from public.dossiers where id = p_dossier for update;
  if not found then raise exception 'Dossier introuvable.'; end if;
  if v_statut <> 'approuve' then raise exception 'Export réservé à un dossier approuvé (statut : %).', v_statut; end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.rapport_versions where dossier_id = p_dossier;

  insert into public.rapport_versions (dossier_id, version, snapshot, storage_path, sha256)
    values (p_dossier, v_version, v_snapshot, p_path, p_sha256);

  perform set_config('app.export_ok', '1', true);
  update public.dossiers set statut = 'exporte' where id = p_dossier;

  return v_version;
end;
$$;

revoke execute on function public.enregistrer_export(uuid, text, text) from public, anon;
grant execute on function public.enregistrer_export(uuid, text, text) to authenticated;

-- ─────────────────── (h) Triggers equipements (retour auto A8) ───────────────────
-- Éditer/ajouter/supprimer un équipement d'un dossier approuvé|exporté le renvoie en 'soumis'
-- (la garde (e) posera snapshot_perime=true). Point d'extension unique pour photos/mesures/
-- factures des phases suivantes.
create or replace function public.equipements_retour_auto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dossiers set statut = 'soumis'
    where id = coalesce(new.dossier_id, old.dossier_id)
      and statut in ('approuve', 'exporte');
  return null;
end;
$$;

revoke execute on function public.equipements_retour_auto() from public, anon, authenticated;

create trigger equipements_retour_auto after insert or update or delete on public.equipements
  for each row execute function public.equipements_retour_auto();
