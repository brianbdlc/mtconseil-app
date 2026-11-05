-- Phase 12 : annexe Optima (US-50/US-51). Additif uniquement (jamais DROP/RENAME).
-- L'ingénieur TÉLÉVERSE le PDF Optima et le CONFIRME comme les autres parties ; l'app ne le LIT
-- ni ne le recalcule (US-50). Il est fusionné TEL QUEL en annexe du rapport final (Option B).

-- Colonnes sur dossiers (patron Phase 4/5). dossiers porte déjà le trigger log_change →
-- les changements optima_path/optima_confirme sont tracés automatiquement.
alter table public.dossiers
  add column optima_path text,
  add column optima_confirme boolean not null default false,
  add column optima_sha256 text;

-- Bucket privé 'optima' (miroir 'factures'). URLs signées. Un seul PDF par dossier.
insert into storage.buckets (id, name, public) values ('optima', 'optima', false)
  on conflict (id) do nothing;

create policy optima_objects_select on storage.objects for select to authenticated using (bucket_id = 'optima');
create policy optima_objects_insert on storage.objects for insert to authenticated with check (bucket_id = 'optima');
create policy optima_objects_update on storage.objects for update to authenticated using (bucket_id = 'optima') with check (bucket_id = 'optima');
-- DELETE admin-only (miroir Phase 8 : purge à la suppression de dossier).
create policy optima_objects_delete on storage.objects for delete to authenticated using (bucket_id = 'optima' and public.is_admin());
