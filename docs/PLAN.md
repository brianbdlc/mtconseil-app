# Plan : Application d'audit énergétique MT Conseil

> PRD source : `docs/PRD.md`

Découpage en tranches verticales (tracer bullets), livrables une à une. Priorité PRD : le rapport Word validé en premier par Luis → la Phase 1 traverse toute la pile et produit un `.docx` dès la fin.

## Décisions architecturales

Décisions durables qui s'appliquent à toutes les phases :

- **Stack** : Next.js (App Router) + Supabase (Auth, Postgres+RLS, Storage) + API Anthropic (Claude vision/texte). **Trigger.dev abandonné** : l'export `.docx` est une **route synchrone** (`/dossiers/[id]/export`) qui rend, dépose dans Storage et versionne en ligne (Phase 5) ; les lectures de plaque appellent l'API Anthropic directement (Phase 2). À réintroduire seulement si un vrai job long apparaît.
- **Hébergement** : Vercel + Supabase région **Canada (ca-central)**. Ne règle pas la Loi 25 côté Anthropic (photos/factures sortent du Québec) → contrainte opérationnelle, pas technique.
- **Règle fondatrice** : l'IA ne calcule ni ne devine. **Le code calcule** (module TS pur), l'IA **lit/propose** sous validation, l'ingénieur **confirme**. Un champ incertain reste **vide (`null`)**.
- **« Quatre acteurs »** = patron de **flux de données**, pas d'agents autonomes : drapeaux `validé` en base + appels Claude ciblés + code d'assemblage. L'assembleur ne lit **que du validé** (requête filtrée).
- **Routes** (App Router) : `/login`, `/dossiers`, `/dossiers/[id]`, `/dossiers/[id]/equipements/[eqId]`, `/dossiers/[id]/factures`, `/dossiers/[id]/mesures`, `/dossiers/[id]/rapport`, `/valeurs-defaut` (tous les ingénieurs), `/admin/parametres` (admin), `/admin/comptes`, `/admin/modele`.
- **Modèles clés** (tables Postgres) : `profiles` (rôle `admin|engineer`, actif/inactif), `dossiers` (client, adresse, statut, ingénieur responsable), `equipements` (champs + unité d'origine + `validated` + confiance par champ), `photos`, `photo_groupes`, `default_values` (type → facteur de charge + poste de consommation + `confirmé`), `factures`, `mesures`, `rapport_versions` (un enregistrement par export : snapshot JSON gelé + chemin Storage + sha256 ; le `statut` et le snapshot courant vivent sur `dossiers`, **pas de table `rapports`**), `report_templates` (textes fixes + numéro de version, **Phase 7**), `audit_log` (immuable, append-only).
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

Un ingénieur se connecte, crée un dossier (client, adresse, statut), y ajoute un équipement **à la main** (puissance + unité, heures, facteur de charge), le code calcule la consommation annuelle (kWh/an) en convertissant l'unité, puis l'ingénieur exporte un `.docx` (modèle **provisoire**, docxtemplater, rendu par une **route synchrone** — le dépôt Storage + versionnage arrivent en Phase 5) contenant cet équipement et son calcul. Chaque action est tracée au journal immuable.

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

- [x] CRUD table des valeurs par défaut (14 types seedés), ouvert à tout ingénieur (journalisé) ; chaque modification la repasse à « à confirmer ».
- [x] Confirmation reportée à l'approbation (Phase 5) ; surcharge au cas par cas avec raison écrite obligatoire (tracée au journal). `parametres` + `profiles.role/actif` restent admin-only (RLS).
- [x] Chaque type rattaché à un poste ; équipement hors catégorie **signalé** (rouge « à traiter »), exclu du détail par poste mais compté au total.
- [x] Formulaire de description du bâtiment (superficie/unité, année avertie hors [1800, année courante], usage, gaz).
- [x] Code = **source unique** du calcul (liste, fiche ET export .docx recalculent) : bilan par poste + kWh/m² sur le total équipements (toutes énergies) + équivalent énergétique du gaz à part ; tests à assertions.

## Bloquée par

- Phase 1.

---

## Phase 4 : Assembleur — contrôles de complétude et cohérence

**User stories** : US-34, US-35, US-36, US-37, US-38

### Ce qu'on livre

L'assembleur relit le dossier : il signale toute fiche non validée ou donnée manquante et **bloque la soumission** (complétude) ; l'admin peut autoriser une soumission incomplète avec une raison écrite. Il compare la conso estimée des équipements à celle des factures et alerte si l'écart dépasse le seuil réglable (20 % par défaut) ; sans factures, il affiche « non disponible ». Il génère le sommaire exécutif et son tableau résumé.

### Critères d'acceptation

- [x] Contrôle de complétude : liste fiches non validées / données manquantes ; bloque la soumission.
- [x] Admin peut autoriser incomplet avec raison écrite (tracée).
- [x] Contrôle de cohérence : écart > seuil (défaut 20 %, réglable par l'admin) → alerte ; sans factures → « non disponible ».
- [x] Sommaire exécutif + tableau résumé générés.

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

- [x] Statuts Brouillon → Soumis → Approuvé → Exporté + « À corriger » (commentaires par section). Matrice **imposée en base** (trigger `dossiers_statut_garde`), miroir TS dans `src/lib/statuts.ts`.
- [x] Gel des valeurs (snapshot JSON) à la soumission ; brouillon/à-corriger recalculés en direct (`src/lib/rapport.ts`).
- [x] Approbation réservée à l'admin (`approuver_dossier`, `security definer`) ; self-approve tracé (`approuve_par/le` + journal). Confirme en même temps les valeurs par défaut non confirmées utilisées par le snapshot.
- [x] Modification après approbation → retour auto à « Soumis » + `snapshot_perime` (triggers `equipements`/`dossiers`) ; export bloqué hors « Approuvé » (403 + garde `app.export_ok`).
- [x] Chaque export conservé dans `rapport_versions` + bucket privé `rapports` (sha256) ; re-export idempotent, modification ultérieure = nouvelle version (`enregistrer_export`).

> **Report Phase 3 → 5 (résolus)** :
> - `vd_reset_confirme` étendu : `confirme=false` dès que `facteur_charge`/`poste` change, **même pour un admin**.
> - Confirmation des valeurs par défaut = **à l'approbation d'un rapport** (`approuver_dossier`) **et** via un bouton « Confirmer » admin dans `/valeurs-defaut`.

## Bloquée par

- Phase 4.

---

## Phase 6 : Factures *(conçue après 3-4 vraies factures)*

**User stories** : US-32

### Ce qu'on livre

L'ingénieur téléverse les factures d'énergie (Hydro-Québec, Énergir) sur plusieurs périodes ; Claude propose les chiffres, le code les vérifie (somme des périodes, dates qui se suivent) et signale les doutes, l'ingénieur confirme ; saisie manuelle si l'extraction échoue. Ces chiffres alimentent le contrôle de cohérence de la Phase 4.

### Critères d'acceptation

- [x] Upload de factures multi-périodes (bucket privé `factures`) ; le code vérifie (continuité : chevauchement/trou par énergie, période inversée, conso nulle — `src/lib/factures.ts`). Claude propose via `lireFactureAction` (JSON schema, PDF+image), **gâté `ALLOW_FACTURE_AI`** (Loi 25).
- [x] Doutes signalés (`verifierFactures`) ; confirmation par l'ingénieur (`confirmerFacture` + garde base `factures_confirme_complet`) ; saisie manuelle en repli (`updateFacture`).
- [x] Les factures **confirmées** alimentent le contrôle de cohérence (`totalFacturesKwh` → `controleCoherence`, en direct + gelé dans le snapshot à la soumission).
- [ ] *Design final arrêté une fois 3-4 vraies factures observées.* — **en attente** (aucune vraie facture encore).

## Bloquée par

- Phase 4.

> **Vérifié (2026-11-02)** : migration appliquée sur DEV (table `factures` RLS active, bucket privé, trigger journal → 4 INSERT au `audit_log`) ; garde CHECK bloque une confirmation incomplète ; `npm test` (44 ✓, dont `factures.test.ts`) ; chemin cohérence rejoué sur **vraies lignes DEV** → total 29 000 kWh (confirmées seules, non-confirmée + gaz m³ sans facteur exclus), écart 10,3 % dans le seuil, chevauchement détecté ; total gelé lu par `FrozenReport`.
> **Non exercé en direct** : le flux UI connecté (upload navigateur, boutons Confirmer/Lire IA) et l'extraction Claude réelle — voir « ce qui manque ».

---

## Phase 7 : Mesures/ROI + rédaction assistée + modèle éditable

**User stories** : US-33, US-40, US-41, US-42, US-43

### Ce qu'on livre

L'ingénieur remplit à la main le tableau des mesures (nom, économies, coût, subvention) et le code calcule le ROI — l'app n'invente jamais une mesure ni un chiffre. L'IA rédige un brouillon de la description des installations à partir des fiches validées, dans le style des anciens rapports, et met en forme les mesures/conclusions décidées par l'ingénieur ; les sections de jugement sont rédigées à la main. L'admin édite les textes fixes du modèle (méthodologie, ASHRAE, risques SSE génériques), chaque rapport portant le numéro de version du modèle utilisé.

### Critères d'acceptation

- [x] Tableau des mesures saisi à la main (`/dossiers/[id]/mesures`, table `mesures`) ; le code calcule le retour simple (`src/lib/mesures.ts`, `retourAnnees` = net ÷ économies ; `null` si économies ≤ 0 ou net ≤ 0) ; tests à assertions (`mesures.test.ts`) ; aucune mesure/économie inventée.
- [x] Brouillon IA de la description des installations à partir des **fiches validées uniquement** (`extraireFichesValidees` + `redigerDescriptionInstallations`, `src/lib/redaction.ts`), **gâté `ALLOW_REDACTION_AI`** (Loi 25) ; prompt générique (style affiné plus tard avec exemples anonymisés de Luis).
- [x] Mise en forme IA des mesures décidées par l'ingénieur (`mettreEnFormeMesures`, ne recalcule/invente rien) ; sections de jugement (problèmes, phasage, risques SSE, conclusions) saisies à la main ; brouillon IA = `source='ia'`, `valide=false` à relire et valider.
- [x] Textes fixes du modèle éditables par l'admin (`/admin/modele`, table `report_templates`, RLS `is_admin()`) ; version incrémentée à chaque édition ; texte + n° de version **gelés** dans le snapshot et portés sur `rapport_versions.modele_version` à l'export.

> Vérifié : `npm test` (49 ✓, dont `mesures.test.ts`) ; `npm run build` OK ; migration `20261101000004` appliquée sur DEV (`mesures`/`rapport_textes`/`report_templates` RLS active, `get_advisors` sans alerte RLS nouvelle). IA de rédaction **construite mais gâtée OFF** par défaut.

## Bloquée par

- Phase 2 (fiches validées), Phase 3 (mesures/calculs).

---

## Phase 8 : Permissions fines + verrou + notifications + liste enrichie

**User stories** : US-1, US-2, US-3, US-5, US-6, US-9, US-10, US-49

### Ce qu'on livre

L'admin active les droits personne par personne (voir [défaut on] / modifier / valider / exporter), le droit d'approuver lui restant réservé et distinct de « valider une étape ». Il peut désactiver un compte sans effacer l'historique. Un verrou d'édition affiche « X modifie cette fiche », expire sur inactivité et est forçable par Luis. La liste des dossiers montre statut + ingénieur responsable avec filtre et recherche ; l'admin peut supprimer un dossier avec ses photos et factures. Des courriels (Resend) partent à Luis à la soumission et à l'ingénieur à l'approbation/au renvoi.

### Critères d'acceptation

- [x] Droits activables par personne (voir/modifier/valider/exporter) ; approbation réservée admin et distincte de « valider ».
- [x] Désactivation d'un compte sans perte d'historique.
- [x] Verrou d'édition avec message, expiration sur inactivité, forçable par l'admin.
- [x] Liste des dossiers avec statut, ingénieur responsable, filtre et recherche.
- [x] Suppression d'un dossier (admin) avec ses photos et factures.
- [x] Courriels : à Luis à la soumission ; à l'ingénieur à l'approbation/au renvoi (Resend best-effort, `src/lib/courriel.ts`).

## Bloquée par

- Phase 1 (auth), Phase 5 (événements de statut pour les notifications).

---

> **Phases 9–15 — alignement sur le rapport réel (Andalos) et le flux Optima.** Ajouts **additifs** au découpage 1–8 (livré, intact). Toutes démarrables immédiatement sauf celles marquées « Bloquée par : réponse de Luis ». US-41/US-42 (rédaction IA) **reportées hors périmètre** : aucune nouvelle phase ; `src/lib/redaction.ts` reste construit mais **gâté OFF** (`ALLOW_REDACTION_AI`), remplacé par les emplacements de texte libre (Phase 13).

---

## Phase 9 : Tableau de zones du bâtiment

**User stories** : US-53

### Ce qu'on livre

L'ingénieur saisit un tableau de zones (nom de zone, superficie) en plus de la superficie totale déjà gérée en Phase 3. La superficie **totale** reste la seule source de l'intensité (kWh/pi² et, si des factures sont présentes, $/pi²) ; les zones sont purement **descriptives** et apparaissent dans le rapport. Rendu dans le `.docx`.

### Critères d'acceptation

- [x] Migration **additive** : table `zones` (dossier_id, nom, superficie, unité) avec RLS ; aucune colonne existante touchée.
- [x] CRUD des zones dans la description du bâtiment, ouvert aux ingénieurs et **journalisé**.
- [~] La superficie totale (Phase 3) **reste** la source de l'intensité ; les zones n'entrent dans aucun calcul (fait + testé). `$/pi²` **reporté Phase 15** (aucune source de coût en base aujourd'hui — pas de code mort).
- [x] Tableau de zones rendu dans le `.docx` (code = source unique).
- [x] Test à assertions : l'intensité ne change pas selon les zones ; somme/affichage des superficies de zones correct.

## Bloquée par

- Aucune — démarrable immédiatement (phases 1–8 livrées). S'appuie sur la description du bâtiment (Phase 3).

---

## Phase 10 : Distribution électrique

**User stories** : US-54

### Ce qu'on livre

L'ingénieur documente l'alimentation du bâtiment : nombre d'entrées électriques, et pour chacune ampères et tension. Donnée descriptive, rendue dans le rapport.

### Critères d'acceptation

- [x] Migration **additive** : table `distribution_electrique` (dossier_id, ampères, tension) + compteur d'entrées dérivé des lignes ; RLS.
- [x] CRUD (une ou plusieurs entrées) dans la description du bâtiment, **journalisé**.
- [x] Rendu dans le `.docx` (tableau distribution électrique).
- [x] Aucune valeur calculée ni devinée : saisie ingénieur pure.

> **Vérifié de bout en bout (2026-11-04)** : migration appliquée sur DEV (`distribution_electrique` RLS active, triggers journal), `get_advisors` sans nouvelle alerte RLS ; `npm test` (62 ✓, dont test passthrough `rapport.test.ts`) + `npm run build` OK. **CRUD + journal exercés sur le vrai DEV** sous rôle `authenticated` (JWT de l'ingénieur) : INSERT/UPDATE/DELETE passent la RLS, `audit_log` enregistre les 3 actions avec `actor` correct et old/new tension (347 → 600 → supprimé), le tout en transaction annulée (DEV propre). **Pipeline snapshot→docx exercé** : `construireSnapshot` fige `distribution` tel quel (hors calcul, intensité inchangée) et le render docxtemplater produit la boucle `{#distribution}` + « Nombre d'entrées : 2 » sans placeholder orphelin. *Non exercé en direct* : le rendu des champs de formulaire dans le navigateur (login requis) — clone ligne-à-ligne du formulaire zones livré en Phase 9.

## Bloquée par

- Aucune — démarrable immédiatement. S'appuie sur la description du bâtiment (Phase 3).

---

## Phase 11 : Registre des révisions + table des matières automatique

**User stories** : US-59, US-60

### Ce qu'on livre

Un registre des révisions (numéro, date, description) tracé par l'ingénieur, rendu sur sa page du rapport. Et une table des matières **automatique** dans le `.docx` : les titres de sections sont stylés pour que Word génère la TOC.

### Critères d'acceptation

- [x] Migration **additive** : table `revisions` (dossier_id, numero, date, description) avec RLS et **journal**.
- [x] CRUD du registre ; option de **pré-remplissage** depuis `rapport_versions` (chaque export = une ligne), description éditable à la main.
- [x] Page « registre des révisions » rendue dans le `.docx`, triée par numéro.
- [x] Table des matières **automatique** : champ TOC natif Word inséré + styles de titres appliqués ; se met à jour à l'ouverture (F9/au chargement). *ponytail : champ TOC natif, pas de TOC calculée à la main — ceiling : si Luis veut une TOC figée au rendu, la pré-générer deviendra nécessaire.*
- [x] Test à assertions : ordre des révisions ; présence des styles de titres sur les sections.

## Bloquée par

- Aucune — démarrable immédiatement. S'appuie sur l'export (Phase 1) et les versions (Phase 5).

---

## Phase 12 : Annexe Optima (upload PDF + insertion telle quelle)

**User stories** : US-50, US-51

### Ce qu'on livre

L'ingénieur téléverse le PDF d'Optima dans le dossier (bucket privé). **L'app ne le lit ni ne le calcule.** Comme les autres parties, il reste « en attente » jusqu'à ce que l'ingénieur le **confirme** ; l'assembleur (Phase 4) signale un Optima non confirmé comme donnée manquante. À l'export, le PDF est inséré **tel quel en annexe**, à la fin du rapport (ex. rapport Andalos : ~37 pages, p. 40–76).

### À trancher dans cette phase

Un `.docx` ne peut pas embarquer des pages PDF. Deux options, à trancher avec Luis **avant l'implémentation** :

- **Option A — pages PDF → images dans le .docx.** + Un seul fichier Word, signature/édition inchangées (US-39), flux docxtemplater conservé. − ~37 images plein format (fichier lourd), texte non sélectionnable, qualité selon la résolution, perte du vectoriel/liens d'Optima.
- **Option B — rapport exporté en PDF puis PDF Optima fusionné à la fin.** + Annexe à l'identique (qualité/texte/vectoriel préservés), léger, vraiment « tel quel » (US-51). − Livrable final = **PDF, non éditable dans Word** ; étape .docx→PDF + fusion PDF à ajouter ; clarifier si Luis signe le Word ou le PDF.

### Critères d'acceptation

- [x] Migration **additive** : bucket privé `optima` + colonnes sur `dossiers` (`optima_path`, `optima_confirme`, `optima_sha256`) ; RLS + **journal**. *(appliquée sur DEV ; colonnes + bucket privé + 4 policies vérifiés ; journal : un UPDATE `optima_confirme` écrit une ligne `audit_log` old=false/new=true.)*
- [x] Upload d'**un** PDF Optima ; **aucun appel IA**, aucune extraction, aucun recalcul. *(section `optima-section.tsx` : 1 seul `optima.pdf` en upsert ; `enregistrerOptima`/`confirmerOptima` ne font aucun appel Anthropic/extraction.)*
- [x] Statut « en attente » → bouton **Confirmer** (même patron que factures/équipements) ; confirmation tracée. *(StatusChip valide/non_valide + Confirmer, miroir `FactureCard` ; trace `audit_log` démontrée.)*
- [x] L'assembleur (Phase 4) signale un PDF Optima **non confirmé** comme donnée manquante bloquant la soumission. *(flag `optimaNonConfirme` dans `bloquant` ; test `assembleur.test.ts` règle 4 ; ligne « Rapport Optima non confirmé » sur la page rapport.)*
- [x] Option A ou B **tranchée et documentée** ; le PDF est inséré en annexe à la fin du rapport selon l'option retenue. *(**Option B** retenue ; E2E contre un vrai Gotenberg 8 : template réel docx→PDF puis fusion `01_rapport`/`02_optima` → PDF final = rapport + annexe en fin, pages préservées.)*

## Bloquée par

- Aucune pour l'upload/la confirmation (s'appuie sur Storage + le patron de confirmation des phases 2/6 et sur la complétude de la Phase 4). **L'insertion en annexe est bloquée par la décision Option A/B** (interne à la phase, pas une réponse de Luis sur un champ).

---

## Phase 13 : Emplacements de texte libre — sommaire, mesures, sections (retrait du sommaire généré et du ROI)

**User stories** : US-57, US-58, US-52 *(US-58 remplace US-38 ; US-52 remplace US-33)*

### Ce qu'on livre

Des emplacements de **texte libre** à des endroits fixes du modèle (sommaire exécutif, humidification et contrôles, électricité, mesures étudiées, conclusion) où l'ingénieur écrit et **colle ses tableaux d'Optima**. Deux conséquences sur du code déjà livré :

- **L'assembleur ne génère plus le sommaire exécutif** (US-58) : `sommaireExecutif` retiré de `assembleur.ts`, et son appel/champ retirés de `rapport.ts` et de l'export. Le sommaire devient un emplacement de texte libre.
- **L'app ne calcule plus le ROI/PRI** (US-52) : `retourAnnees`/`investissementNet`/type `Mesure` structuré retirés de `mesures.ts`, `rapport.ts` et l'export. Le tableau des mesures devient un emplacement de texte libre collé d'Optima.

Les emplacements s'appuient sur la table `rapport_textes` (Phase 7). **Gel** inchangé : à la soumission, les textes libres sont figés dans le snapshot comme le reste.

### Critères d'acceptation

- [x] 5 emplacements de texte libre à positions fixes (sommaire, humidification/contrôles, électricité, mesures étudiées, conclusion), rendus à leur place dans le `.docx` ; vides par défaut.
- [x] `sommaireExecutif` (assembleur) **retiré** ; l'assembleur ne produit plus de sommaire ; conséquences propagées à `rapport.ts` et à l'export.
- [x] Calcul ROI/PRI **retiré** (`mesures.ts`/`rapport.ts`/export) ; aucun chiffre de mesure calculé ni inventé ; `mesures.test.ts` retiré ou réécrit.
- [x] **Rétrocompatibilité des snapshots** : un rapport **soumis avant la Phase 13** (snapshot JSON contenant `sommaire`, `mesures[]`, `retour_annees`) **s'exporte toujours à l'identique de ce qui avait été envoyé** — le rendu lit les anciens champs du snapshot s'ils sont présents, les nouveaux emplacements sinon. Test à assertions sur un ancien snapshot figé.
- [x] **Mesures déjà saisies** dans l'ancien formulaire structuré : **option par défaut retenue = copie one-shot** du tableau structuré vers le texte libre pré-rempli (migration de données additive ; l'ingénieur ajuste ensuite). *Alternative écartée : laisser l'ancien tableau en lecture seule à côté — rejetée pour ne pas garder deux sources.*
- [x] `src/lib/redaction.ts` laissé **gâté OFF** (US-41/42 reportées) — aucun code neuf dessus.

> **Vérifié de bout en bout (2026-11-04)** : migration `phase13_textes_libres` appliquée sur DEV ; CHECK `rapport_textes_section_check` ré-énumère les 10 clés (4 nouvelles + `mesures_mise_en_forme` conservée) ; copie one-shot idempotente des mesures → `mesures_etudiees` (1 ligne copiée sur DEV, `on conflict do nothing`). `get_advisors` : aucune **nouvelle** alerte RLS. `donneesRender` extrait en lib pure (`src/lib/rapport-render.ts`, testable hors route server-only). **Pipeline snapshot→docx exercé** (14 assertions sur le `document.xml` rendu) : nouveau snapshot → les 5 emplacements libres rendus à leur place, boucle `{#mesures}` vide, aucun placeholder orphelin ; snapshot vide → sections présentes mais vides ; **ancien snapshot pré-Phase 13** → sommaire calculé + ligne mesure/ROI « 3,25 ans » rendus à l'identique. `npm test` (62 ✓, dont le test rétrocompat `rapport-render.test.ts`) + `npm run build` OK. *Non exercé en direct* : le rendu des formulaires dans le navigateur (login requis) — la saisie réutilise `SectionNarrative` (Phase 7, livré).

## Bloquée par

- Aucune réponse de Luis requise. S'appuie sur `rapport_textes` (Phase 7), le gel/snapshot (Phase 5) et l'export (Phase 1) ; retire du code des Phases 4 et 7.

---

## Phase 14 : Fiche d'équipement alignée sur le rapport

**User stories** : US-56

### Ce qu'on livre

La fiche d'équipement reçoit les champs exacts du rapport : ID, description, marque/modèle, débit (PCM) et % d'air frais, ventilateur, refroidissement, chauffage, humidificateur, capacité de refroidissement (kW), capacité de chauffage (kW), efficacité (%), constat/remarques (puces libres), photo de l'unité, photo de la fiche signalétique. Chaque champ peut rester **N/D**. Rendu conforme au rapport.

### Critères d'acceptation

- [ ] Migration **additive** : nouvelles colonnes sur `equipements` ; **jamais** de renommage/suppression des colonnes existantes (`puissance_*`, `heures`, `facteur`…).
- [ ] Chaque nouveau champ peut rester **N/D** ; validation champ par champ conservée (Phase 2).
- [ ] Fiche rendue dans le `.docx` exactement comme dans le rapport.
- [ ] **Décision Luis** appliquée : les champs **heures de fonctionnement** et **facteur de charge** restent-ils sur la fiche (contrôle interne) ou disparaissent ? Le calcul de consommation (US-26, puissance × heures × facteur) en **dépend** — rien n'est retiré avant la réponse.

## Bloquée par

- **Réponse de Luis** (heures de fonctionnement + facteur de charge sur la fiche : conservés pour contrôle interne, ou retirés ?). Puis Phase 2 (équipements), Phase 3 (calcul).

---

## Phase 15 : Factures — tableaux mensuels, GES, degrés-jours, graphiques

**User stories** : US-55

### Ce qu'on livre

À partir des factures (Phase 6), le rapport présente des tableaux **mensuels** de gaz et d'électricité, les tarifs moyens, les GES, l'intensité par pi², et des **graphiques** avec degrés-jours.

### Critères d'acceptation

- [ ] Migration **additive** pour les données mensuelles et les degrés-jours.
- [ ] Tableaux mensuels gaz + électricité, tarifs moyens ($/kWh, $/m³), GES, intensité par pi² — **calculés par le code** (source unique), rendus dans le `.docx`.
- [ ] Graphiques avec degrés-jours produits **selon la décision de Luis** (voir ci-dessous).
- [ ] **Décisions Luis** appliquées : (a) **d'où viennent les degrés-jours** (saisie manuelle ? source externe ?) ; (b) **l'app génère-t-elle les graphiques** (images rendues côté serveur et insérées dans le `.docx`) ou non.

## Bloquée par

- **Réponse de Luis** (source des degrés-jours + génération des graphiques). Puis Phase 6 (factures).
