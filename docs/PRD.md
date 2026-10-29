# PRD — Application d'audit énergétique MT Conseil

## Problème

L'audit énergétique de MT Conseil prend de 20 à 25 jours ouvrables. L'ingénieur senior et associé principal, Luis de la Cruz, en signe chaque rapport et porte la responsabilité professionnelle de chaque chiffre. Trois tâches lui coûtent le plus de temps : les fiches techniques des équipements, l'analyse des factures d'énergie et la mise en page du rapport — qu'il refait de zéro à chaque audit (logo, sections, marges). Il y a peu d'audits actuellement, et la firme suppose — sans l'avoir validé — qu'avec un outil elle pourrait en livrer et en prospecter davantage à équipe constante. Le reste du travail (visite, simulation énergétique, analyse des mesures d'efficacité) reste du jugement d'ingénieur ou dépend d'une autre application.

## Solution

Une seule application web avec un dossier par bâtiment, qui agit comme un adjoint préparant des brouillons sous la supervision de l'ingénieur, qui reste le patron qui signe. Quatre « acteurs » se partagent le travail : trois préparent chacun leur résultat (les fiches d'équipement à partir des photos, la description du bâtiment, l'analyse des factures) et le quatrième — l'assembleur — rassemble, vérifie, calcule et produit le rapport Word final. Chaque acteur écrit son résultat validé dans le dossier du bâtiment ; l'assembleur ne lit que ce qui a été validé. Un humain valide chaque étape de bout en bout. Règle fondatrice : l'IA ne calcule rien et ne devine rien — le code calcule, l'IA lit et propose sous validation, l'ingénieur confirme. Un champ incertain reste vide et est rempli à la main.

## Utilisateur cible

Les ingénieurs de MT Conseil, chacun avec son compte. Luis de la Cruz est administrateur : lui seul crée les comptes, règle les droits, gère la table des valeurs par défaut et approuve les rapports. Tous les ingénieurs voient tous les dossiers et peuvent, si le droit est activé, modifier le travail d'un collègue. Le client final (p. ex. Produits Andalos, offre de service ODS25001) ne se connecte jamais : il reçoit uniquement le rapport Word final, après approbation de Luis.

## User Stories

### Comptes, permissions, sécurité
- **US-1** — En tant qu'admin (Luis), je veux créer les comptes des ingénieurs et activer leurs droits personne par personne — voir un dossier (activé par défaut pour tous), modifier les fiches, valider une étape, exporter le rapport — afin de contrôler qui fait quoi.
- **US-2** — En tant qu'admin (Luis), je veux que le droit d'approuver un rapport me soit réservé et reste distinct de « valider une étape », afin de rester seul responsable de ce qui est signé.
- **US-3** — En tant qu'admin (Luis), je veux désactiver un compte sans effacer son historique, afin de retirer un accès tout en gardant la traçabilité.
- **US-4** — En tant qu'ingénieur, je veux me connecter par courriel et mot de passe avec récupération de mot de passe, afin d'accéder à l'app en toute autonomie.
- **US-5** — En tant qu'ingénieur, je veux voir tous les dossiers de la firme, afin de reprendre ou consulter le travail de n'importe quel collègue.
- **US-6** — En tant qu'ingénieur, je veux qu'un message « Marc modifie cette fiche » s'affiche quand quelqu'un d'autre a déjà la fiche ouverte, afin d'éviter d'écraser son travail ; le verrou expire après un délai d'inactivité et Luis peut le forcer.
- **US-7** — En tant qu'ingénieur, je veux un journal des changements immuable (qui, quand, ancienne valeur, nouvelle valeur) couvrant aussi approbations, changements de statut et exports, afin de retracer toute action sans que personne puisse l'altérer.

### Dossier par bâtiment
- **US-8** — En tant qu'ingénieur, je veux créer un dossier par bâtiment (nom du client, adresse, statut du rapport), afin de regrouper toutes les données d'un audit au même endroit.
- **US-9** — En tant qu'ingénieur, je veux une liste des dossiers affichant le statut et l'ingénieur responsable, avec filtre et recherche, afin de retrouver rapidement un dossier.
- **US-10** — En tant qu'admin (Luis), je veux supprimer un dossier, y compris ses photos et ses factures, afin de respecter la conservation des données.

### Tri des photos et lecture des plaques
- **US-11** — En tant qu'ingénieur, je veux téléverser d'un coup toutes mes photos de chantier (30 à 60 photos, depuis le téléphone ou l'ordi), avec conversion automatique des photos HEIC et reprise d'un téléversement interrompu, afin de ne pas les importer une à une.
- **US-12** — En tant qu'ingénieur, je veux que le code propose des groupes de photos (plaque, équipement, emplacement) à partir de l'heure de prise de vue — avec un ordre de secours par nom de fichier si la date de prise de vue est absente — afin de les organiser sans travail manuel.
- **US-13** — En tant qu'ingénieur, je veux confirmer chaque groupe de photos et l'assigner à un équipement en remplissant la fiche à côté, le renommage se faisant dans l'app (pas dans les fichiers du téléphone), afin de garder mes fichiers d'origine intacts.
- **US-14** — En tant qu'ingénieur, je veux créer un équipement même sans photo, afin de documenter un équipement non photographié.
- **US-15** — En tant qu'ingénieur, je veux que l'IA lise la plaque (marque, modèle, puissance, année de fabrication) et propose ces valeurs, chacune restant « non validée » tant que je ne l'ai pas regardée, afin de gagner du temps sans jamais accepter un chiffre à l'aveugle.
- **US-16** — En tant qu'ingénieur, je veux voir le niveau de confiance de chaque champ lu en trois états (lisible, partiel, illisible), complété par les vérifications du code (valeur plausible pour le type d'équipement), afin de savoir où porter mon attention.
- **US-17** — En tant qu'ingénieur, je veux que l'IA laisse vide tout champ incertain, afin de le remplir moi-même plutôt que d'accepter une valeur douteuse.
- **US-18** — En tant qu'ingénieur, je veux que chaque valeur lue garde son unité (kW, HP, BTU/h) et que le code la convertisse avant de calculer, afin d'éviter toute erreur d'unité.
- **US-19** — En tant qu'ingénieur, je veux saisir les champs que l'IA ne peut pas connaître (état de l'équipement, emplacement et ce qu'il dessert, heures de fonctionnement), afin de compléter la fiche.
- **US-20** — En tant qu'ingénieur, je veux que le rendement soit accompagné de sa source citée (lien cliquable vers la fiche du fabricant), afin de le vérifier en un clic — jamais un chiffre inventé.
- **US-21** — En tant qu'ingénieur, je veux devoir regarder chaque champ avant de le valider (pas de validation en bloc), afin de ne pas valider trop vite des chiffres qui engagent ma responsabilité.

### Table des valeurs par défaut et calcul de consommation
- **US-22** — En tant qu'ingénieur, je veux gérer (créer/éditer) la table des valeurs par défaut (facteur de charge par type d'équipement), afin que les calculs s'appuient sur des valeurs standard. *Cadrage : table éditable par tous les ingénieurs et journalisée ; toute modification repasse la ligne à « à confirmer ».*
- **US-23** — En tant qu'ingénieur, je veux voir chaque valeur par défaut marquée « à confirmer » tant qu'elle n'a pas été confirmée avec Luis, afin de savoir ce qui n'est pas encore fiable.
- **US-24** — En tant qu'admin (Luis), je veux confirmer les valeurs par défaut, afin de lever la mention « à confirmer ». *Cadrage : la confirmation est reportée à l'approbation du rapport (Phase 5) — pas de bouton « confirmer » en Phase 3.*
- **US-25** — En tant qu'ingénieur, je veux pouvoir modifier une valeur par défaut pour un cas précis en indiquant une raison écrite, afin que tout ajustement reste justifié et traçable.
- **US-26** — En tant qu'ingénieur, je veux que le code calcule la consommation annuelle (puissance × heures × facteur de charge), afin d'obtenir les kWh/an sans calcul manuel.
- **US-27** — En tant qu'ingénieur, je veux qu'un équipement n'entrant dans aucune catégorie soit signalé (pas deviné), afin de le traiter à la main.
- **US-28** — En tant qu'ingénieur, je veux que chaque type d'équipement appartienne à un poste de consommation (chauffage, ventilation, éclairage, etc.) et que le code calcule le bilan par poste et l'intensité énergétique (kWh/m²), afin de produire le bilan exigé par l'offre de service.
- **US-29** — En tant qu'ingénieur, je veux que le gaz naturel (facturé par Énergir) soit converti en équivalent énergétique, afin de le comparer à l'électricité dans le bilan.
- **US-30** — En tant qu'ingénieur, je veux que les valeurs utilisées soient figées à la soumission du rapport — un brouillon se recalcule — afin qu'un changement futur de la table ne modifie jamais un rapport soumis.

### Description du bâtiment
- **US-31** — En tant qu'ingénieur, je veux remplir un formulaire de description du bâtiment (superficie **brute de plancher — à confirmer** + unité m²/pi², année de construction, usage, etc.), afin d'alimenter l'intensité énergétique (kWh/m²) et la description générale du rapport. *Le facteur de conversion du gaz est un paramètre admin « à confirmer » ; le gaz saisi est affiché à part, jamais additionné au total équipements.*

### Analyse des factures *(à préciser après 3-4 vraies factures)*
- **US-32** — En tant qu'ingénieur, je veux téléverser les factures d'énergie (Hydro-Québec, Énergir, etc.) sur plusieurs périodes, l'IA proposant les chiffres, le code les vérifiant (somme des périodes, dates qui se suivent) et moi les confirmant, avec saisie manuelle si l'extraction échoue, afin d'obtenir des chiffres fiables. *(Histoire à préciser une fois de vraies factures observées.)*

### Mesures d'efficacité énergétique
- **US-33** — En tant qu'ingénieur, je veux remplir à la main le tableau des mesures (nom de la mesure, économies, coût d'investissement, subvention), le code calculant le retour sur investissement à partir des coûts, des économies et de la subvention, afin de documenter les mesures sans que l'app n'invente de résultat.

### Assembleur et rapport
- **US-34** — En tant qu'ingénieur, je veux que l'assembleur signale toute fiche non validée ou donnée manquante et bloque la soumission (contrôle de complétude), afin de ne rien oublier.
- **US-35** — En tant qu'admin (Luis), je veux pouvoir autoriser une soumission incomplète avec une raison écrite, afin de débloquer un cas exceptionnel sous ma responsabilité.
- **US-36** — En tant qu'ingénieur, je veux que l'assembleur compare la consommation estimée des équipements à celle des factures et m'alerte si l'écart dépasse le seuil (contrôle de cohérence) ; sans factures, il affiche « non disponible » plutôt que d'échouer silencieusement, afin de diriger mon attention sur ce qui est douteux.
- **US-37** — En tant qu'admin (Luis), je veux régler le seuil de cohérence (par défaut 20 %), afin de l'adapter au contexte.
- **US-38** — En tant qu'ingénieur, je veux que l'assembleur génère le sommaire exécutif avec son tableau résumé, afin de ne pas le composer à la main.
- **US-39** — En tant qu'ingénieur, je veux produire le rapport dans le modèle Word de MT Conseil (logo, marges, titres, sections), afin de ne plus refaire la mise en page à chaque audit.
- **US-40** — En tant qu'admin (Luis), je veux modifier les textes fixes du modèle (méthodologie, norme ASHRAE, risques SSE génériques), chaque rapport portant le numéro de version du modèle utilisé, afin de faire évoluer le modèle sans altérer les rapports passés.

### Rédaction assistée
- **US-41** — En tant qu'ingénieur, je veux que l'IA rédige la description des installations à partir des fiches validées, dans le style des anciens rapports de Luis, afin d'obtenir un brouillon propre à réviser.
- **US-42** — En tant qu'ingénieur, je veux que l'IA mette en forme les mesures d'amélioration et conclusions que je décide (sans jamais en inventer), afin que le jugement d'ingénieur reste le mien.
- **US-43** — En tant qu'ingénieur, je veux rédiger moi-même les sections de jugement (problèmes techniques et de confort, phasage des travaux, risques SSE propres au bâtiment, conclusions), afin de garder la main sur ce qui engage ma responsabilité.

### Statuts, approbation, commentaires
- **US-44** — En tant qu'ingénieur, je veux faire avancer le rapport dans les statuts Brouillon → Soumis → Approuvé → Exporté, afin d'avoir un parcours de validation clair.
- **US-45** — En tant qu'admin (Luis), je veux renvoyer un rapport au statut « À corriger » avec des commentaires (un champ de texte par section), ou le corriger moi-même et l'approuver, afin de signaler précisément ce qui doit changer.
- **US-46** — En tant qu'admin (Luis), je veux pouvoir approuver mes propres rapports, le journal l'indiquant clairement, afin de ne pas me bloquer moi-même tout en gardant la traçabilité.
- **US-47** — En tant qu'ingénieur, je veux que toute modification après approbation remette le statut à « Soumis » et que l'export final reste bloqué hors statut « Approuvé », afin qu'une approbation ne vaille jamais pour une version modifiée.
- **US-48** — En tant qu'ingénieur, je veux que chaque export soit conservé tel qu'envoyé et qu'une modification ultérieure crée une nouvelle version, afin de garder une trace de ce qui a réellement été remis.
- **US-49** — En tant qu'admin (Luis), je veux recevoir un courriel quand un rapport est soumis, et l'ingénieur veut en recevoir un quand son rapport est approuvé ou renvoyé, afin que personne n'ait à surveiller l'app.

## Critères de succès

1. **Lecture des plaques** : sur d'anciens dossiers anonymisés, chaque champ lu par l'IA (marque, modèle, puissance, année) est comparé à la fiche déjà validée par Luis ; seuil de départ **≥ 80 % de champs corrects** (à ajuster après un premier test).
2. **Mise en page** : Luis place un rapport produit par l'app à côté d'un ancien rapport et déclare s'il l'enverrait tel quel ; sinon, il liste les changements à faire.
3. **Mesures facultatives pour l'étude de cas** (observables) : le temps réel chronométré par Luis (même ancien dossier fait à la main puis avec l'app, en heures réelles, pas en jours écoulés) et le nombre de corrections avant approbation.

## Hors périmètre

- La simulation énergétique (faite par une autre application ; l'app importe seulement ses fichiers de résultats, manuellement pour l'instant).
- Décider à la place de l'ingénieur (mesures d'amélioration et conclusions restent son jugement).
- Produire des plans et devis.
- Gérer les demandes de subvention (incluses dans l'offre de service, mais hors de ce projet ; seul le montant de subvention est saisi pour le calcul du ROI).
- Envoyer quoi que ce soit au client sans l'approbation de Luis ; le client ne se connecte jamais.
- L'import automatique des factures : différé jusqu'à disposer de 3-4 vraies factures (saisie assistée d'ici là).
- **L'import automatique d'un fichier de résultats de l'autre app : reporté (idée, pas une fonction du MVP).** Le tableau des mesures est rempli à la main.
- La comparaison avec des bâtiments semblables : reportée (idée).
- Deux idées notées mais **non construites** dans le MVP : un agent de recherche en lecture seule sur les projets/clients ; un modèle d'IA local pour éviter le transfert de données.

## Décisions d'implémentation

- **Confiance et validation** : chaque champ lu par l'IA est « non validé » tant que l'ingénieur ne l'a pas regardé ; confiance affichée en trois états (lisible, partiel, illisible) plus les vérifications de plausibilité du code ; les doutes sont mis en évidence. Pas de validation en bloc. Un champ incertain reste vide.
- **Unités** : chaque valeur lue garde son unité (kW, HP, BTU/h) ; le code convertit avant tout calcul.
- **Source du rendement** : lien cliquable vers la fiche du fabricant, vérifiable en un clic.
- **Photos** : groupes (plaque, équipement, emplacement) proposés par le code à partir de l'heure de prise de vue, ordre de secours par nom de fichier si la date manque ; l'ingénieur confirme chaque groupe ; conversion automatique du HEIC ; reprise d'un téléversement interrompu ; renommage dans l'app ; création d'un équipement sans photo possible. Volume typique : 10 à 20 équipements, 2 à 3 photos chacun (30 à 60 photos).
- **Table des valeurs par défaut** : 10 à 15 types au départ ; chaque valeur « à confirmer » tant que Luis ne l'a pas confirmée ; équipement hors catégorie signalé (jamais deviné) ; modification au cas par cas avec raison écrite. Chaque type rattaché à un poste de consommation ; bilan par poste et intensité énergétique (kWh/m²) calculés par le code.
- **Gel des valeurs** : figées à la **soumission** du rapport ; un brouillon se recalcule.
- **Factures** : l'IA propose, le code vérifie (somme des périodes, dates qui se suivent) et signale les doutes, l'ingénieur confirme ; saisie manuelle si l'extraction échoue. Conception finale après 3-4 vraies factures.
- **Mesures d'efficacité** : tableau rempli à la main (nom, économies, coût, subvention) ; le code calcule le ROI à partir des coûts, économies et subvention ; l'app n'invente jamais une mesure ni un chiffre d'économie.
- **Assembleur** : complétude (bloque la soumission ; seul Luis peut autoriser malgré tout, avec raison écrite) ; cohérence (écart > seuil réglable, 20 % par défaut ; « non disponible » sans factures) ; sommaire exécutif + tableau résumé générés. La comparaison avec bâtiments semblables est reportée.
- **Modèle Word** : textes fixes (méthodologie, ASHRAE, risques SSE génériques) éditables par Luis ; numéro de version du modèle inscrit sur chaque rapport.
- **Statuts** : Brouillon → Soumis → Approuvé → Exporté, plus un statut distinct « À corriger » quand Luis renvoie avec commentaires (un champ de texte par section, sans fil de discussion). Luis peut corriger lui-même et approuver, et approuver ses propres rapports (tracé au journal). Toute modification après approbation repasse à « Soumis ». Export bloqué hors « Approuvé ». Chaque export conservé tel qu'envoyé ; une modification ultérieure crée une nouvelle version.
- **Notifications courriel** : à Luis quand un rapport est soumis ; à l'ingénieur quand son rapport est approuvé ou renvoyé.
- **Connexion** : courriel + mot de passe, avec récupération.
- **Permissions** : droits activables par personne (voir un dossier — activé par défaut ; modifier les fiches ; valider une étape ; exporter le rapport). Réservés à Luis : créer/gérer les comptes, gérer et confirmer la table des valeurs par défaut, approuver un rapport, autoriser une soumission incomplète, régler le seuil de cohérence, éditer les textes fixes du modèle, supprimer un dossier, forcer un verrou. Luis peut désactiver un compte sans effacer l'historique.
- **Partage et verrou** : toute la firme voit tous les dossiers ; message « Marc modifie cette fiche » ; verrou expirant après inactivité, forçable par Luis.
- **Dossiers** : liste avec statut, ingénieur responsable, filtre et recherche ; Luis peut supprimer un dossier avec ses photos et factures. Conservation par défaut proposée : 24 mois après l'export (à confirmer avec Luis).
- **Journal** : immuable ; enregistre modifications de données, approbations, changements de statut et exports.
- **Structure du rapport** (issue de l'offre de service) répartie en trois origines : rempli par le code (tableaux de consommation, liste des équipements, bilan par poste, intensité énergétique, sommaire exécutif) ; identique d'un client à l'autre, dans le modèle une fois (risques SSE génériques, méthodologie, norme ASHRAE) ; propre à chaque bâtiment (description des installations et mise en forme des mesures/conclusions en brouillon IA révisé par Luis ; problèmes techniques et de confort, phasage, risques SSE propres au bâtiment, conclusions rédigés à la main par l'ingénieur).

## Notes complémentaires

- **Ordre de construction** : défini séparément dans `docs/PLAN.md` (via `/planifie`), en balles traçantes testées une à une. Priorité au modèle Word + export, validé en premier par Luis.
- **Conservation des données** : valeur proposée **24 mois après l'export**, suppression manuelle par Luis possible à tout moment. Réserve : les obligations de tenue de dossiers de l'OIQ (souvent ~10 ans) incombent aux dossiers officiels de MT Conseil, pas à cet outil de brouillon ; à trancher avec Luis.
- **Hypothèses non validées** : « livrer plus d'audits à équipe constante » ; nature des « jours » de Luis (travail réel ou temps écoulé) ; étape(s) où s'applique le +0,5 jour par équipement. Objectif de 2 jours irréaliste (10 des 22 jours viennent de la simulation externe) ; cible réaliste ~15 jours, traitée comme mesure d'étude de cas.
- **Matériel manquant (bloquant pour certaines fonctions)** : 3 à 5 anciens rapports anonymisés (modèle Word + style) ; 5 à 10 anciens dossiers avec photos et fiches validées (jeu de test) ; la table de valeurs par défaut de Luis + une séance pour mettre ses règles par écrit ; un exemple de fiche d'équipement complétée (champs exacts) ; 3 ou 4 vraies factures (Hydro-Québec, Énergir) — la fonction factures (US-32) est conçue à partir d'elles ; un exemple de fichier de résultats de l'autre app.
- **Loi 25 et confidentialité** : photos et factures transitent vers l'API d'Anthropic, probablement hors Québec. Tester uniquement avec d'anciens dossiers dont noms et adresses sont cachés. Aucune donnée réelle d'un client en cours avant que Luis confirme l'absence de NDA et son accord explicite pour l'usage d'une API d'IA externe. Confirmer dans les conditions d'Anthropic que les données de l'API ne servent pas à l'entraînement avant de le promettre à Luis.
- **Ententes à confirmer par écrit avec Luis** : le code reste au développeur, MT Conseil l'utilise sans frais ; droit de nommer MT Conseil et de montrer des chiffres dans l'étude de cas (sinon anonyme) ; support gratuit limité (~3 mois) ; transfert des frais (hébergement, API) à MT Conseil à une date précise ; aucune donnée réelle sans accord.
- **Idées futures** (hors MVP) : import automatique du fichier de résultats de l'autre app ; comparaison avec des bâtiments semblables ; agent de recherche en lecture seule sur projets/clients ; modèle d'IA local pour limiter le transfert de données.
- **Risque accepté** : Luis devient un goulot d'étranglement s'il est absent (seul à approuver) ; il doit le savoir.
