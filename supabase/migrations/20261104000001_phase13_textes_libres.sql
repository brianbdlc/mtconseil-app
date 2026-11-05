-- Phase 13 : emplacements de texte libre (retrait du sommaire calculé et du ROI).
-- Additif uniquement (jamais DROP/RENAME de table/colonne). Le sommaire exécutif et les mesures
-- cessent d'être CALCULÉS : ils deviennent du texte libre collé par l'ingénieur (ses tableaux Optima).
-- On étend le CHECK de rapport_textes.section (4 nouvelles clés) et on copie les mesures
-- structurées existantes vers l'emplacement libre `mesures_etudiees` (SANS ROI, aucun chiffre
-- recalculé). La table `mesures` RESTE (règle additive) ; elle devient vestigiale.

-- (a) Étendre le CHECK (miroir NARRATIVE_SECTIONS, src/lib/statuts.ts). On GARDE
-- 'mesures_mise_en_forme' (anciennes lignes/snapshots valides) même si retirée de l'UI.
alter table public.rapport_textes drop constraint rapport_textes_section_check;
alter table public.rapport_textes add constraint rapport_textes_section_check check (section in (
  'sommaire', 'description_installations', 'humidification_controles', 'electricite',
  'mesures_etudiees', 'mesures_mise_en_forme',
  'problemes_techniques', 'phasage_travaux', 'risques_sse', 'conclusions'
));

-- (b) Copie one-shot des mesures structurées → texte libre `mesures_etudiees`. SANS retour calculé
-- (zéro ROI dans le texte). Idempotent (on conflict do nothing) : ne touche pas un emplacement déjà saisi.
insert into public.rapport_textes (dossier_id, section, texte, source, valide)
select dossier_id,
       'mesures_etudiees',
       string_agg(
         '- ' || coalesce(nom, '(sans nom)') ||
         ' : économies ' || coalesce(economies_annuelles::text, '—') || ' $/an',
         E'\n' order by ordre
       ),
       'humain',
       false
from public.mesures
group by dossier_id
on conflict (dossier_id, section) do nothing;
