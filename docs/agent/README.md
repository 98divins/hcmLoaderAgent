# Agent HDL — définition AI Agent Studio

`AIAGENTHDL_v1.json` s'importe depuis AI Agent Studio → Agent Teams, puis doit
être **publié** : une équipe en brouillon ne répond pas à `invokeAsync`.

Le `WorkflowCode` est **`AIAGENTHDL`**. Il entre tel quel dans l'URL d'invocation,
et la page le référence en dur — le changer casse l'appel côté VB.

## Ce que fait cet agent, et ce qu'il ne fait pas

Il prépare, il explique, il diagnostique. **Il ne charge rien.** Aucun de ses
outils ne peut soumettre un fichier : la page VB construit l'archive et appelle
`dataLoadDataSets` sous l'identité de l'utilisateur, après validation explicite.
La validation avant chargement n'est donc pas une consigne donnée au modèle mais
une contrainte de capacité — la distinction est développée dans
`docs/ARCHITECTURE-AGENT-HDL.md`.

## Régénérer le fichier

```
python3 docs/agent/build_agent.py docs/agent/AIAGENTHDL_v1.json
```

Le script porte le texte des prompts et **refuse d'écrire** si un contrôle
échoue. Modifier les prompts dans le script, jamais dans le JSON produit.

## Les contrôles, et pourquoi ils existent

Un import refusé par AI Agent Studio ne dit pas pourquoi. Deux causes connues,
toutes deux vérifiées sur le projet Agent RH :

- **Plus de 4 000 octets dans un champ texte.** `agentRole` et
  `summarizationPrompt` sont des colonnes `VARCHAR2(4000)`. Une version à
  4 023 octets a été refusée, la même à 3 136 est passée. Le script mesure en
  **octets UTF-8** et s'arrête au-delà de 3 400, pour garder de la marge.
- **Caractères exotiques** : espace insécable, tirets cadratins, guillemets
  courbes. Les exports d'Oracle contiennent eux-mêmes la séquence mojibake
  `â€"`, signe qu'un maillon de la chaîne ne travaille pas en UTF-8.

Choix délibéré pour cette v1 : **les prompts sont écrits en ASCII pur**, sans
accents. Les lettres accentuées ordinaires passent l'import d'après le relevé du
projet voisin, mais un premier import se joue sans variable superflue. Une fois
l'import prouvé, les accents peuvent être rétablis — c'est le seul changement à
faire dans ce cas, pour pouvoir l'attribuer sans ambiguïté s'il échoue. Cela
n'affecte pas la langue des réponses : ces textes sont des consignes, pas des
sorties.

Le script ne contrôle que ces deux points. La structure, elle, a été comparée une
fois à un export Oracle connu (`AIAGENTRH_v2.json` du projet Agent RH) : jeu de
clés identique, aux schémas d'outils REST près, que cet agent n'a pas. Cette
comparaison sert à **écarter** l'hypothèse structurelle, pas à trouver la cause
d'un refus — deux fichiers aux clés strictement identiques peuvent se comporter
différemment.

## Points de structure qui comptent

- `Specification.triggers` contient `{"type": "REST", "inputs": []}` : c'est le
  déclencheur qui correspond à l'invocation `invokeAsync` utilisée par la page.
- `summarizationPrompt` **décide du format de sortie** — c'est lui, pas
  `agentRole`, qui rédige la réponse finale et donc qui porte le contrat du bloc
  `agentdata`.
- `agentRole` est le champ affiché « Agent Persona and Role ». Déplacer les
  consignes vers le champ `Prompt` n'a jamais été validé : ne pas le tenter en
  premier.
- `Architecture: "group"` avec un superviseur et un analyste, et
  `agentMappings` où le superviseur se pointe lui-même **et** l'analyste.

## Si l'import est refusé

Réimporter un `WorkflowCode` déjà publié peut être refusé : dépublier d'abord.
Sinon, la cause est presque toujours dans le contenu d'un champ, pas dans la
forme du JSON. Relancer le script pour revoir les mesures.
