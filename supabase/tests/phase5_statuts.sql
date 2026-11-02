-- Tests RLS/triggers Phase 5 (cycle statuts, approbation, versions, storage). Un seul bloc DO,
-- terminé par le sentinel 'PHASE5_TESTS_OK' → transaction ANNULÉE (rien ne persiste). Succès =
-- l'exécution échoue sur CE message précis ; toute autre exception = un test a échoué.

do $$
declare
  admin_id uuid := gen_random_uuid();
  eng_id   uuid := gen_random_uuid();
  d_id     uuid;
  t_id     uuid;
  snap     jsonb;
  bconf    boolean;
  st       text;
  perime   boolean;
  v        int;
begin
  -- ── Setup (contexte service / superuser) ──
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated', 'phase5-admin@test.local', now(), now()),
    ('00000000-0000-0000-0000-000000000000', eng_id,   'authenticated', 'authenticated', 'phase5-eng@test.local',   now(), now());
  update public.profiles set role = 'admin',    actif = true where id = admin_id;
  update public.profiles set role = 'engineer', actif = true where id = eng_id;

  insert into public.valeurs_defaut (type, poste, facteur_charge, confirme)
  values ('ZZ Phase5 Type', 'chauffage', 0.5, false) returning id into t_id;

  insert into public.dossiers (client) values ('Test Phase 5') returning id into d_id;
  insert into public.equipements (dossier_id, nom, type_id, puissance_valeur, puissance_unite, heures_par_an)
  values (d_id, 'Chaudière', t_id, 10, 'kW', 1000);

  snap := jsonb_build_object(
    'equipements', jsonb_build_array(
      jsonb_build_object('type_id', t_id::text, 'type_facteur_charge', '0.5', 'type_poste', 'chauffage', 'conso', 5000)
    )
  );
  update public.dossiers
    set statut = 'soumis', rapport_snapshot = snap, snapshot_perime = false, soumis_par = eng_id, soumis_le = now()
    where id = d_id;

  -- ── Négatifs INGÉNIEUR (non-admin) ──
  perform set_config('request.jwt.claims', json_build_object('sub', eng_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.dossiers set statut = 'approuve' where id = d_id;
    raise exception 'ECHEC: ingénieur a pu approuver via UPDATE direct';
  exception when others then
    if sqlerrm like 'ECHEC:%' then raise; end if;
  end;

  begin
    insert into public.rapport_versions (dossier_id, version, snapshot, storage_path, sha256)
    values (d_id, 1, snap, 'x/y.docx', 'abc');
    raise exception 'ECHEC: ingénieur a pu insérer rapport_versions';
  exception when others then
    if sqlerrm like 'ECHEC:%' then raise; end if;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('rapports', gen_random_uuid()::text || '/r.docx', eng_id);
    raise exception 'ECHEC: ingénieur a pu uploader dans rapports (dossier non approuvé)';
  exception when others then
    if sqlerrm like 'ECHEC:%' then raise; end if;
  end;

  begin
    perform public.approuver_dossier(d_id, array[t_id]);
    raise exception 'ECHEC: ingénieur a pu appeler approuver_dossier';
  exception when others then
    if sqlerrm like 'ECHEC:%' then raise; end if;
  end;

  -- vd_reset force confirme=false pour un ingénieur (pas d'exception).
  update public.valeurs_defaut set confirme = true where id = t_id;
  select confirme into bconf from public.valeurs_defaut where id = t_id;
  if bconf then raise exception 'ECHEC: confirme non remis à false pour un ingénieur'; end if;

  -- ── Négatif ADMIN : valeur par défaut modifiée depuis le snapshot (A3) ──
  reset role;
  perform set_config('request.jwt.claims', '', true);
  update public.valeurs_defaut set facteur_charge = 0.9 where id = t_id; -- diffère du snapshot (0.5)

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.approuver_dossier(d_id, array[t_id]);
    raise exception 'ECHEC: approbation acceptée malgré une valeur par défaut modifiée';
  exception when others then
    if sqlerrm like 'ECHEC:%' then raise; end if;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  update public.valeurs_defaut set facteur_charge = 0.5 where id = t_id;

  -- ── Happy path : approbation ──
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.approuver_dossier(d_id, array[t_id]);
  select statut into st from public.dossiers where id = d_id;
  if st <> 'approuve' then raise exception 'ECHEC: statut non approuvé (%)', st; end if;
  select confirme into bconf from public.valeurs_defaut where id = t_id;
  if not bconf then raise exception 'ECHEC: valeur par défaut non confirmée après approbation'; end if;

  -- ── Retour auto : éditer un équipement d'un dossier approuvé → soumis + périmé ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', eng_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.equipements set nom = 'Chaudière (modifiée)' where dossier_id = d_id;
  reset role;
  select statut, snapshot_perime into st, perime from public.dossiers where id = d_id;
  if st <> 'soumis' or not perime then raise exception 'ECHEC: retour auto absent (statut=% perime=%)', st, perime; end if;

  -- Approbation d'un dossier périmé refusée.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.approuver_dossier(d_id, array[]::uuid[]);
    raise exception 'ECHEC: approbation acceptée sur un dossier périmé';
  exception when others then
    if sqlerrm like 'ECHEC:%' then raise; end if;
  end;

  -- ── Re-soumission puis ré-approbation (valeur déjà confirmée → rien à confirmer) ──
  reset role;
  perform set_config('request.jwt.claims', '', true);
  update public.dossiers set statut = 'soumis', snapshot_perime = false, rapport_snapshot = snap where id = d_id;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.approuver_dossier(d_id, array[]::uuid[]);
  select statut into st from public.dossiers where id = d_id;
  if st <> 'approuve' then raise exception 'ECHEC: ré-approbation échouée (%)', st; end if;

  -- ── enregistrer_export : v1, statut exporté, puis re-appel refusé (plus approuvé) ──
  v := public.enregistrer_export(d_id, d_id::text || '/v1.docx', 'sha-1');
  if v <> 1 then raise exception 'ECHEC: version export attendue 1, obtenue %', v; end if;
  select statut into st from public.dossiers where id = d_id;
  if st <> 'exporte' then raise exception 'ECHEC: statut non exporté (%)', st; end if;
  if not exists (select 1 from public.rapport_versions where dossier_id = d_id and version = 1) then
    raise exception 'ECHEC: rapport_versions v1 absent';
  end if;
  begin
    perform public.enregistrer_export(d_id, d_id::text || '/v2.docx', 'sha-2');
    raise exception 'ECHEC: export accepté alors que le dossier est déjà exporté';
  exception when others then
    if sqlerrm like 'ECHEC:%' then raise; end if;
  end;

  raise exception 'PHASE5_TESTS_OK';
end $$;
