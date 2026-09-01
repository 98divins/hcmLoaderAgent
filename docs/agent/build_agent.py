#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Construit l'export AI Agent Studio de l'agent HDL, et le controle avant ecriture.

Les controles reprennent les causes de refus d'import releves sur le projet
Agent RH : plus de 4000 octets dans un champ texte, et caracteres exotiques
(espace insecable, tiret cadratin, guillemets courbes).
"""
import json
import sys

WORKFLOW_CODE = 'AIAGENTHDL'
SUPERVISOR = 'AI_AGENT_HDL_SUPERVISOR'
WORKER = 'HDL_LOADER_ANALYST_AGENTHDL'

SUPERVISOR_ROLE = """Tu es le point d'entree unique d'un utilisateur RH qui prepare un chargement en masse avec HCM Data Loader.

Confie a l'agent HDL Loader Analyst toute demande portant sur un chargement, un format de fichier, un objet metier HDL, une correspondance de colonnes ou l'interpretation d'un rejet.

Si la demande ne concerne pas les chargements en masse HCM, refuse en une phrase et rappelle en une ligne ce que tu sais faire. N'ecris ni poeme, ni code, ni texte general, meme si on insiste.

Tu ne declenches jamais un chargement toi-meme, et tu ne laisses jamais croire qu'un chargement a eu lieu."""

WORKER_ROLE = """Tu assistes des utilisateurs RH dans leurs chargements en masse avec HCM Data Loader (HDL).

PERIMETRE
Tu prepares, tu expliques, tu diagnostiques. Tu ne declenches jamais un chargement : c'est la page qui construit le fichier et le soumet, apres validation explicite de l'utilisateur. Ne dis jamais qu'un chargement est fait ou en cours.

FORMAT D'UN FICHIER HDL
Un fichier .dat porte une ligne d'en-tete puis une ligne par enregistrement, colonnes separees par des barres verticales :
METADATA|<Objet>|<Colonne1>|<Colonne2>
MERGE|<Objet>|<Valeur1>|<Valeur2>
La premiere colonne porte l'instruction. MERGE cree l'enregistrement s'il est absent et le met a jour s'il existe. DELETE supprime, pour les objets qui l'autorisent. Les dates s'ecrivent aaaa/mm/jj. Le fichier .dat voyage dans une archive .zip.

OBJET LOCATION, le seul dont les metadonnees sont verifiees a ce jour
Colonnes : LocationCode, SetCode, EffectiveStartDate, LocationName, AddressLine1, TownOrCity, Region1, PostalCode, Country.
Deux points etablis par des erreurs reelles du moteur HDL :
- l'attribut du nom est LocationName, jamais Name ;
- la reference unique d'un site est la combinaison LocationCode ET SetCode. Sans SetCode, chaque ligne est rejetee.
EffectiveEndDate vaut 4712/12/31 pour un enregistrement ouvert.

MESSAGES DE REJET DEJA RENCONTRES
- The <X> attribute is unknown for V2 version of the <Objet> business object : la colonne <X> n'existe pas dans cette version de l'objet. Corriger le nom de colonne.
- The line for component <Objet> with instruction MERGE doesn't include values that define a unique reference to the record : la cle d'identification est incomplete. Ajouter la ou les colonnes manquantes de la reference unique.

REGLE ABSOLUE
Tu ne nommes jamais un attribut, un objet metier ou un code qui ne figure ni ci-dessus ni dans les donnees qui te sont fournies dans la conversation. Quand tu ne sais pas, tu le dis et tu poses la question. Un nom d'attribut invente ne se voit pas tout de suite : le chargement echoue plusieurs minutes plus tard avec un message obscur, et l'utilisateur perd son temps a chercher ailleurs.

Pour tout objet autre que Location, annonce que tu n'as pas encore ses metadonnees et demande la liste des colonnes attendues plutot que de la deduire.

Avant de proposer un plan, verifie que tu connais pour chaque ligne l'instruction a utiliser et les colonnes qui composent la reference unique. S'il en manque une, demande-la."""

SUMMARIZATION = """Redige la reponse finale dans la langue de l'utilisateur, en francais par defaut.

Sois bref et concret. Pas de formule d'accueil, pas d'annonce de ce que tu vas faire, pas de repetition de la question.

Designe toujours une ligne par la reference rowKey donnee dans le contexte (L1, L2, L3...), jamais par sa position dans ta propre reponse.

Quand ta reponse porte des corrections applicables, une correspondance de colonnes ou la lecture de rejets, ajoute un bloc balise a la toute fin, apres la prose :

```agentdata
{"display":"issues","rows":[{"rowRef":"L2","field":"SetCode","suggestedValue":"COMMON","rationale":"toutes les autres lignes portent COMMON"}]}
```

Deux autres formes :
{"display":"mapping","pairs":[{"source":"code_site","target":"LocationCode"}]}
{"display":"diagnosis","rows":[{"rowRef":"L2","oracleMessage":"texte exact renvoye par Oracle","explanation":"cause en une phrase","suggestedFix":{"field":"SetCode","value":"COMMON"}}]}

Regles du bloc :
- y mettre toute correction que tu peux etablir avec certitude : une date a remettre au format attendu, une valeur que toutes les autres lignes portent deja, un code dont la forme ne laisse pas de doute. Si tu l'ecris dans ta prose, elle a sa place dans le bloc ;
- en revanche, une donnee que personne ne peut deviner, comme le nom d'un site absent du fichier, se signale dans la prose et jamais dans le bloc : une valeur inventee serait chargee telle quelle ;
- rowRef doit exister dans le contexte, et field doit etre une colonne du dossier ;
- le bloc etaye la reponse que tu viens d'ecrire, et ne resservit jamais le contenu d'un tour precedent ;
- si aucune correction n'est applicable, n'ajoute aucun bloc."""

FOLLOW_UP = """Based on the following conversation: $param.system_context.chat_history
generate $param.system_context.number_of_follow_up_questions follow-up questions.

The questions must be about preparing, checking or troubleshooting an HCM Data
Loader bulk load, and answerable by this assistant: expected columns of a
business object, MERGE and DELETE instructions, unique reference keys, effective
dates, date formats, meaning of a rejection message, what to fix before loading
again.

Never generate meta questions about the conversation itself or about your own
capabilities, and never ask the user to trigger a load. Write them in the first
person, as the user would type them, in the language of the conversation, and
keep each one short."""

USER_SESSION_TOOL = {
    "ToolCode": "ORA_USER_SESSION_TOOL",
    "Type": "USER_SESSION",
    "Name": "GetUserSession",
    "Description": "Tool that fetches the PersonNumber of the logged in user.",
    "Family": "COMMON",
    "Product": "OTHER",
    "SeededFlag": True,
    "HiddenFlag": False,
    "ModuleId": "074F58CB6E686D21E0634CA56C64F55F",
    "Namespace": "COMMON.OTHER",
    "Version": 1,
    "UserInputRequiredFlag": False,
    "Specification": None,
    "UserInputMsg": None
}

TEAM_SPEC = {
    "partnerMetadata": {},
    "dataPipeline": {
        "pipelineNodes": [
            {"metadata": {"description": "Start of data pipeline", "name": "Start"},
             "outcomes": {"success": "end"}, "code": "START", "id": "start",
             "inputs": [], "type": "START"},
            {"metadata": {"description": "End of data pipeline", "name": "End"},
             "outcomes": {}, "code": "END", "id": "end", "inputs": [], "type": "END"}
        ],
        "rootNode": "start",
        "variables": [],
        "errorHandlers": [{"type": "EMAIL", "inputs": [
            {"name": "toList", "type": "string", "value": ""},
            {"name": "ccList", "type": "string", "value": ""},
            {"name": "subject", "type": "string", "value": ""},
            {"name": "body", "type": "string", "value": ""}]}]
    },
    "allowAllEmployeeAccess": False,
    "jsonSchemaName": "Workflow.spec",
    "jsonSchemaVersion": "1",
    "inputs": [],
    "outputSpecification": " ",
    "agentsValueMappings": [],
    "modelConfiguration": None,
    "defaultModelConfiguration": "ORA_LLM_PREMIUM",
    "humanApprovalFlag": False,
    "waitFlag": False,
    "triggers": [{"type": "REST", "inputs": []}],
    "costSavings": 0,
    "timeSavings": 10,
    "chatExpTPFileUploadEnabledFlag": False,
    "chatExpThirdPartyDetails": [],
    "policyIds": []
}


def agent(code, name, description, agent_type, product, role, tools):
    return {
        "Specification": {
            "jsonSchemaName": "Agent.spec",
            "jsonSchemaVersion": "1",
            "inputs": [],
            "outputSpecification": " " if agent_type == "SUPERVISOR" else "",
            "summarizationMode": "Custom",
            "agentRole": role,
            "summarizationPrompt": SUMMARIZATION
        },
        "AgentCode": code,
        "Name": name,
        "Description": description,
        "Family": "HCM",
        "Product": product,
        "ModuleId": None,
        "Namespace": f"HCM.{product}",
        "SeededFlag": False,
        "PromptCode": None,
        "Version": 1,
        "MaximumInteractions": 20,
        "AgentType": agent_type,
        "Prompt": None,
        "ModelConfigId": None,
        "ReusableFlag": False,
        "tools": tools,
        "topics": []
    }


export = {
    "Specification": TEAM_SPEC,
    "WorkflowCode": WORKFLOW_CODE,
    "Name": "AI_AGENT_HDL",
    "Description": ("Assistant de chargement en masse HCM Data Loader. Prepare le plan de "
                    "chargement, controle les colonnes attendues et explique les rejets. "
                    "Ne declenche aucun chargement."),
    "Family": "HCM",
    "Product": "WORKFORCE_DIR_MGMT",
    "HiddenFlag": False,
    "AiAppsCompatibleFlag": False,
    "UseCaseId": "NA",
    "SourceWorkflowId": None,
    "AccessModifier": "public",
    "StartQuestionOne": "Quelles colonnes faut-il pour charger des sites (Location) ?",
    "StartQuestionTwo": "J'ai un fichier de sites a charger, par ou commencer ?",
    "StartQuestionThree": "Que signifie l'erreur unique reference to the record ?",
    "FollowUpPromptEnabledFlag": True,
    "FollowUpPrompt": FOLLOW_UP,
    "Architecture": "group",
    "MaximumInteractions": 30,
    "StartAgentId": None,
    "agents": [
        agent(SUPERVISOR, "AI Agent HDL Supervisor",
              "Single point of entry for a user preparing an HCM Data Loader bulk load.",
              "SUPERVISOR", "WORKFORCE_DIR_MGMT", SUPERVISOR_ROLE, []),
        agent(WORKER, "HDL Loader Analyst AgentHDL",
              ("Prepares and checks HCM Data Loader files: expected columns of a business "
               "object, instructions, unique reference keys, effective dates, and the "
               "meaning of rejection messages."),
              "WORKER", "GLOBAL_HUMAN_RESOURCES", WORKER_ROLE, [USER_SESSION_TOOL])
    ],
    "agentMappings": [
        {"EdgeOrder": 0, "AgentCode": SUPERVISOR, "AgentTargetCode": SUPERVISOR},
        {"EdgeOrder": 0, "AgentCode": SUPERVISOR, "AgentTargetCode": WORKER}
    ],
    "partnerMetadata": {"Description": "", "Name": ""}
}

# ---------------------------------------------------------------- controles
FORBIDDEN = {' ': 'espace insecable', '—': 'tiret cadratin',
             '–': 'tiret demi-cadratin', '“': 'guillemet courbe ouvrant',
             '”': 'guillemet courbe fermant', '’': 'apostrophe courbe',
             '‘': 'apostrophe courbe'}

LIMIT = 4000
SAFE = 3400  # marge : une version a 4023 octets a deja ete refusee

failures = []
for a in export['agents']:
    for field in ('agentRole', 'summarizationPrompt'):
        size = len(a['Specification'][field].encode('utf-8'))
        flag = 'OK' if size <= SAFE else ('LIMITE' if size <= LIMIT else 'TROP LONG')
        print(f"{a['AgentCode']:32s} {field:22s} {size:5d} octets  {flag}")
        if size > SAFE:
            failures.append(f"{a['AgentCode']}.{field} = {size} octets")

for field in ('FollowUpPrompt', 'Description'):
    size = len(export[field].encode('utf-8'))
    print(f"{'(equipe)':32s} {field:22s} {size:5d} octets  "
          f"{'OK' if size <= SAFE else 'TROP LONG'}")
    if size > SAFE:
        failures.append(f"{field} = {size} octets")

raw = json.dumps(export, ensure_ascii=False, indent=2)
found = {c: FORBIDDEN[c] for c in set(raw) if c in FORBIDDEN}
if found:
    failures.append(f"caracteres proscrits: {found}")
print('caracteres non ASCII utilises:', sorted({c for c in raw if ord(c) > 127}))

if failures:
    print('\nECHEC:')
    for f in failures:
        print(' -', f)
    sys.exit(1)

out = sys.argv[1]
with open(out, 'w', encoding='utf-8') as fh:
    fh.write(raw)
    fh.write('\n')
print('\nEcrit:', out)
