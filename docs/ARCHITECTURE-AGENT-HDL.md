# Plateforme de chargement en masse HCM — architecture

Une plateforme de bout en bout pour préparer, contrôler, charger et corriger des
données HCM en masse. Un agent l'assiste **à quatre endroits précis** ; il n'en
est pas la porte d'entrée.

Extension `site_hcm_extension`, branche `hcmLoaderAgent`, App UI `hcmloaderagent`.

---

## 1. Ce que le produit est, et ce qu'il n'est pas

**Ce n'est pas un chat.** Un utilisateur qui doit charger 100 sites n'a pas envie
de décrire 100 sites en langage naturel. Il a un fichier, ou des lignes à saisir,
et il veut savoir avant de charger ce qui va se passer.

L'objet central du produit est donc un **dossier de chargement** : un plan de
lignes, avec son objet métier, son mapping, son état de rapprochement, ses
anomalies et son historique de soumission. La conversation n'est qu'un des moyens
d'agir dessus, jamais le dépôt de vérité.

**La grille de données est la source de vérité.** Tout ce que l'agent propose
atterrit dedans sous forme de modification visible et réversible. Rien ne change
sans que l'utilisateur l'ait vu.

---

## 2. Correction d'une hypothèse précédente

La première version de ce document affirmait qu'AI Agent Studio ne permettait que
des outils adossés à des objets métier Oracle (`sourceObjectCode`), et en tirait
que l'agent était *dans l'incapacité* de déclencher un chargement.

**C'était faux, et fondé sur un inventaire incomplet** — les seuls exports que
j'avais sous les yeux. L'inventaire réel des Tools du pod montre un type
**`External REST`**, et un bouton **Add** sur les onglets Tools et Business
Objects : des outils personnalisés sont créables, y compris vers des ressources
REST arbitraires.

La conclusion, elle, ne change pas — mais elle change de nature :

> Que l'agent ne déclenche aucun chargement n'est plus une limite de plateforme,
> c'est une **décision d'architecture**.

Elle se justifie par l'asymétrie entre lire et écrire. Un chargement HDL est une
action large, différée de plusieurs minutes, et difficilement réversible. Le
déclencheur doit donc être un geste humain explicite, exécuté par la page, tracé
sous l'identité de l'utilisateur — pas la conséquence d'une phrase interprétée.

En revanche, un outil `External REST` **en lecture** est une bonne idée à
instruire : il permettrait à l'agent d'aller chercher lui-même les métadonnées
d'un objet ou de vérifier une valeur existante, au lieu que la page les lui
injecte. À évaluer en phase 3, quand le multi-objets arrivera.

---

## 3. Le dossier de chargement et ses états

```
   brouillon ──► mappé ──► rapproché ──► validé ──► soumis ──┬─► terminé
       ▲                                                      │
       └──────────── correction des rejets ◄──────────────────┴─► partiel
                                                              └─► échoué
```

| État | Ce qui est acquis | Ce qui reste à faire |
|---|---|---|
| **brouillon** | des lignes existent (fichier, saisie, collage) | l'objet métier n'est pas encore tranché |
| **mappé** | objet métier choisi, colonnes du fichier associées aux attributs HDL | rien n'est confronté au réel |
| **rapproché** | chaque ligne sait si elle crée ou met à jour, et par quelle clé | les anomalies ne sont pas corrigées |
| **validé** | plus aucune anomalie bloquante, l'utilisateur a vu le fichier | rien n'est parti |
| **soumis** | `RequestId` obtenu, traitement Oracle en cours | l'issue est inconnue |
| **terminé / partiel / échoué** | statut et messages ligne à ligne lus | les rejets restent à corriger |

Un dossier **partiel** se recycle en brouillon ne contenant que les lignes
rejetées : c'est la boucle qui fait gagner du temps, et c'est là que l'agent est
le plus utile.

---

## 4. La surface

```
┌──────────────────────────────────────────────────────────────────────┐
│  Chargement de sites (Location)          brouillon · 100 lignes      │
├───────────┬──────────────────────────────────────────┬───────────────┤
│  ÉTAPES   │  PLAN DE CHARGEMENT                      │  ASSISTANT    │
│           │                                          │               │
│ ○ Données │  ┌────┬──────────┬─────────┬───────────┐ │ Contextuel :  │
│ ● Mapping │  │ ⚠  │LocationCd│ SetCode │LocationNam│ │ il voit       │
│ ○ Rapproch│  ├────┼──────────┼─────────┼───────────┤ │ l'étape,      │
│ ○ Contrôle│  │ ✓  │ PAR01    │ COMMON  │ Paris     │ │ l'objet, les  │
│ ○ Valider │  │ ⚠  │ LYO01    │ (vide)  │ Lyon      │ │ anomalies.    │
│ ○ Charger │  │ ✓  │ MAR01    │ COMMON  │ Marseille │ │               │
│ ○ Résultat│  └────┴──────────┴─────────┴───────────┘ │ [Proposition] │
│           │                                          │  ┌──────────┐ │
│           │  92 à créer · 8 à mettre à jour · 1 ⚠     │  │ 8 lignes │ │
│           │                                          │  │ sans Set │ │
│           │                                          │  │ Code     │ │
│           │                                          │  │[Appliquer│ │
│           │                                          │  │ Ignorer] │ │
└───────────┴──────────────────────────────────────────┴───────────────┘
```

Trois zones, et une règle par zone :

- **Le rail d'étapes** montre où on en est et ce qui reste. Il n'est pas un
  tunnel : on revient en arrière sans perdre le travail fait.
- **La grille** est le poste de travail. C'est là qu'on lit, qu'on corrige, qu'on
  décide. Elle porte l'état de chaque ligne (saine, anomalie, à créer, à mettre à
  jour, rejetée).
- **L'assistant** est un panneau latéral **contextuel**, jamais une page blanche.
  Il connaît l'étape courante, l'objet métier, les colonnes et les anomalies. Ses
  réponses arrivent sous forme de **propositions applicables**, avec un bouton
  Appliquer et un bouton Ignorer.

Le champ de saisie libre reste disponible dans ce panneau, mais il est le
complément du parcours, pas son point de départ.

---

## 5. Où l'agent intervient — et où il n'intervient pas

| Étape | Agent | Pourquoi |
|---|---|---|
| Apporter les données | **non** | lire un CSV est déterministe, un modèle n'y ajoute rien et peut y perdre des lignes |
| Identifier l'objet métier | **oui** | « je veux charger des sites » → `Location`. Ambigu par nature, c'est du langage |
| Mapper les colonnes | **oui** | `code_site`, `Code du site`, `LOC_CODE` → `LocationCode`. Le rapprochement lexical est exactement son métier |
| Rapprocher avec l'existant | **non** | c'est une requête REST sur la clé. Une réponse d'API, pas une opinion |
| Contrôler et corriger | **oui** | expliquer pourquoi une ligne est douteuse, proposer une normalisation |
| Prévisualiser le fichier | **non** | le `.dat` se génère à partir du plan, sans interprétation |
| Valider | **non** | geste humain, par définition |
| Charger et suivre | **non** | appels REST sous l'identité de l'utilisateur |
| Expliquer les rejets | **oui** | traduire un message Oracle cryptique en cause et en correctif : le plus fort gain du produit |

Le fil conducteur : **l'agent traite ce qui relève du langage et de
l'interprétation ; la page traite ce qui relève du calcul et de l'appel réseau.**
Chaque fois que la réponse est déterministe, le code la produit — c'est plus
rapide, gratuit, reproductible, et ça ne se trompe pas.

---

## 6. Le contrat entre la page et l'agent

L'agent reçoit du contexte factuel injecté par la page, jamais un simple
« aide-moi ». Il répond en prose plus un bloc balisé `agentdata` que la page
extrait puis retire du texte affiché.

Trois formes de réponse :

```jsonc
{"display":"mapping",       // proposition d'association de colonnes
 "pairs":[{"source":"code_site","target":"LocationCode","confidence":"high"}],
 "unmapped":["commentaire"]}

{"display":"issues",        // anomalies détectées, avec correctif proposé
 "rows":[{"rowRef":"LYO01","field":"SetCode","problem":"valeur absente",
          "suggestedValue":"COMMON","rationale":"toutes les autres lignes"}]}

{"display":"diagnosis",     // lecture des rejets après chargement
 "rows":[{"rowRef":"PAR01","oracleMessage":"<texte exact>",
          "explanation":"...","suggestedFix":{"field":"SetCode","value":"COMMON"}}]}
```

**Règles non négociables :**

- toute proposition est **applicable ou ignorable**, jamais appliquée d'office ;
- l'agent ne nomme un attribut que s'il figure dans les métadonnées qui lui ont
  été fournies ; sinon il le dit et demande ;
- un bloc absent ou malformé n'efface jamais la réponse rédigée — le parsing est
  isolé dans son propre `try` ;
- une proposition ne porte que sur des lignes réellement présentes dans le plan.

---

## 7. Modèle d'opérations HDL

Inchangé, et toujours le socle : c'est ce que le générateur consomme et ce que la
grille affiche.

### 7.1 Instruction

La première colonne de chaque ligne porte l'instruction. `MERGE` crée si absent
et met à jour si présent. `DELETE` supprime, pour les objets qui l'autorisent —
**à vérifier objet par objet, pas à supposer**. L'instruction est une propriété
de la ligne dans le plan, jamais une constante du code.

### 7.2 Identification d'un enregistrement

| Famille | Nature | Usage |
|---|---|---|
| **User key** | attributs métier formant une référence unique | le cas de Location : `LocationCode` **+** `SetCode`. Voie par défaut |
| **Source key** | clé du système source, conservée entre chargements | réimports successifs depuis un même système |
| **Surrogate ID / GUID** | identifiant interne Fusion | mise à jour d'enregistrements déjà connus par leur ID |

Leçon déjà payée : `"...doesn't include values that define a unique reference to
the record"` venait d'une user key incomplète (`SetCode` manquant). La composition
de la user key est **une donnée par objet**, à lire, jamais à deviner.

### 7.3 Dates d'effet

- `EffectiveStartDate` au format **`yyyy/MM/dd`** dans le fichier (la saisie ISO
  `yyyy-MM-dd` est convertie par le moteur) ;
- `EffectiveEndDate` à `4712/12/31` pour un enregistrement ouvert ;
- une mise à jour peut **corriger** la version courante ou **créer une nouvelle
  version** à une date donnée. C'est une décision fonctionnelle : elle remonte à
  l'utilisateur, l'agent ne la prend pas en silence.

### 7.4 Le plan de chargement

Format pivot unique — l'agent le produit ou l'amende, la grille l'affiche, le
générateur le consomme. Pas de traduction intermédiaire.

```jsonc
{
  "businessObject": "Location",
  "keyStrategy": "userKey",
  "keyColumns": ["LocationCode", "SetCode"],
  "columns": ["LocationCode", "SetCode", "EffectiveStartDate", "LocationName"],
  "rows": [
    { "instruction": "MERGE",
      "operation": "create",
      "values": { "LocationCode": "PAR01", "SetCode": "COMMON" },
      "issues": [] }
  ]
}
```

---

## 8. Deux questions ouvertes qui touchent le fond

### 8.1 Où vit un dossier de chargement entre deux sessions ?

Un chargement HDL prend plusieurs minutes. Un utilisateur qui ferme son onglet
pendant l'attente doit retrouver son dossier — sinon la promesse « je charge pour
vous » ne tient pas.

Aujourd'hui l'état vit dans les variables de la page : il disparaît au
rechargement. Trois voies, par ordre de préférence :

1. **Ne rien persister, mais rendre le dossier reconstructible** : le `RequestId`
   suffit à retrouver un chargement soumis via `dataLoadDataSets`. L'utilisateur
   colle ou choisit son `RequestId` et retrouve statut et rejets. Simple, sans
   stockage, et suffisant pour tout ce qui suit la soumission.
2. **Persister côté navigateur** le dossier en cours de préparation. Couvre la
   fermeture accidentelle, mais reste local à un poste.
3. **Persister côté serveur** — le seul vrai partage entre utilisateurs, et le
   plus coûteux. Aucune brique évidente côté extension VB : à instruire avant
   d'être promis.

Recommandation : (1) tout de suite, (2) si la gêne se manifeste, (3) seulement si
le partage entre utilisateurs devient un besoin exprimé.

### 8.2 Où lire les métadonnées d'un objet métier ?

C'est ce qui décide si la plateforme reste sur Location ou s'ouvre à tout HDL.
`docs.oracle.com` est **bloqué par la politique d'egress** de l'environnement de
développement, dans les deux sens — la documentation en ligne n'est donc pas
exploitable par moi, et de toute façon une doc n'est pas une source d'exécution.

La bonne source est le pod lui-même. Les Service Connections `adf-rest` résolvent
déjà leur schéma dynamiquement via `describe.openapi` : la page peut donc, **à
l'exécution**, lire les attributs réels d'une ressource et les injecter dans le
contexte de l'agent. Les métadonnées cessent d'être des constantes écrites en dur
et deviennent une lecture — ce qui supprime d'un coup le risque d'attribut
inventé.

Reste à établir si la liste des attributs **HDL** (qui n'est pas exactement celle
de la ressource REST) est atteignable par le même chemin. C'est le premier point
à instruire en phase 3.

---

## 9. Ce qui est acquis

Vérifié en exécution réelle, rien de supposé :

- **Chaîne agent complète** : `invokeAsync` puis scrutation du statut, sous OAuth
  2.0 User Assertion via le backend `fusionAi`. Première réponse obtenue en 9,2 s,
  conversation multi-tours par `conversationId`.
- **Chaîne de chargement complète** : génération du `.dat`, archive `.zip`
  construite en pur JS, `uploadFile` → `ContentId`, `createFileDataSet` →
  `RequestId`, puis statut et child resource `messages`
  (`RequestId 9908614`, `ORA_SUCCESS`, 3/3 lignes chargées).
- **Moteur HDL** découplé et piloté par le plan, testé hors VB.
- **Objet Location** : colonnes, user key `LocationCode` + `SetCode`, attribut
  `LocationName` et non `Name` — chacun établi par un message d'erreur réel.

À prouver, dans cet ordre : les métadonnées HDL (§8.2), l'existence d'un
`fileAction` d'import seul permettant une validation Oracle avant engagement, le
comportement de `DELETE` par objet.

---

## 10. Phasage

| Phase | Contenu | État |
|---|---|---|
| **0** | Moteur HDL réutilisable, piloté par le plan | **fait** |
| **1** | Câblage agent : `invokeAsync`, polling, conversation | **fait** |
| **2** | Poste de travail : grille, rail d'étapes, panneau contextuel | à faire |
| **3** | Location de bout en bout : mapping, rapprochement, validation, chargement, explication des rejets | après 2 |
| **4** | Boucle de correction : un dossier partiel se recycle en brouillon | après 3 |
| **5** | Multi-objets, adossé aux métadonnées lues à l'exécution | §8.2 |
| **6** | Volumétrie au-delà de quelques centaines de lignes | mesure réelle |

La phase 2 est le vrai changement de nature : on passe d'une conversation à un
poste de travail. C'est elle qui rend le produit utilisable par quelqu'un qui a
un fichier et pas de patience.
