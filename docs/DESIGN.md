# Design System — MT Conseil (audit énergétique)

## Product Context
- **Quoi** : outil web interne qui prépare des brouillons de rapports d'audit énergétique (fiches d'équipement lues sur photos, calculs de consommation, assemblage du rapport Word). L'IA propose, le code calcule, l'ingénieur valide et signe.
- **Pour qui** : les ingénieurs de MT Conseil (Luis de la Cruz, admin). Le client final ne se connecte jamais.
- **Espace** : outil technique d'ingénierie data-dense — fiches, tableaux, états de validation (famille Linear / Retool / outils d'inspection, pas SaaS marketing).
- **Type** : outil interne data-dense.
- **Memorable thing** : « Sérieux, fiable, *ça ne ment pas*. » L'interface d'un instrument de précision où l'incertitude est toujours visible.

## Aesthetic Direction
- **Direction** : Industrial / Instrument de précision. La fonction d'abord, zéro décoration.
- **Décoration** : minimal — la typo et la couleur d'état font tout le travail. Pas de texture, pas de gradient, pas d'ombre marketing.
- **Mood** : sobre, dense, net. On fait confiance à l'outil parce qu'il ne cache rien : un champ incertain reste vide et visiblement marqué.
- **Références** : — (proposé depuis la connaissance design, pas de recherche web).

## Typography
- **Display/Hero** : **General Sans** (Fontshare) — grotesk technique et précis pour titres et en-têtes ; distinctif sans être surexploité.
- **Body** : **Geist** (Google Fonts) — excellente lisibilité en dense, ADN ingénierie ; supporte tabular-nums, donc sert aussi les chiffres de tableau.
- **Data/Tables** : **Geist** avec `font-variant-numeric: tabular-nums` — colonnes de chiffres alignées.
- **Code / valeurs lues** : **JetBrains Mono** (Google Fonts) — réservé aux valeurs **lues par l'IA**, aux unités (kW, HP, BTU/h), aux codes (ODS25001) et aux extraits de calcul. Règle de sens : le mono = « ceci est une lecture machine, à vérifier » ; le sans = « rédigé/saisi par un humain ».
- **Loading** :
  - `https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap`
  - `https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap`
- **Scale** (px) : 11 / 12 / 13 / 14 / 15 / 18 / 22 / 30 / 40

## Color
- **Approche** : restrained — neutres froids + **un seul** accent ; la couleur sémantique (états) est le vrai outil de hiérarchie, parce que les états SONT le produit.
- **Primary** : `#1B4D6B` bleu pétrole — actions primaires, focus, liens, accent de marque. Hover `#16405A`. Soft `#E7EEF3`.
- **Secondary** : pas de couleur secondaire ; les boutons secondaires sont neutres (bordure `#C3CAD2`).
- **Neutrals** (clair → foncé) : `#FFFFFF` · `#F7F8FA` (fond) · `#EDEFF2` · `#DDE2E8` (bordure) · `#C3CAD2` · `#9AA4AF` · `#6B7682` · `#4A545E` · `#2A323A` · `#141A1F` (ink).
- **Semantic** : success / **validé / lisible** `#1F7A4D` · warning / **à confirmer / partiel** `#9A6410` · error / **illisible** `#B42318` · info `#1B4D6B` (famille primary).
- **États de champ (primitive produit)** : chaque champ porte **(1)** une confiance de lecture — `lisible` (vert) / `partiel` (ambre) / `illisible` (rouge) — et **(2)** un statut de validation — `validé` (vert) / `à confirmer` (ambre) / `non validé` (pastille neutre à bordure pointillée). Toujours rendus comme pastilles (`chip`) cohérentes. Un équipement hors catégorie est signalé en rouge « à traiter », jamais deviné.
- **Dark mode** : light-first (l'écran reflète la sortie Word / le document papier). Tokens posés en custom properties pour permettre un dark mode ultérieur sans refonte ; non livré au MVP.

## Spacing
- **Base** : 4px.
- **Densité** : compacte-confortable — dense pour scanner beaucoup de données, sans être à l'étroit.
- **Scale** : 2xs(2) xs(4) sm(8) md(12) lg(16) xl(24) 2xl(32) 3xl(48).

## Layout
- **Approche** : grid-disciplined — colonnes strictes, alignement prévisible pour tableaux et fiches.
- **Grid** : app shell = sidebar fixe (~200px) + zone de contenu fluide ; contenu sur grille 12 colonnes au besoin. Fiche d'équipement = 2 colonnes (photos | champs).
- **Max content width** : ~1120px pour les vues denses ; tableaux dans un conteneur `overflow-x:auto`.
- **Border radius** : sm:4px, md:6px, lg:8px, full:9999px (pastilles seulement). Bords nets — un instrument n'est pas bubble.

## Motion
- **Approche** : minimal-fonctionnel — uniquement ce qui aide la compréhension (focus, bascule d'état validé/non validé, bannière de verrou). Aucune animation décorative.
- **Easing** : enter(ease-out) · exit(ease-in) · move(ease-in-out).
- **Duration** : micro(50-100ms) focus/hover · court(150-250ms) transitions d'état · pas de long.

## Decisions Log
| Date | Décision | Rationale |
|------|----------|-----------|
| 2026-10-19 | Création initiale | /design — outil interne data-dense ; memorable thing « sérieux, fiable, ça ne ment pas » ; proposé depuis la connaissance (pas de recherche web). |
| 2026-10-19 | Mono réservé aux valeurs lues par l'IA | Rendre visible dans la typo la règle fondatrice « l'IA lit, ne devine pas » : mono = lecture machine à vérifier, sans = saisi/rédigé par l'humain. |
| 2026-10-19 | Système d'états = primitive de design de 1er plan | La promesse de confiance du produit (lisible/partiel/illisible, non validé/validé/à confirmer) doit être visible et cohérente partout. |
| 2026-10-19 | Light-first, dark mode reporté | L'écran reflète la sortie Word (document) ; dark mode possible plus tard via tokens, hors MVP. |
