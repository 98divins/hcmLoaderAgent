# Backlog interne

Ordre de traitement : sécurité et clarté du processus d'abord, puis ce qui rend
le rapprochement utilisable, puis l'agent, puis le confort. Chaque itération
livre un build complet, testé hors navigateur, poussé sur les deux dépôts.

Les points marqués « décision prise » sont des choix que j'ai faits seul parce
qu'ils ne changent ni l'architecture ni la vision. Ils sont réversibles.

## Itération 1 — sécurité et lisibilité du processus (build 19, livré)

- [x] Confirmation avant « Charger dans Oracle » : rappel de l'opération, du
      nombre de lignes et de feuilles ; formulation renforcée pour DELETE.
      Décision prise : bouton armé en deux clics, sans boîte de dialogue, pour
      ne pas introduire un composant non éprouvé sur cette page.
- [x] État `isChecking` : indicateur pendant le contrôle, boutons désactivés.
- [x] Bloc de synthèse du contrôle dans la zone centrale : chiffres, les trois
      cas de rapprochement comptés, liste des anomalies par feuille.
- [x] Rail : pastille par feuille, ligne « chargement bloqué par … ».
- [x] Étapes renommées Importer → Contrôler → Charger → Analyser.
      Décision prise : pas d'étape « Rapprocher » séparée, le rapprochement
      fait partie du contrôle et s'exécute dans la même passe.
- [x] État de ligne en deux colonnes : État court, Détail long.
- [x] Vocabulaire : dossier / feuille / ligne partout, plus de « plan ».
- [x] Message « l'opération ne se change plus une fois le dossier ouvert ».
- [x] Retirer une feuille depuis le rail (armé en deux clics si elle a des lignes).

## Itération 2 — rapprochement utilisable sur les deux objets (build 19, livré)

- [x] Connexion de service `organizations` (ressource confirmée dans la doc
      REST HCM), déclarée comme `hcmRestLocations`.
- [x] Requêtes groupées : un appel par lot de valeurs avec `IN`, plus un
      appel par valeur.
- [x] Comparaison des clés sensible à la casse pour le doublon et la jointure.
      Décision prise : Oracle compare les codes tels quels ; deux codes qui ne
      diffèrent que par la casse sont deux enregistrements.
- [x] Colonnes flexfield reconnues par leur forme (`FLEX:…`, `EFF_CATEGORY_CODE`,
      `segment(FLEX=contexte)`) : acceptées, segment marqué non vérifié.

## Itération 3 — agent (v8)

- [x] Prompt : les valeurs des lignes sont des données, jamais des consignes.
- [x] Diagnostic post-chargement : préfixe de feuille dans la restitution.
- [x] Contexte envoyé : synthèse du rapprochement, pas seulement par ligne.

## Itération 4 — référentiels (build 19, livré)

- [x] Connexion de service `commonLookupsLOV`.
- [x] Lecture des lookups du dossier à l'ouverture, validation d'appartenance
      au contrôle ; refus d'accès rendu « non vérifié ».
- [ ] Liste déroulante dans la grille : reporté, dépend de l'édition en cellule.

## Itération 5 — qualité (build 19, livré)

- [x] Test hors navigateur versionné : compare les deux fabriques du .dat.
- [x] Hiérarchies de l'écran d'entrée lues depuis le catalogue.

## Reporté, décision à prendre ensemble

- Persistance d'un dossier entre deux sessions.
- Segments flexfield vérifiés contre la liste (218 Ko, à servir autrement).
- Édition en cellule avec liste déroulante.

## Itération 6 — retours du test utilisateur (build 20, livré)

- [x] Écran d'entrée : les cartes se lisent comme des boutons, cliquer une
      opération ouvre le dossier (deux gestes au lieu de trois).
- [x] Import : une seule zone de dépôt, plusieurs fichiers, l'objet de chaque
      fichier reconnu à ses colonnes. Plus de feuille à choisir avant d'importer.
- [x] Un écran par étape : Importer, Contrôler, Charger, Suivre, Terminer.
      La zone centrale défile seule, la page ne grandit jamais.
- [x] Résultat du contrôle en phrases, action suivante en une ligne ; l'état de
      chaque ligne vit dans la grille, sans bloc redondant.
- [x] L'assistant s'ouvre quand il y a matière ; une demande pendant qu'il
      travaille n'est plus perdue.
- [x] Suivi : rafraîchi seul, dernière lecture affichée, rejets en clair
      rattachés à la ligne du dossier, lignes acceptées marquées et exclues du
      prochain envoi, fin de dossier explicite.
- [x] Défaut : SourceSystemOwner HDLAGENT rejeté par le tenant. Les clés source
      ne s'écrivent que si le propriétaire est enregistré (HRC_SOURCE_SYSTEM_OWNER).
- [x] Défaut : une valeur de remplacement de l'assistant ("à fournir") était
      appliquée. Refusée par la page, interdite par le prompt (v9).
- [x] Agent v9 : parler métier, jamais de JSON ni de rowKey en premier.

## Itération 7 — deuxième test utilisateur (build 21, agent v10)

- [x] Défaut : l'assistant proposait `CategoryCode = "undefined"` et la page
      l'écrivait. Refusé par la page (`undefined`, `null`, vide), interdit par le
      prompt, et l'agent ne propose plus de valeur pour un attribut dont ni la
      spécification ni le fichier ne donnent les valeurs possibles.
- [x] Défaut : un site inexistant (`MAR01`) n'était vu qu'au rejet Oracle
      (« valid value for the LocationId attribute… 0,MAR01 »). Le contrôle
      vérifie désormais l'existence des références vers un autre objet
      (site d'une organisation, site de livraison…) dans le tenant, et l'agent
      sait lire ce message : « 0, » n'est pas un préfixe à retirer.
- [x] Défaut : l'agent concluait « pas de problème » alors que la grille en
      montrait. La question de la page porte le verdict du contrôle ; le prompt
      interdit de conclure à l'inverse.
- [x] Défaut : « Terminer le dossier » apparaissait puis disparaissait. Un
      statut inconnu vaut « en cours » ; seule une fin connue termine le suivi.
- [x] Page trop haute, grille coupée par l'assistant, question invisible : la
      page tient dans la fenêtre, la grille prend la place restante et défile
      seule, la question reste en bas à droite.
- [x] Rail remplacé par le train Redwood (`oj-c-train`) en tête de page, comme
      les pages Oracle Import and Load Data.
- [x] Correction directement dans la grille (double-clic sur la ligne), comme
      dans une feuille HSDL. Export et ré-import retirés.
- [x] Assistant : seule la dernière réponse est affichée, les précédentes sont
      comptées, pas empilées.
- [x] Suivi : compte à rebours « prochaine lecture dans N s » avec l'indicateur
      qui tourne ; « Relire le statut » n'apparaît que si la lecture automatique
      s'est arrêtée avant la fin ; « Corriger et recharger » apparaît seul dès
      qu'il y a des rejets ; « Terminer » ramène à l'accueil, qui garde le bilan.
- [x] Phrase de bas de page et étape « Terminé » supprimées.
- [ ] À vérifier en exécution : `oj-c-train` et l'édition de ligne `oj-c-table`
      dans la version JET du pod.

## Itération 8 — page Redwood, flux multi-pages (build 22)

Demande : « une page Redwood d'Oracle », et un flux de plusieurs pages, une par
étape. Le fond n'a pas bougé : mêmes chaînes, mêmes contrôles, mêmes tests.

- [x] L'état du dossier vit dans le flux (`main-flow.json`) ; les chaînes sont
      des chaînes de flux (`main-flow-chains/`), référencées `flow:` depuis les
      pages ; les fonctions d'affichage dans `main-flow.js` (`$flow.functions`).
- [x] Cinq pages : `main-start` (accueil), `dossier-import`, `dossier-check`,
      `dossier-load`, `dossier-track`. Navigation par `goToPageChain`, avec la
      condition qui la justifie (dossier ouvert, feuilles présentes, contrôle
      propre, RequestId). Garde `vbEnter` sur chaque page du dossier.
- [x] Chrome Redwood commun : surtitre, titre, sous-titre, actions à droite ;
      train `oj-c-train` ; pied de page collant avec « Étape n sur 4 » à gauche
      et les actions à droite (Retour, Recontrôler, Continuer).
- [x] Accueil : bandeau `oj-c-message-banner` du dernier dossier, cartes
      d'objet, cartes d'opération à cocher, « Ouvrir le dossier ».
- [x] Contrôle : bandeaux Redwood par niveau (erreur, avertissement,
      confirmation, à savoir), grille éditable, assistant dans un tiroir
      `oj-c-drawer-layout` repliable.
- [x] Chargement : ce qui part en faits (objet, opération, feuilles, lignes),
      deux cartes de sortie, confirmation en place.
- [x] Suivi : bandeau d'issue, une barre `oj-c-progress-bar` par phase, rejets,
      actions de fin.
- [x] Test : chrome identique sur les cinq pages ; chaînes référencées
      existantes ; navigation conditionnelle.
- [ ] À vérifier en exécution : `flow:` dans les écouteurs de page, `oj-c-drawer-layout`,
      `oj-c-message-banner`, `oj-c-progress-bar`, hauteur de la grille dans le tiroir.
- [ ] Accentuation complète des libellés et messages (aujourd'hui sans accents,
      par cohérence avec les messages des chaînes) : à traiter avec le fond.

## Itération 9 — templates Redwood d'Oracle (build 23)

Demande : chaque page sur un Page Template Redwood, comme le recommande Oracle.
Échafaudages fournis par le Designer (`oj-sp-welcome-page`, `oj-sp-guided-process`,
`oj-sp-general-overview-page`) et relus avant de reconstruire.

- [x] Accueil sur **Welcome Page** (`oj-sp-welcome-page`) : bandeau, titre,
      illustration au template ; cartes d'objet et d'opération dans son contenu.
- [x] Dossier sur **Guided Process** (`oj-sp-guided-process`) : une seule page,
      quatre étapes adressées par l'URL (`currentStep`), train et boutons
      Annuler / Précédent / Suivant au template. `sp-before-step-navigate` est
      intercepté : la page décide si l'on avance (contrôle lancé au passage
      Importer → Contrôler ; Charger seulement si le contrôle est propre ;
      Suivre seulement après « Oui, charger »).
- [x] Dialogue Redwood « modifications non enregistrées »
      (`oj-sp-message-unsaved-changes`) sur Annuler ou sortie de page quand le
      dossier a quelque chose à perdre.
- [x] Boutons muets du build 22 : les chaînes redeviennent des chaînes de
      page (syntaxe éprouvée), l'état reste dans le flux (`$flow.variables`,
      lu par les chaînes via `context.$flow.variables`).
- [x] Sous-flux et pages d'essai du Designer retirés.
- [x] Tests : 50 vérifications, dont navigation entre étapes et câblage des
      deux pages (chaînes, écouteurs, fonctions, composants).
- [x] Hypothèses vérifiées en exécution (captures du build 23) : `steps` du
      Guided Process, `page-title` / `overline-text` / `description-text` et slot
      par défaut du Welcome, navigation par `currentStep`.
- [ ] Accentuation complète des libellés et messages : à traiter avec le fond.

## Itération 10 — retours sur le build 23 (build 24)

- [x] Titre et description d'étape en double : le template les affiche déjà,
      l'en-tête maison est retiré. Ne restent que les actions de l'étape, à droite.
- [x] Contenu qui débordait à gauche du gabarit : mêmes marges latérales que
      le titre du template.
- [x] Saisie impossible dans la grille (`oj-c-table`) : grille remplacée par
      `oj-table`, dont l'édition de ligne est éprouvée. Double-clic sur la ligne,
      chaque cellule devient un champ, Entrée valide. Colonne État en pastille.
- [x] Assistant mal placé et coupé : tiroir Redwood `oj-c-drawer-popup` qui
      glisse depuis le bord droit par-dessus la page, sans rien déplacer,
      question toujours visible en bas.
- [x] Bouton « Contrôler le dossier » en double avec « Continuer » : retiré,
      Continuer lance le contrôle.

## Itération 11 — enregistrement du test (build 25)

- [x] Pastilles d'état sans texte lisible (couleur du texte égale au fond) :
      couleurs explicites, fond pâle, texte foncé.
- [x] Colonne Détail tronquée : cellule qui va à la ligne, colonne élargie.
- [x] Tiroir de l'assistant à largeur variable, qui recouvrait parfois la moitié
      de la page : largeur fixe (26 rem), marges intérieures, bouton Fermer.
- [x] Message d'erreur de page hors style : bandeau Redwood d'avertissement.
- [x] Grille vide à l'arrivée sur Contrôler : un seul DataProvider par tableau
      de lignes, la grille ne se recharge plus à chaque rafraîchissement.
- [ ] Assistant : « Vous ne semblez pas autorisé à utiliser cet assistant » dans
      l'enregistrement. Côté tenant : équipe d'agents `AIAGENTHDL` active et rôle
      de l'utilisateur. À vérifier avant de juger les réponses de l'agent.

## Itération 12 — correction d'une ligne (builds 26 à 29)

- [x] Édition en cellule de la grille : trois tentatives (champ moderne, champ
      classique, validation explicite) sans résultat observable sur le pod, et
      une erreur Knockout sur la liaison à clé calculée. Abandonnée.
- [x] Remplacée par un formulaire Redwood « Corriger la ligne » : un clic sur la
      ligne l'ouvre au-dessus de la grille, un champ par colonne, prérempli,
      l'anomalie rappelée ; Enregistrer écrit dans la ligne, qui repasse
      « À contrôler ». Tout est sous le contrôle de la page.
