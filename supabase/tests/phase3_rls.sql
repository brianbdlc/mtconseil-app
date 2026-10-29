-- Tests RLS/triggers Phase 3. Tout est fait dans UN bloc DO qui se termine en levant le
-- sentinel 'PHASE3_RLS_TESTS_OK' → la transaction implicite est ANNULÉE (aucune donnée de test
-- ne persiste, y compris les faux auth.users). Succès = l'exécution échoue sur CE message précis ;
-- toute autre exception = un test a échoué.
--
-- Faux utilisateurs : on insère dans auth.users (le trigger on_auth_user_created crée le profil
-- en 'engineer' car profiles n'est pas vide), puis on UPDATE le profil (contexte service → la
-- garde profiles_guard_role passe car auth.jwt()->>'role' est null).

do $$
declare
  admin_id   uuid := gen_random_uuid();
  eng_id     uuid := gen_random_uuid();
  dossier_id uuid;
  type_used  uuid;
  type_tmp   uuid;
  bconf      boolean;
  r          text;
  rc         int;
begin
  -- ── Setup (contexte service / superuser) ──
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated', 'phase3-admin@test.local', now(), now()),
    ('00000000-0000-0000-0000-000000000000', eng_id,   'authenticated', 'authenticated', 'phase3-eng@test.local',   now(), now());

  update public.profiles set role = 'admin',    actif = true where id = admin_id;
  update public.profiles set role = 'engineer', actif = true where id = eng_id;

  select id into type_used from public.valeurs_defaut order by type limit 1;

  insert into public.dossiers (client) values ('Test Phase 3 RLS') returning id into dossier_id;
  insert into public.equipements (dossier_id, nom, type_id) values (dossier_id, 'Eq test', type_used);

  -- ── Contexte INGÉNIEUR ──
  perform set_config('request.jwt.claims', json_build_object('sub', eng_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  if public.is_admin() then raise exception 'ECHEC: is_admin() vrai pour un ingénieur'; end if;

  -- parametres : écriture refusée (0 ligne via RLS, pas d'exception)
  update public.parametres set valeur = 99 where cle = 'facteur_conversion_gaz';
  get diagnostics rc = row_count;
  if rc <> 0 then raise exception 'ECHEC: ingénieur a modifié parametres'; end if;

  -- profiles.role/actif : bloqué par RLS → état final inchangé (0 ligne, pas d'exception ;
  -- le trigger profiles_guard_role est la défense SECONDAIRE).
  update public.profiles set role = 'admin' where id = eng_id;
  get diagnostics rc = row_count;
  if rc <> 0 then raise exception 'ECHEC: ingénieur a mis à jour profiles (RLS devait bloquer)'; end if;
  select role into r from public.profiles where id = eng_id;
  if r <> 'engineer' then raise exception 'ECHEC: role ingénieur modifié (état final)'; end if;

  -- valeurs_defaut : insert avec confirme=true → forcé à false par le trigger vd_reset
  insert into public.valeurs_defaut (type, poste, confirme)
  values ('ZZ Test Ingénieur', 'autre', true) returning id, confirme into type_tmp, bconf;
  if bconf then raise exception 'ECHEC: confirme non remis à false à l''insert (ingénieur)'; end if;

  update public.valeurs_defaut set confirme = true where id = type_tmp;
  select confirme into bconf from public.valeurs_defaut where id = type_tmp;
  if bconf then raise exception 'ECHEC: confirme non remis à false à l''update (ingénieur)'; end if;

  -- delete d'un type UTILISÉ → FK restrict
  begin
    delete from public.valeurs_defaut where id = type_used;
    raise exception 'ECHEC: suppression d''un type utilisé aurait dû échouer (FK)';
  exception
    when foreign_key_violation then null; -- attendu
  end;

  -- CRUD d'un type NON utilisé → OK (delete du type temporaire)
  delete from public.valeurs_defaut where id = type_tmp;
  get diagnostics rc = row_count;
  if rc <> 1 then raise exception 'ECHEC: suppression d''un type non utilisé a échoué'; end if;

  -- ── Contexte ADMIN (même rôle authenticated, claims = admin) ──
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  if not public.is_admin() then raise exception 'ECHEC: is_admin() faux pour un admin'; end if;

  update public.parametres set valeur = 1.23 where cle = 'facteur_conversion_gaz';
  get diagnostics rc = row_count;
  if rc <> 1 then raise exception 'ECHEC: admin n''a pas pu écrire parametres'; end if;

  -- ── Contexte SERVICE/SUPERUSER (point 2 : promotion + confirme=true possibles) ──
  reset role;
  perform set_config('request.jwt.claims', '', true);

  update public.profiles set role = 'engineer' where id = admin_id;
  get diagnostics rc = row_count;
  if rc <> 1 then raise exception 'ECHEC: service role n''a pas pu changer un role'; end if;

  update public.valeurs_defaut set confirme = true where id = type_used;
  select confirme into bconf from public.valeurs_defaut where id = type_used;
  if not bconf then raise exception 'ECHEC: service role — confirme remis à false par erreur'; end if;

  -- ── Régression : log_change journalise insert/update + le DELETE de valeurs_defaut ──
  if not exists (
    select 1 from public.audit_log
    where table_name = 'valeurs_defaut' and action = 'DELETE' and row_id = type_tmp
  ) then raise exception 'ECHEC: DELETE valeurs_defaut non journalisé'; end if;

  if not exists (
    select 1 from public.audit_log
    where table_name = 'dossiers' and action = 'INSERT' and row_id = dossier_id
  ) then raise exception 'ECHEC: INSERT dossier non journalisé'; end if;

  if not exists (
    select 1 from public.audit_log where table_name = 'equipements' and action = 'INSERT'
  ) then raise exception 'ECHEC: INSERT equipement non journalisé'; end if;

  -- Succès : forcer le rollback de toute la transaction de test.
  raise exception 'PHASE3_RLS_TESTS_OK';
end $$;
