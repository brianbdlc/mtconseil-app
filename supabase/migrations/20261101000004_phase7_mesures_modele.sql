-- Phase 7 : mesures/ROI + sections narratives + modèle éditable (US-33, US-40..43).
-- Additif uniquement (jamais DROP/RENAME). Règle fondatrice : le CODE calcule le ROI, l'IA RÉDIGE
-- /MET EN FORME sous validation (jamais d'invention), l'ingénieur confirme. PK uuid obligatoire
-- partout pour réutiliser log_change tel quel (row_id uuid = new.id).

-- ────────────────────────────── (a) mesures (saisie ingénieur, pas d'IA) ──────────────────────────────
-- conso_kwh_an NON stockée : le ROI vient du code (src/lib/mesures.ts), zéro valeur inventée.

create table public.mesures (
  id                  uuid primary key default gen_random_uuid(),
  dossier_id          uuid not null references public.dossiers (id) on delete cascade,
  nom                 text,
  economies_annuelles numeric,                       -- $/an
  cout_investissement numeric,                       -- $
  subvention          numeric not null default 0,    -- $
  ordre               integer not null default 0,    -- tri d'affichage
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index mesures_dossier_id_idx on public.mesures (dossier_id);

create trigger touch_mesures        before update          on public.mesures for each row execute function public.touch_updated_at();
create trigger log_mesures          after insert or update on public.mesures for each row execute function public.log_change();
create trigger log_mesures_delete   after delete           on public.mesures for each row execute function public.log_change();

alter table public.mesures enable row level security;
-- Miroir factures, + DELETE (on expose la suppression de ligne de mesure dans l'UI).
create policy mesures_select on public.mesures for select to authenticated using (true);
create policy mesures_insert on public.mesures for insert to authenticated with check (true);
create policy mesures_update on public.mesures for update to authenticated using (true) with check (true);
create policy mesures_delete on public.mesures for delete to authenticated using (true);

-- ────────────────────────── (b) rapport_textes (sections narratives, IA ou main) ──────────────────────────
-- section ∈ liste fixe (miroir NARRATIVE_SECTIONS, src/lib/statuts.ts). source='ia' = brouillon à
-- valider ; l'assembleur ne lit QUE valide=true.

create table public.rapport_textes (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null references public.dossiers (id) on delete cascade,
  section     text not null check (section in (
    'description_installations', 'mesures_mise_en_forme',
    'problemes_techniques', 'phasage_travaux', 'risques_sse', 'conclusions'
  )),
  texte       text,
  source      text not null default 'humain' check (source in ('humain', 'ia')),
  valide      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (dossier_id, section)
);

create index rapport_textes_dossier_id_idx on public.rapport_textes (dossier_id);

create trigger touch_rapport_textes before update          on public.rapport_textes for each row execute function public.touch_updated_at();
create trigger log_rapport_textes   after insert or update on public.rapport_textes for each row execute function public.log_change();

alter table public.rapport_textes enable row level security;
create policy rapport_textes_select on public.rapport_textes for select to authenticated using (true);
create policy rapport_textes_insert on public.rapport_textes for insert to authenticated with check (true);
create policy rapport_textes_update on public.rapport_textes for update to authenticated using (true) with check (true);

-- ────────────────────── (c) report_templates (textes fixes, admin-only, versionné) ──────────────────────
-- Modèle mutable + compteur : l'édition admin met à jour la ligne et incrémente version. Pas de
-- table d'historique : chaque rapport gèle le texte réel + le n° dans son snapshot (immuable) ;
-- audit_log conserve l'historique old/new.

create table public.report_templates (
  id            uuid primary key default gen_random_uuid(),
  methodologie  text,
  norme_ashrae  text,
  risques_sse   text,
  version       integer not null default 1,
  updated_at    timestamptz not null default now()
);

create trigger touch_report_templates before update          on public.report_templates for each row execute function public.touch_updated_at();
create trigger log_report_templates   after insert or update on public.report_templates for each row execute function public.log_change();

alter table public.report_templates enable row level security;
-- Lecture pour tous ; écriture admin-only (miroir parametres).
create policy report_templates_select on public.report_templates for select to authenticated using (true);
create policy report_templates_insert on public.report_templates for insert to authenticated with check (public.is_admin());
create policy report_templates_update on public.report_templates for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy report_templates_delete on public.report_templates for delete to authenticated using (public.is_admin());

-- Seed : une ligne version=1 avec des textes placeholder (remplacés par ceux de Luis en admin).
insert into public.report_templates (methodologie, norme_ashrae, risques_sse, version)
values (
  'Méthodologie d''audit énergétique (texte provisoire — à remplacer par le modèle de Luis).',
  'Norme ASHRAE applicable (texte provisoire).',
  'Risques SSE génériques de chantier (texte provisoire).',
  1
);

-- ────────────────────── (d) enregistrer_export : gèle modele_version depuis le snapshot ──────────────────────
-- create or replace (additif). rapport_versions.modele_version existe déjà (phase5, défaut 'provisoire').

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

  insert into public.rapport_versions (dossier_id, version, snapshot, storage_path, sha256, modele_version)
    values (p_dossier, v_version, v_snapshot, p_path, p_sha256,
            coalesce(v_snapshot->>'modele_version', 'provisoire'));

  perform set_config('app.export_ok', '1', true);
  update public.dossiers set statut = 'exporte' where id = p_dossier;

  return v_version;
end;
$$;

revoke execute on function public.enregistrer_export(uuid, text, text) from public, anon;
grant execute on function public.enregistrer_export(uuid, text, text) to authenticated;
