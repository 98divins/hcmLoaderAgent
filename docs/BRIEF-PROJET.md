# Brief projet — Plateforme de chargement en masse HCM assistée par l'IA

Document de contexte, à donner tel quel à un assistant ou à un collègue pour
travailler sur la présentation, l'offre ou la suite du produit. État au build 32
(septembre 2026).

## 1. En une phrase

Une application Redwood, construite dans Visual Builder Studio comme extension
d'Oracle Fusion HCM, qui prend en charge **tout le cycle d'un chargement en masse
HCM Data Loader** — importer, contrôler, charger, suivre — avec une IA qui
vérifie, rapproche, propose et explique, sans jamais agir à la place de
l'utilisateur.

## 2. Le problème que l'on résout

HCM Data Loader (HDL) est l'outil standard d'Oracle pour créer et mettre à jour
des données HCM en masse. Il est puissant, et pénible :

- il faut produire un fichier `.dat` au format exact (une ligne METADATA par
  objet, une instruction MERGE ou DELETE par ligne, clés utilisateur, dates
  d'effet, hiérarchie parent-enfant) ;
- les erreurs ne se voient qu'après soumission, plusieurs minutes plus tard,
  dans des messages obscurs (« You need to enter a valid value for the
  LocationId attribute. The current values are 0,MAR01 ») ;
- le contrôle amont (le site existe-t-il ? le parent est-il dans le tenant ?
  la valeur est-elle dans le référentiel ?) se fait à la main, ou pas du tout ;
- les gestionnaires RH n'y touchent pas : c'est réservé aux intégrateurs.

## 3. La vision

**Mettre l'IA dans le processus, pas à côté.** Pas un chat qu'on ouvre en
parallèle, mais un écran métier Oracle (Redwood) où chaque étape est assistée,
et où rien ne part sans validation humaine.

Principes qui structurent tout le projet :

1. **Un dossier = un objet HCM (avec ses enfants) et une seule opération**
   (créer/mettre à jour, ou supprimer). Pas de mélange.
2. **Honnêteté absolue.** Aucun nom d'attribut, code ou valeur n'est inventé :
   tout vient des métadonnées du pod (Audit Reports HDL) ou du tenant (API
   REST). Ce qui n'a pas pu être vérifié est dit « non vérifié », jamais
   « correct ».
3. **La page contrôle, l'agent explique.** Les contrôles déterministes
   (structure, clés, dates, doublons, référentiels, existence dans le tenant)
   sont faits par le code. L'agent IA lit le résultat, l'explique en termes
   métier et propose des corrections, que l'utilisateur applique ou ignore.
4. **Rien ne part sans un geste explicite.** Confirmation avant chargement ;
   une suppression est nommée comme telle.
5. **Livrable à un client.** Templates Redwood d'Oracle, vocabulaire métier
   (dossier, feuille, ligne), pas de jargon technique à l'écran.

## 4. Le parcours utilisateur (quatre étapes, un template Guided Process)

**Accueil** (template Welcome) : choisir l'objet (Location, Organization…) et
l'opération. La matrice objet × opération vient des métadonnées.

1. **Importer** : déposer un ou plusieurs CSV. La page reconnaît l'objet de
   chaque fichier à ses colonnes (parent et enfants), affiche les formats
   attendus (colonnes de clé, date d'effet), refuse avec une explication ce
   qu'elle ne reconnaît pas.
2. **Contrôler** : chaque ligne est vérifiée contre la spécification de
   l'objet (obligatoires, dates, doublons de clé, règles conditionnelles,
   flexfields) et contre le tenant (rapprochement des parents, existence des
   références comme un site, appartenance aux lookups). Trois états : erreur,
   à vérifier, OK. Bandeaux Redwood, grille, formulaire de correction par
   ligne. L'assistant (tiroir) explique et propose des « corrections
   certaines » applicables en un clic.
3. **Charger** : ce qui va partir, en clair. Deux sorties : télécharger le
   `.dat`, ou charger dans Oracle sous l'identité de l'utilisateur, après
   confirmation.
4. **Suivre** : le job HDL est relu automatiquement jusqu'à sa fin (transfert,
   import, chargement). Chaque rejet est rattaché à la ligne du dossier par
   son numéro de ligne dans le fichier envoyé, et expliqué par l'assistant.
   Les lignes acceptées sont marquées et ne repartent pas. « Corriger et
   recharger » ramène au contrôle ; « Terminer » revient à l'accueil avec le
   bilan.

## 5. Architecture, en bref

- **Visual Builder Studio, App UI d'extension Fusion** (`hcmloaderagent`),
  pages Redwood sur templates Oracle (`oj-sp-welcome-page`,
  `oj-sp-guided-process`), composants JET.
- **État du dossier dans les variables du flux**, chaînes d'action JavaScript
  par page, un module de fonctions d'affichage. Une chaîne d'enchaînement
  (`sequenceChain`) car Visual Builder lance en parallèle les chaînes listées
  sur un même écouteur.
- **Catalogue de métadonnées** généré depuis les Audit Reports HDL du pod
  (`docs/metadata/build_catalog.py`) : attributs, types, obligations, lookups,
  clés, parents, références. Injecté dans la page. Ce catalogue fait autorité.
- **API REST Fusion** : `locationsV2`, `organizations`, `commonLookupsLOV`,
  `dataLoadDataSets` (soumission et statut HDL).
- **AI Agent Studio** : une équipe d'agents `AIAGENTHDL` (superviseur + analyste
  HDL), version v10. Le prompt lui interdit d'inventer, lui impose le langage
  métier, lui interdit les valeurs de remplacement (« à fournir », « undefined »)
  et de conclure « tout est en ordre » quand le contrôle dit le contraire.
  Les propositions reviennent dans un bloc structuré que la page applique
  ligne par ligne, après garde-fous.
- **Tests hors navigateur** (`docs/tests/run.js`, 58 vérifications) sur les
  jeux d'essai Location et Organization.
- Dépôts : VB Studio git + miroir GitHub `98divins/hcmLoaderAgent`.

## 6. Périmètre actuel

- Objets : **Location** (+ LocationOtherAddress, LocationLegislative,
  LocationExtraInfo) et **Organization** (+ OrgUnitClassification,
  OrgInformation). Ajouter un objet = ajouter ses Audit Reports au catalogue.
- Chargements réels effectués sur le pod de démonstration Sqorus (Vision),
  rejets Oracle rattachés à la bonne ligne.

## 7. Où en est-on, honnêtement

- Interface Redwood en place, parcours complet testé en conditions réelles.
- Points en cours : l'assistant renvoie parfois « non autorisé » (droits sur
  l'équipe d'agents côté tenant) ; l'objet Location lui-même est déclaré
  « création et mise à jour seulement » faute d'Audit Report du composant ;
  accentuation des libellés à finir ; persistance d'un dossier entre deux
  sessions non faite.
- Statut à annoncer : **démonstrateur en construction sur notre propre SIRH**,
  démo sur demande. Pas encore un produit livrable.

## 8. Positionnement face à l'offre Oracle

Oracle livre en 26D un **Data Loader Advisor** (AI Agent Studio) : un agent
conversationnel qui répond aux questions HDL/HSDL, diagnostique un chargement
à partir de son numéro de requête et génère un fichier `.dat` conforme. Utile,
mais c'est une question et une action à la fois ; le processus reste à la
charge de l'utilisateur.

Notre différence :

| | Data Loader Advisor (Oracle) | Plateforme Sqorus |
|---|---|---|
| Forme | Chat | Écran métier Redwood, quatre étapes guidées |
| Avant le chargement | Génère un fichier | Reconnaît, contrôle, rapproche avec le tenant, propose des corrections |
| Chargement | À faire soi-même | Depuis l'écran, sous l'identité de l'utilisateur, après confirmation |
| Après | Explique un rejet si on lui donne le RequestId | Suit le job, rattache chaque rejet à sa ligne, explique, permet de corriger et recharger |
| Garde-fous | Ceux de l'agent | Contrôles déterministes dans le code, l'IA n'écrit jamais seule |

Le message pour l'offre : Sqorus sait **combiner AI Agent Studio, Visual
Builder Studio et les API Oracle** pour aller au-delà du catalogue, quand un
agent ne suffit pas. La plateforme de chargement en est la preuve par l'exemple.

## 9. Dans le support « Offre IA Oracle HCM »

- Slide proposée : « Aller au-delà : l'IA dans vos processus, de bout en
  bout », dans la section C « Notre démarche », après « Le modèle de
  déploiement en quatre niveaux ». Deux cartes (ce qu'Oracle livre / ce que
  Sqorus construit), badge « Démonstrateur en construction », bandeau
  « L'IA n'est plus un chat à côté du processus : elle est dans l'écran
  métier, à chaque étape, sous contrôle humain. »
- Retouches possibles : slide 33 point 01 (« Built in, not bolted on ») et
  slide 31 service 002 (build custom : agents et pages Redwood assistées).

## 10. Vocabulaire

Dossier (un chargement), feuille (un objet du dossier, un fichier), ligne,
opération (créer/mettre à jour = MERGE, supprimer = DELETE), rapprochement
(recherche du parent ou de la référence dans le dossier puis dans le tenant),
non vérifié (le tenant n'a pas pu répondre), RequestId (numéro du job HDL),
Audit Report (export Oracle des métadonnées d'un objet HDL).
