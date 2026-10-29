# Plan : Application d'audit énergétique MT Conseil

> PRD source : `docs/PRD.md`

Découpage en tranches verticales (tracer bullets), livrables une à une. Priorité PRD : le rapport Word validé en premier par Luis → la Phase 1 traverse toute la pile et produit un `.docx` dès la fin.

## Décisions architecturales

Décisions durables qui s'appliquent à toutes les phases :

- **Stack** : Next.js (App Router) + Supabase (Auth, Postgres+RLS, Storage) + Trigger.dev (jobs longs) + API Anthropic (Claude vision/texte).
- **Hébergement** : Vercel + Supabase région **Canada (ca-central)**. Ne règle pas la Loi 25 côté Anthropic (photos/factures sortent du Québec) → contrainte opérationnelle, pas technique.
- **Règle fondatrice** : l'IA ne calcule ni ne devine. **Le code calcule** (module TS pur), l'IA **lit/propose** sous validation, l'ingénieur **confirme**. Un champ incertain reste **vide (`null`)**.
- **« Quatre acteurs »** = patron de **flux de données**, pas d'agents autonomes : drapeaux `validé` en base + appels Claude ciblés (jobs Trigger.dev) + code d'assemblage. L'assembleur ne lit **que du validé** (requête filtrée).
- **Routes** (App Router) : `/login`, `/dossiers`, `/dossiers/[id]`, `/dossiers/[id]/equipements/[eqId]`, `/dossiers/[id]/factures`, `/dossiers/[id]/mesures`, `/dossiers/[id]/rapport`, `/valeurs-defaut` (tous les ingénieurs), `/admin/parametres` (admin), `/admin/comptes`, `/admin/modele`.
- **Modèles clés** (tables Postgres) : `profiles` (rôle `admin|engineer`, actif/inactif), `dossiers` (client, adresse, statut, ingénieur responsable), `equipements` (champs + unité d'origine + `validated` + confiance par champ), `photos`, `photo_groupes`, `default_values` (type → facteur de charge + poste de consommation + `confirmé`), `factures`, `mesures`, `rapports` (versions + snapshot JSON gelé), `report_templates` (textes fixes + numéro de version), `audit_log` (immuable, append-only).
- **Validation** : par champ, jamais en bloc. Confiance en 3 états (`lisible | partiel | illisible`) + vérifs de plausibilité du code. Unité conservée, convertie avant tout calcul.
- **Permissions** : RLS **dès la première migration**. Modèle 2 rôles au départ (`admin|engineer`, tous voient tous les dossiers) ; droits fins par personne en Phase 8. Réservés admin dès qu'ils existent : approbation, table des valeurs par défaut, seuil de cohérence, textes fixes, suppression dossier, gestion des comptes, forcer un verrou, autoriser une soumission incomplète.
- **Journal** : immuable, écrit par trigger Postgres (qui, quand, ancienne/nouvelle valeur) ; couvre données, approbations, statuts, exports. Policies refusant UPDATE/DELETE.
- **Gel des valeurs** : snapshot JSON figé à la **soumission** ; un brouillon se recalcule.
- **Migrations** : additives uniquement (jamais DROP/RENAME destructif). Projet Supabase lié = DEV.
- **Loi 25** : aucun appel Anthropic sur données réelles non anonymisées avant accord écrit de Luis (NDA + usage API + non-entraînement).
- **Tests** : chaque fonction de calcul (chemin métier non trivial) livre un `test_*` ou `demo()` à assertions.

---

## Phase 1 : Colonne vertébrale (sans IA) — *priorité*

**User stories** : US-4, US-8, US-18, US-26, US-7

### Ce qu'on livre

Un ingénieur se connecte, crée un dossier (client, adresse, statut), y ajoute un équipement **à la main** (puissance + unité, heures, facteur de charge), le code calcule la consommation annuelle (kWh/an) en convertissant l'unité, puis l'ingénieur exporte un `.docx` (modèle **provisoire**, docxtemplater, généré par un job Trigger.dev et déposé dans Storage) contenant cet équipement et son calcul. Chaque action est tracée au journal immuable.

### Critères d'acceptation

- [x] Connexion email + mot de passe avec récupération ; **pas d'auto-inscription** (comptes créés par l'admin, seedé au départ).
- [x] Création d'un dossier ; les ingénieurs voient tous les dossiers (RLS active sur toutes les tables).
- [x] Ajout d'un équipement manuel avec puissance + **unité** (kW/HP/BTU·h) ; le code convertit avant calcul.
- [x] Le code calcule la conso annuelle (puissance × heures × facteur de charge) — aucune valeur numérique issue de l'IA.
- [x] Export d'un `.docx` provisoire contenant le dossier et l'équipement ; lien de téléchargement.
- [x] Journal immuable enregistre create/update (qui, quand, ancienne/nouvelle valeur) ; UPDATE/DELETE refusés.
- [x] Tests à assertions sur la conversion d'unités et le calcul de conso.
- [x] **Point de swap** du vrai modèle `.docx` de Luis documenté dans le code.

## Bloquée par

- Aucune — démarrable immédiatement.

---

## Phase 2 : Photos + lecture de plaques IA

**User stories** : US-11, US-12, US-13, US-14, US-15, US-16, US-17, US-19, US-20, US-21

### Ce qu'on livre

L'ingénieur téléverse en lot ses photos de chantier (30-60), les HEIC sont convertis, un téléversement interrompu reprend. Le code propose des groupes (plaque/équipement/emplacement) par heure de prise de vue (secours par nom de fichier). L'ingénieur confirme chaque groupe, l'assigne à un équipement (renommage dans l'app, fichiers d'origine intacts), ou crée un équipement sans photo. Un appel Claude vision lit la plaque et **propose** marque/modèle/puissance/année — chaque champ reste non validé, avec confiance 3 états et unité conservée ; un champ incertain reste vide ; le code vérifie la plausibilité ; le rendement porte sa source citée (lien cliquable). L'ingénieur valide **champ par champ**.

### Critères d'acceptation

- [x] Upload en lot, conversion HEIC, reprise d'un upload interrompu.
- [x] Groupes proposés par heure de prise de vue, secours par nom de fichier ; confirmation par groupe.
- [x] Assignation à un équipement + renommage dans l'app ; création d'équipement sans photo.
- [x] Claude lit la plaque et propose les valeurs ; chaque champ `validated=false`, confiance (lisible/partiel/illisible), unité conservée, champ incertain = vide.
- [x] Vérifs de plausibilité par le code ; rendement avec lien cliquable vers la fiche fabricant.
- [x] Validation obligatoire champ par champ (pas de validation en bloc).

## Bloquée par

- Phase 1.

---

## Phase 3 : Valeurs par défaut + bilan par poste

**User stories** : US-22, US-23, US-24, US-25, US-27, US-28, US-29, US-31

### Ce qu'on livre

La table des valeurs par défaut (facteur de charge par type, rattaché à un poste de consommation) est **éditable par tous les ingénieurs** et journalisée ; **toute modification repasse la ligne à « à confirmer »** et la confirmation est **reportée à l'approbation du rapport (Phase 5)** — pas de bouton « confirmer » en Phase 3. Un équipement peut surcharger le facteur de son type au cas par cas avec une raison écrite tracée. Seuls restent admin-only : le facteur de conversion du gaz (`parametres`) et `profiles.role/actif`. Un formulaire décrit le bâtiment (superficie + unité m²/pi², année, usage, quantité de gaz). Le code calcule le bilan par poste et l'intensité énergétique (kWh/m²), convertit le gaz Énergir en équivalent énergétique **affiché à part et jamais additionné au total**, et signale tout équipement hors catégorie (jamais deviné).

### Critères d'acceptation

- [ ] CRUD table des valeurs par défaut (10-15 types), ouvert à tout ingénieur (journalisé) ; chaque modification la repasse à « à confirmer ».
- [ ] Confirmation reportée à l'approbation (Phase 5) ; surcharge au cas par cas avec raison écrite obligatoire (tracée au journal). `parametres` + `profiles.role/actif` restent admin-only (RLS).
- [ ] Chaque type rattaché à un poste ; équipement hors catégorie **signalé** (rouge « à traiter »), exclu du détail par poste mais compté au total.
- [ ] Formulaire de description du bâtiment (superficie/unité, année avertie hors [1800, année courante], usage, gaz).
- [ ] Code = **source unique** du calcul (liste, fiche ET export .docx recalculent) : bilan par poste + kWh/m² sur le total équipements (toutes énergies) + équivalent énergétique du gaz à part ; tests à assertions.

## Bloquée par

- Phase 1.

---

## Phase 4 : Assembleur — contrôles de complétude et cohérence

**User stories** : US-34, US-35, US-36, US-37, US-38

### Ce qu'on livre

L'assembleur relit le dossier : il signale toute fiche non validée ou donnée manquante et **bloque la soumission** (complétude) ; l'admin peut autoriser une soumission incomplète avec une raison écrite. Il compare la conso estimée des équipements à celle des factures et alerte si l'écart dépasse le seuil réglable (20 % par défaut) ; sans factures, il affiche « non disponible ». Il génère le sommaire exécutif et son tableau résumé.

### Critères d'acceptation

- [ ] Contrôle de complétude : liste fiches non validées / données manquantes ; bloque la soumission.
- [ ] Admin peut autoriser incomplet avec raison écrite (tracée).
- [ ] Contrôle de cohérence : écart > seuil (défaut 20 %, réglable par l'admin) → alerte ; sans factures → « non disponible ».
- [ ] Sommaire exécutif + tableau résumé générés.

> **Report Phase 3 → 4** :
> - Un équipement **sans type** ou un type **sans facteur** = **donnée manquante** à traiter par le contrôle de complétude (en Phase 3 ils sont seulement signalés / exclus du calcul).
> - Le contrôle de cohérence doit comparer des totaux **de même nature** : le total équipements est **toutes énergies** (les équipements au gaz convertis en kWh y sont déjà), à opposer aux factures **élec + gaz** — pas à l'électricité seule. Décision à prendre avec Luis : les équipements au gaz figurent-ils bien dans l'inventaire, et faut-il un champ « énergie » par type pour ventiler élec/gaz proprement ?

## Bloquée par

- Phase 2 (fiches validées), Phase 3 (bilan).

---

## Phase 5 : Statuts, approbation et versions

**User stories** : US-30, US-44, US-45, US-46, US-47, US-48

### Ce qu'on livre

Le rapport avance dans les statuts Brouillon → Soumis → Approuvé → Exporté, plus « À corriger » quand Luis renvoie avec des commentaires (un champ par section). À la soumission, les valeurs sont **gelées dans un snapshot JSON** ; un brouillon se recalcule. Luis peut corriger lui-même, approuver, et approuver ses propres rapports (tracé). Toute modification après approbation repasse à « Soumis ». L'export est bloqué hors « Approuvé ». Chaque export est conservé tel qu'envoyé ; une modification ultérieure crée une nouvelle version.

### Critères d'acceptation

- [ ] Statuts Brouillon → Soumis → Approuvé → Exporté + « À corriger » (commentaires par section).
- [ ] Gel des valeurs (snapshot JSON) à la soumission ; brouillon recalculé.
- [ ] Approbation réservée à l'admin ; Luis peut approuver ses propres rapports (tracé).
- [ ] Modification après approbation → retour à « Soumis » ; export bloqué hors « Approuvé ».
- [ ] Chaque export conservé ; modification ultérieure = nouvelle version.

> **Report Phase 3 → 5** :
> - Le trigger de reset `vd_reset_confirme` ne vise aujourd'hui que l'écriture **connectée non-admin**. En Phase 5, il devra aussi **remettre `confirme=false` dès que `facteur_charge` ou `poste` change, même par un admin** (une valeur confirmée ne doit pas rester confirmée après modification de sa substance).
> - Décider **comment l'approbation pose le drapeau** `confirme=true` (via le journal / un bloc « À réviser ») puisqu'il n'y a pas de bouton « confirmer » en Phase 3.

## Bloquée par

- Phase 4.

---

## Phase 6 : Factures *(conçue après 3-4 vraies factures)*

**User stories** : US-32

### Ce qu'on livre

L'ingénieur téléverse les factures d'énergie (Hydro-Québec, Énergir) sur plusieurs périodes ; Claude propose les chiffres, le code les vérifie (somme des périodes, dates qui se suivent) et signale les doutes, l'ingénieur confirme ; saisie manuelle si l'extraction échoue. Ces chiffres alimentent le contrôle de cohérence de la Phase 4.

### Critères d'acceptation

- [ ] Upload de factures multi-périodes ; Claude propose, le code vérifie (sommes, continuité des dates).
- [ ] Doutes signalés ; confirmation par l'ingénieur ; saisie manuelle en repli.
- [ ] Les factures confirmées alimentent le contrôle de cohérence (Phase 4).
- [ ] *Design final arrêté une fois 3-4 vraies factures observées.*

## Bloquée par

- Phase 4.

---

## Phase 7 : Mesures/ROI + rédaction assistée + modèle éditable

**User stories** : US-33, US-40, US-41, US-42, US-43

### Ce qu'on livre

L'ingénieur remplit à la main le tableau des mesures (nom, économies, coût, subvention) et le code calcule le ROI — l'app n'invente jamais une mesure ni un chiffre. L'IA rédige un brouillon de la description des installations à partir des fiches validées, dans le style des anciens rapports, et met en forme les mesures/conclusions décidées par l'ingénieur ; les sections de jugement sont rédigées à la main. L'admin édite les textes fixes du modèle (méthodologie, ASHRAE, risques SSE génériques), chaque rapport portant le numéro de version du modèle utilisé.

### Critères d'acceptation

- [ ] Tableau des mesures saisi à la main ; code calcule le ROI (tests à assertions) ; aucune mesure/économie inventée.
- [ ] Brouillon IA de la description des installations à partir des fiches validées, style ancien rapport.
- [ ] Mise en forme IA des mesures/conclusions décidées par l'ingénieur ; sections de jugement à la main.
- [ ] Textes fixes du modèle éditables par l'admin ; numéro de version du modèle inscrit sur chaque rapport.

## Bloquée par

- Phase 2 (fiches validées), Phase 3 (mesures/calculs).

---

## Phase 8 : Permissions fines + verrou + notifications + liste enrichie

**User stories** : US-1, US-2, US-3, US-5, US-6, US-9, US-10, US-49

### Ce qu'on livre

L'admin active les droits personne par personne (voir [défaut on] / modifier / valider / exporter), le droit d'approuver lui restant réservé et distinct de « valider une étape ». Il peut désactiver un compte sans effacer l'historique. Un verrou d'édition affiche « X modifie cette fiche », expire sur inactivité et est forçable par Luis. La liste des dossiers montre statut + ingénieur responsable avec filtre et recherche ; l'admin peut supprimer un dossier avec ses photos et factures. Des courriels (Resend) partent à Luis à la soumission et à l'ingénieur à l'approbation/au renvoi.

### Critères d'acceptation

- [ ] Droits activables par personne (voir/modifier/valider/exporter) ; approbation réservée admin et distincte de « valider ».
- [ ] Désactivation d'un compte sans perte d'historique.
- [ ] Verrou d'édition avec message, expiration sur inactivité, forçable par l'admin.
- [ ] Liste des dossiers avec statut, ingénieur responsable, filtre et recherche.
- [ ] Suppression d'un dossier (admin) avec ses photos et factures.
- [ ] Courriels : à Luis à la soumission ; à l'ingénieur à l'approbation/au renvoi.

## Bloquée par

- Phase 1 (auth), Phase 5 (événements de statut pour les notifications).
