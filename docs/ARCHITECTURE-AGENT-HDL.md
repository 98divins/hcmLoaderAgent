# Agent de chargement en masse HCM (HDL) — architecture

Assistant conversationnel qui accompagne un utilisateur RH de bout en bout sur un
chargement HCM Data Loader : comprendre la demande, identifier l'objet métier et
ses champs, nettoyer et rapprocher le fichier avec les données existantes,
prévisualiser, charger, puis expliquer les rejets.

Extension `site_hcm_extension`, branche `hcmLoaderAgent`. Elle hérite du loader
Location déjà validé et des Service Connections HCM (`hcmRestLocations`,
`hcmRestLoader`).

---

## 1. La contrainte qui décide de tout

Le projet Agent RH (dépôt `hragent`, extension `site_THELAB`) a établi et vérifié
en exécution la couche LLM utilisable ici :

- **Oracle AI Agent Studio**, invoqué en REST asynchrone depuis la page VB :
  `POST /api/fusion-ai/orchestrator/agent/v2/<AgentTeamCode>/invokeAsync` → `jobId`,
  puis `GET .../status/<jobId>` jusqu'à un statut terminal.
- Service Connection classique → backend custom `fusionAi` qui enveloppe `base:fa`
  en surchargeant l'authentification en **OAuth 2.0 User Assertion**
  (`urn:opc:resource:fusion:<pod>:fusion-ai/`). Vérifié en Run (HTTP 202).
- **Aucune clé d'API à héberger** : l'identité de l'utilisateur connecté est
  propagée jusqu'à l'orchestrateur.

Point décisif, relevé dans les définitions d'agent de `hragent` : **les outils
d'un agent AI Agent Studio sont des objets métier Oracle référencés par
`sourceObjectCode`** (`ORA_MY_TEAM`, `ORA_CURRENT_SALARY`…), copiés depuis
l'export du Manager Concierge. Rien dans ce qui a été prouvé jusqu'ici ne montre
qu'on peut déclarer un outil REST arbitraire pointant sur `dataLoadDataSets`
(les définitions existantes portent toutes `customFlag: false`).

**Conséquence : l'agent ne charge pas. Il raisonne.** L'exécution reste dans la
page VB, avec `Actions.callRest`, sous l'identité de l'utilisateur.

Ce n'est pas un contournement, c'est la bonne frontière. Elle rejoint la règle de
sécurité déjà posée sur le projet Agent RH — *le périmètre ne doit jamais reposer
uniquement sur les instructions données à l'agent* — et elle rend la validation
avant chargement (exigence n°5 du cadrage) **structurelle** : l'agent n'a
matériellement aucun moyen de déclencher un chargement.

---

## 2. Partage des rôles

```
┌─────────────────────────────────────────────────────────────┐
│ Page VB « Agent HDL »  (extension site_hcm_extension)       │
│                                                              │
│  ① saisie / dépôt fichier        ⑤ tableau de prévisualisation│
│  ② fil de conversation           ⑥ validation explicite       │
│                                  ⑦ résultat + rejets expliqués│
│                                                              │
│  EXÉCUTION (déterministe, tracée, identité utilisateur) :    │
│   • construction du .dat + .zip        [validé]              │
│   • uploadFile → createFileDataSet     [validé]              │
│   • statut + child resource messages   [validé]              │
│   • lectures REST de rapprochement     [mécanique connue]    │
└───────────────┬─────────────────────────────────────────────┘
                │ invokeAsync / status  (OAuth User Assertion)
                ▼
┌─────────────────────────────────────────────────────────────┐
│ AI Agent Studio — Agent Team « AIAGENTHDL »                 │
│                                                              │
│  RAISONNEMENT uniquement :                                   │
│   • identifier l'objet métier visé                           │
│   • mapper les colonnes du fichier sur les attributs HDL     │
│   • choisir l'instruction (MERGE / DELETE) et les clés       │
│   • signaler les champs obligatoires manquants               │
│   • expliquer chaque ligne rejetée à partir du message réel  │
│                                                              │
│  Ne dispose d'aucun outil de chargement.                     │
└─────────────────────────────────────────────────────────────┘
```

L'agent reçoit du contexte **factuel** injecté par la page (métadonnées de l'objet,
extrait du fichier, données existantes rapprochées, messages d'erreur bruts) et
répond en prose + un bloc de données structuré.

---

## 3. Le pipeline

| # | Étape | Qui | État |
|---|---|---|---|
| 1 | L'utilisateur décrit son besoin / dépose un fichier | page | à faire |
| 2 | L'agent identifie l'objet métier et propose un mapping de colonnes | agent | à faire |
| 3 | La page lit les données existantes pour rapprocher (create vs update) | page (REST) | mécanique connue |
| 4 | L'agent produit le plan de chargement ligne à ligne (instruction, clés, anomalies) | agent | à faire |
| 5 | La page affiche le tableau de prévisualisation | page | à faire |
| 6 | **Validation explicite de l'utilisateur** | utilisateur | obligatoire |
| 7 | Génération `.dat` + `.zip`, `uploadFile`, `createFileDataSet` | page | **validé** |
| 8 | Polling du statut, lecture de la child resource `messages` | page | **validé** |
| 9 | L'agent explique les rejets et propose des corrections | agent | à faire |
| 10 | Production du `.dat` final + synthèse du chargement | page | à faire |

À l'étape 6, deux sorties possibles, conformément au besoin exprimé :
**« je télécharge le `.dat` et je charge moi-même »** ou **« charge pour moi »**.

---

## 4. Modèle d'opérations HDL

C'est le point qui doit être cadré avant d'écrire la moindre ligne de génération
générique, parce qu'il varie par objet métier.

### 4.1 Instruction

La première colonne de chaque ligne de données porte l'instruction. Le loader
Location validé n'utilise que `MERGE` (créer si absent, mettre à jour si présent).
`DELETE` existe pour les objets qui l'autorisent — **à vérifier objet par objet
sur le pod, pas à supposer.** L'instruction est donc une **propriété du plan de
chargement**, décidée ligne à ligne à l'étape 4, jamais codée en dur.

### 4.2 Identification d'un enregistrement

HDL admet plusieurs familles de clés, et le choix conditionne tout le
rapprochement de l'étape 3 :

| Famille | Nature | Usage |
|---|---|---|
| **User key** | Attributs métier lisibles formant une référence unique | Le cas du loader Location : `LocationCode` **+ `SetCode`** — la seule combinaison des deux constitue la référence unique. C'est la voie par défaut. |
| **Source key** | Clé du système source, conservée par HCM entre chargements | Réimports successifs depuis un même système externe. |
| **Surrogate ID / GUID** | Identifiant interne Fusion | Mise à jour d'enregistrements déjà connus par leur ID. |

**Leçon déjà payée** : le message `"The line for component Location with instruction
MERGE doesn't include values that define a unique reference to the record"` a été
obtenu parce que la user key était incomplète (`SetCode` manquant). La composition
exacte de la user key est **une donnée par objet métier**, à lire dans les
métadonnées HDL — jamais à deviner.

### 4.3 Dates d'effet

Les objets date-effective (Location en fait partie) exigent une gestion explicite :

- `EffectiveStartDate` au format **`yyyy/MM/dd`** dans le fichier HDL (attention :
  le format ISO `yyyy-MM-dd` de la saisie doit être converti — c'est déjà fait
  dans le code validé).
- `EffectiveEndDate` : `4712/12/31` pour un enregistrement ouvert.
- Une mise à jour peut vouloir **corriger** l'enregistrement courant ou **créer une
  nouvelle version** à une date donnée. Ce choix est une décision fonctionnelle
  qui doit remonter à l'utilisateur, pas être prise silencieusement par l'agent.

### 4.4 Modèle de plan de chargement

Structure pivot entre l'agent et la page, indépendante de l'objet métier :

```jsonc
{
  "businessObject": "Location",
  "keyStrategy": "userKey",
  "keyColumns": ["LocationCode", "SetCode"],
  "columns": ["LocationCode", "SetCode", "EffectiveStartDate", "LocationName", "..."],
  "rows": [
    {
      "instruction": "MERGE",
      "operation": "create",          // create | update | delete — issu du rapprochement
      "values": { "LocationCode": "PAR01", "SetCode": "COMMON", "...": "..." },
      "issues": [                      // vide si la ligne est saine
        { "severity": "error", "field": "Country",
          "message": "Valeur absente et obligatoire pour cet objet" }
      ]
    }
  ]
}
```

Ce plan est ce que le tableau de prévisualisation affiche, et exactement ce que le
générateur `.dat` consomme. Un seul format, pas de traduction intermédiaire.

---

## 5. Contrat de données page ↔ agent

Reprise de la convention déjà éprouvée sur l'Agent RH : l'agent répond en prose,
et **joint en fin de message un bloc JSON** que la page retire du texte avant
affichage. Si le bloc manque ou est malformé, la prose s'affiche seule — jamais
d'écran cassé.

Ici le bloc porte soit un **plan de chargement** (section 4.4), soit un
**diagnostic de rejets** :

```jsonc
{
  "display": "loadPlan" | "loadResult" | "clarification",
  "sources": ["Métadonnées Location", "locationsV2"],
  "plan": { /* section 4.4 */ },
  "explanations": [
    { "rowRef": "PAR01", "oracleMessage": "<message brut Oracle>",
      "explanation": "…", "suggestedFix": { "field": "SetCode", "value": "COMMON" } }
  ]
}
```

**Règle anti-invention.** L'agent ne nomme un attribut que s'il figure dans les
métadonnées qui lui ont été fournies, n'affirme une correspondance que si le
rapprochement de la page l'a retournée, et n'explique un rejet qu'à partir du
message Oracle réel joint au contexte. Quand il ne sait pas, il le dit et demande
— la clarification est une sortie prévue du contrat (`display: "clarification"`),
pas un échec.

---

## 6. Garde-fous

- **Validation explicite obligatoire** avant tout chargement réel. Structurelle :
  l'agent n'a pas d'outil de chargement.
- **Identité de l'utilisateur** de bout en bout (session Fusion pour `hcmRestApi`,
  OAuth User Assertion pour l'orchestrateur). La sécurité de données Fusion
  s'applique en plus, et les actions restent traçables au nom de l'utilisateur.
- **Validation côté Oracle avant engagement** : HDL distingue l'import (mise en
  tables de staging) du chargement effectif. Si le pod expose bien un `fileAction`
  d'import seul, la prévisualisation peut être adossée à une **validation réelle
  Oracle** plutôt qu'à une vérification devinée côté navigateur — gain majeur de
  fiabilité. **À prouver sur le pod avant d'être promis.**
- **Volumétrie** : cible initiale 100 lignes. La construction du ZIP et l'encodage
  base64 se font dans le navigateur ; au-delà de quelques milliers de lignes il
  faudra déplacer cette étape. Ne pas promettre un volume non mesuré.

---

## 7. Acquis vs à prouver

**Validé en exécution réelle** (loader Location, `RequestId 9908614`, `ORA_SUCCESS`,
3/3 lignes chargées) :

- format HDL `METADATA|<Objet>|<Col…>` / `MERGE|<Objet>|<Val…>`, pipe-délimité,
  dates `yyyy/MM/dd` ;
- construction du `.zip` en pur JS (en-têtes locaux, annuaire central, EOCD, CRC32),
  testée indépendamment avant intégration ;
- `uploadFile` → `ContentId`, puis `createFileDataSet` → `RequestId` ;
- lecture du statut et de la child resource `messages` — c'est elle qui a livré les
  vrais messages Oracle ayant permis de corriger `Name` → `LocationName` puis
  d'ajouter `SetCode`.

**À prouver, dans cet ordre :**

1. La source des **métadonnées HDL** (attributs, obligatoires, composition de la
   user key) accessible depuis le pod. C'est le principal inconnu : sans elle,
   l'agent ne peut pas être générique et reste cantonné à Location.
2. L'existence d'un `fileAction` d'**import seul** (validation sans chargement).
3. Le comportement de `DELETE` et des autres instructions par objet.
4. La capacité d'AI Agent Studio à porter un **outil REST custom** — si elle
   existe, elle ouvre une variante où l'agent lit lui-même les métadonnées ; sinon
   la page les lui injecte, ce qui suffit.

---

## 8. Phasage

| Phase | Contenu | Dépend de |
|---|---|---|
| **0** | Portage du moteur HDL validé en module réutilisable, découplé de la page loader | rien — faisable tout de suite |
| **1** | Page « Agent HDL » : fil de conversation + `invokeAsync`/poll | Agent Team `AIAGENTHDL` publiée dans AI Agent Studio |
| **2** | Objet **Location** de bout en bout : mapping, rapprochement, prévisualisation, validation, chargement, explication des rejets | phases 0 et 1 |
| **3** | Généralisation multi-objets | métadonnées HDL (§7.1) |
| **4** | Volumétrie au-delà de quelques centaines de lignes | mesure réelle |

---

## 9. Câblage vers AI Agent Studio

Fait en code, par **transposition des fichiers réels de `site_THELAB`** vérifiés en
Run — pas par génération à l'aveugle depuis le Designer :

- Backend **`fusionAi`** dans `services/self/catalog.json` : enveloppe `base:fa`
  en surchargeant l'authentification en OAuth 2.0 User Assertion, scope
  `urn:opc:resource:fusion:eqjz:fusion-ai/` (même pod).
- Service Connection **`aiAgentHdl`** dans `services/self/aiAgentHdl/openapi3.json` :
  `POST …/agent/v2/AIAGENTHDL/invokeAsync` et `GET …/agent/v1/AIAGENTHDL/status/{jobId}`.
  Noter les versions différentes — **`v2` pour l'invocation, `v1` pour le statut** ;
  ce n'est pas une coquille.
- Le piège connu — le Designer écrit `base:fa` dans les `servers` et ne repointe
  jamais vers `fusionAi` tout seul, ce qui donne un 401 silencieux — est **évité
  d'emblée** : le fichier est écrit directement avec
  `"servers": [{ "url": "vb-catalog://backends/fusionAi" }]`.

App UI **`hcmloaderagent`**, urlId `x-hcmLoaderAgent`, flow `main`, page `main-start`.

**Reste à faire côté Fusion (hors git)** : créer et **publier** l'Agent Team sous
le code `AIAGENTHDL`, et donner accès à cette équipe au rôle des utilisateurs
concernés. Tant qu'elle n'existe pas, l'invocation renvoie un 404 — la page le dit
explicitement plutôt que d'afficher une erreur générique.

Rappel qui fait perdre du temps : **l'onglet Test du Designer répond 401 même
quand tout est juste** (il n'exécute pas la requête avec la session Fusion de
l'utilisateur). C'est un faux négatif — seul le mode **Run** tranche.
