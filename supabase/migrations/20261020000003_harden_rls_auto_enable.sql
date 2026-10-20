-- Durcissement : la fonction d'event trigger public.rls_auto_enable() (event trigger
-- `ensure_rls`, ddl_command_end) existait en base mais n'était pas versionnée dans le repo.
-- Elle force RLS sur toute nouvelle table du schéma `public` (garde-fou).
-- Advisors 0028/0029 : étant SECURITY DEFINER dans un schéma exposé, elle est appelable en
-- RPC par anon/authenticated. On RETIRE ce droit. Un event trigger n'a PAS besoin du
-- privilège EXECUTE pour se déclencher → le garde-fou continue de tourner.
-- Additif : aucun DROP. `create or replace` reprend la définition RÉELLE lue via
-- pg_get_functiondef (pas de mémoire), l'event trigger `ensure_rls` reste rattaché.

create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
