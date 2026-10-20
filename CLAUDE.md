# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Application web d'audit énergétique pour MT Conseil : un dossier par bâtiment où le code calcule, l'IA lit et propose sous validation, et l'ingénieur confirme — jusqu'au rapport Word signé par Luis.

Stack : Next.js (App Router) + Supabase (Auth, Postgres+RLS, Storage) + Trigger.dev + API Anthropic.

Documents de référence (à lire avant toute implémentation) :
- `docs/PRD.md` — problème, périmètre, user stories.
- `docs/PLAN.md` — décisions architecturales et découpage en phases.
- `docs/DESIGN.md` — système visuel.
