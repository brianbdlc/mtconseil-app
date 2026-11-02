-- Phase 4 : assembleur (complétude, cohérence, soumission minimale). Additif uniquement.
-- Pas de gel/snapshot, approbation, versions ni verrouillage export → Phase 5.

-- Autorisation « soumission incomplète » tracée : la MàJ de dossiers est déjà captée par
-- log_change (audit_log) → traçabilité sans helper. Le garde « incomplet = admin seulement »
-- vit dans l'action serveur (cohérent rôles Phase 1/2 ; durcissement RLS = Phase 8).
alter table public.dossiers
  add column soumission_incomplete_raison text,
  add column soumission_incomplete_par   uuid references public.profiles (id);

-- Seuil de cohérence (US-37), réglable par admin (RLS parametres déjà is_admin()-gardée).
insert into public.parametres (cle, valeur, unite, source, confirme)
values ('seuil_coherence', 20, '%', 'Défaut 20 % (US-37), réglable par admin', true)
on conflict (cle) do nothing;
