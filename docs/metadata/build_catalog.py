#!/usr/bin/env python3
"""Construit le catalogue des business objects HDL a partir des exports Oracle.

Sources (docs/metadata/sources/) :
  attributes_<Objet>.csv  export "Attribute" de Data Exchange > View Business Objects
  flex_<Objet>.csv        export "Flexfield Attributes" du meme ecran
  template_<Hierarchie>.dat  modele .dat telecharge depuis le meme ecran
  audit_AuditReport_*.txt    onglet "Audit Report" du meme ecran

Sorties (docs/metadata/) :
  businessObjects.json    catalogue compact, destine a la variable de page objectCatalog
  flexfields.json         segments flexfield, charges a la demande (trop volumineux pour la page)

Le script refuse d'ecrire si une regle declaree ici n'est pas confirmee par les
exports : toute divergence entre ce fichier et la source est une erreur, pas un
avertissement. Ce que les exports ne disent pas n'est pas invente ici.
"""

import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'sources')

# ---------------------------------------------------------------------------
# Faits releves dans les Audit Reports et les en-tetes d'ecran.
# Chacun est verifie contre la source par check_against_audit() plus bas.
# ---------------------------------------------------------------------------

KEY_TYPES = {
    'Surrogate ID': 'surrogateId',
    'Parent Surrogate ID': 'parentSurrogateId',
    'User Key': 'userKey',
    'Source Key': 'sourceKey',
    'Foreign Object Reference': 'foreignObjectReference',
    'Globally Unique ID': 'guid',
}

REQUIRED = {
    'Yes': 'always',
    'No': 'no',
    'For new records': 'forNewRecords',
}

OBJECTS = {
    'Location': {
        'uiName': 'Location',
        'hierarchy': 'Location',
        'level': 'top',
        'integrationObject': 'Location',
        'validOperations': ['MERGE'],
        'dateType': 'dateEffective',
        'requiredForNewRecords': True,
        'userKey': ['LocationCode', 'SetCode'],
        'flexfield': {'support': 'DFF', 'code': 'PER_LOCATIONS_DF'},
        'translationObject': 'LocationTranslation',
    },
    'LocationOtherAddress': {
        'uiName': 'Location Other Address',
        'hierarchy': 'Location',
        'level': 2,
        'integrationObject': 'LocationAddressUsage',
        'validOperations': ['MERGE', 'DELETE'],
        'dateType': 'dateEffective',
        'requiredForNewRecords': False,
        'userKey': ['AddressUsageType', 'LocationCode', 'LocationSetCode'],
        'parent': {
            'object': 'Location',
            'column': 'LocationId',
            'userKey': ['LocationCode', 'LocationSetCode'],
        },
        'flexfield': None,
    },
    'LocationLegislative': {
        'uiName': 'Location Legislative Extra Information',
        'hierarchy': 'Location',
        'level': 2,
        'integrationObject': 'LocationLegislativeEFF',
        'validOperations': ['MERGE', 'DELETE'],
        'dateType': 'dateEffective',
        'requiredForNewRecords': False,
        'userKey': ['SequenceNumber', 'LleInformationCategory', 'LocationCode', 'SetCode'],
        'parent': {
            'object': 'Location',
            'column': 'LocationId',
            'userKey': ['LocationCode', 'SetCode'],
        },
        'flexfield': {
            'support': 'EFF',
            'code': 'PER_LOCATION_LEG_EFF',
            'categoryCode': 'HcmLocationsLegislativeCategory',
            'contextColumn': 'LleInformationCategory',
        },
    },
    'LocationExtraInfo': {
        'uiName': 'Location Extra Information',
        'hierarchy': 'Location',
        'level': 2,
        'integrationObject': 'LocationExtraInfoEFF',
        'validOperations': ['MERGE', 'DELETE'],
        'dateType': 'dateEffective',
        'requiredForNewRecords': False,
        'userKey': ['SequenceNumber', 'LeiInformationCategory', 'LocationCode', 'SetCode'],
        'parent': {
            'object': 'Location',
            'column': 'LocationId',
            'userKey': ['LocationCode', 'SetCode'],
        },
        'flexfield': {
            'support': 'EFF',
            'code': 'PER_LOCATION_INFORMATION_EFF',
            'categoryCode': 'HcmLocationsCategory',
            'contextColumn': 'InformationType',
        },
    },
    'Organization': {
        'uiName': 'Organization',
        'hierarchy': 'Organization',
        'level': 'top',
        'integrationObject': 'Organization',
        'validOperations': ['MERGE'],
        'dateType': 'dateEffective',
        'requiredForNewRecords': True,
        'userKey': ['Name', 'ClassificationName'],
        'flexfield': None,
        'translationObject': 'OrganizationTranslation',
    },
    'OrgUnitClassification': {
        'uiName': 'Organization Classification',
        'hierarchy': 'Organization',
        'level': 2,
        'integrationObject': 'OrganizationClassification',
        'validOperations': ['MERGE'],
        'dateType': 'dateEffective',
        'requiredForNewRecords': True,
        'userKey': ['OrganizationName', 'ClassificationName'],
        'parent': {
            'object': 'Organization',
            'column': 'OrganizationId',
            'userKey': ['OrganizationName', 'ClassificationName'],
        },
        'flexfield': None,
    },
    'OrgInformation': {
        'uiName': 'Organization Extra Information',
        'hierarchy': 'Organization',
        'level': 2,
        'integrationObject': 'OrgInformationEFF',
        'validOperations': ['MERGE', 'DELETE'],
        'dateType': 'dateEffective',
        'requiredForNewRecords': False,
        'userKey': ['OrganizationName', 'ClassificationName', 'OrgInformationContext', 'SequenceNumber'],
        'parent': {
            'object': 'Organization',
            'column': 'OrganizationId',
            'userKey': ['OrganizationName', 'ClassificationName'],
        },
        'flexfield': {
            'support': 'EFF',
            'code': 'PER_ORGANIZATION_INFORMATION_EFF',
            'categoryCode': None,  # les libelles de l'export ne sont pas des codes : non etabli
            'contextColumn': 'OrgInformationContext',
        },
    },
}

# Une colonne "Foreign Object Reference" porte un identifiant interne que
# personne ne saisit ; Oracle accepte a la place la cle utilisateur de l'objet
# reference. Les couples sont declares ici et confrontes a la section
# "References to Integration Enabled Foreign Objects" de l'audit report.
FOREIGN_USER_KEYS = {
    'Location': {
        'SetId': ['SetCode'],
        'ShipToLocationId': ['ShipToLocationCode', 'ShipToLocationSetCode'],
        'InventoryOrganizationId': ['InventoryOrganizationName'],
        'GeoHierarchyNodeId': ['GeoHierarchyNodeCode'],
        'DesignatedReceiverId': ['DesignatedPersonNumber'],
    },
    'LocationOtherAddress': {},
    'LocationLegislative': {'SetId': ['SetCode']},
    'LocationExtraInfo': {'SetId': ['SetCode']},
    'Organization': {
        'LocationId': ['LocationCode', 'LocationSetCode'],
        'EstablishmentId': ['EstablishmentName'],
        'ClassificationCode': ['ClassificationName'],
    },
    'OrgUnitClassification': {'ClassificationCode': ['ClassificationName']},
    'OrgInformation': {'ClassificationCode': ['ClassificationName']},
}

HIERARCHIES = {
    'Location': {
        'top': 'Location',
        'file': 'Location.dat',
        'children': ['LocationOtherAddress', 'LocationLegislative', 'LocationExtraInfo'],
    },
    'Organization': {
        'top': 'Organization',
        'file': 'Organization.dat',
        'children': ['OrgUnitClassification', 'OrgInformation'],
    },
}

# Regles que les metadonnees enoncent en prose et qu'aucune colonne ne porte.
# Chacune cite la phrase source pour qu'on puisse la contester.
CONDITIONAL_RULES = {
    'OrgUnitClassification': [
        {
            'column': 'SetCode',
            'requiredWhen': {'column': 'ClassificationCode', 'equals': 'DEPARTMENT'},
            'forbiddenWhen': {'column': 'ClassificationCode', 'notEquals': 'DEPARTMENT'},
            'severity': 'error',
            'source': 'Mandatory for department classifications. Do not supply for other '
                      'classification types.',
        },
    ],
    'LocationOtherAddress': [
        {
            'column': 'PostalCode',
            'dependsOnCountry': True,
            'severity': 'warning',
            'source': 'This value may be mandatory depending upon the country.',
        },
        {
            'column': 'Region1',
            'dependsOnCountry': True,
            'severity': 'warning',
            'source': 'This value may be mandatory depending upon the country.',
        },
        {
            'column': 'TownOrCity',
            'dependsOnCountry': True,
            'severity': 'warning',
            'source': 'This value may be mandatory depending upon the country.',
        },
    ],
}

# Colonnes declarees obligatoires par Oracle mais acceptees vides par le tenant.
# Constate en chargement reel, pas deduit. Retrogradees en avertissement.
SOFT_REQUIRED = {
    'Location': ['ActiveStatus'],
    'OrgUnitClassification': ['CategoryCode'],
}

# Le bloc de queue commun a tous les objets : cle source, GUID, references de
# rapprochement. Genere plutot que stocke sept fois.
TAIL_COLUMNS = (
    ['SourceSystemId', 'SourceSystemOwner', 'GUID', 'SourceRefTableName']
    + ['SourceRef%03d' % n for n in range(1, 11)]
)


def read_attributes(obj):
    path = os.path.join(SRC, 'attributes_%s.csv' % obj)
    with open(path, newline='', encoding='utf-8-sig') as fh:
        rows = list(csv.DictReader(fh))
    out = []
    for row in rows:
        name = (row['METADATA Attribute'] or '').strip()
        if not name or name in TAIL_COLUMNS:
            continue
        key_type = (row['Key Type'] or '').strip()
        if key_type and key_type not in KEY_TYPES:
            sys.exit('%s : type de cle inconnu %r' % (obj, key_type))
        required = (row['Required'] or '').strip()
        if required not in REQUIRED:
            sys.exit('%s.%s : valeur Required inconnue %r' % (obj, name, required))
        attr = {
            'name': name,
            'label': (row['Name'] or '').strip(),
            'type': (row['Data Type'] or '').strip().lower(),
            'required': REQUIRED[required],
        }
        if key_type:
            attr['keyType'] = KEY_TYPES[key_type]
        if (row['Integration Object Name'] or '').strip():
            attr['references'] = row['Integration Object Name'].strip()
        if (row['Lookup'] or '').strip():
            attr['lookup'] = row['Lookup'].strip()
        substitutes = FOREIGN_USER_KEYS.get(obj, {}).get(name)
        if substitutes:
            attr['foreignUserKey'] = substitutes
        if name in SOFT_REQUIRED.get(obj, []):
            attr['softRequired'] = True
        out.append(attr)
    return out


def read_flex(obj):
    """Segments flexfield, regroupes par contexte.

    Les exports Location portent des pseudo-colonnes FLEX:/EFF_CATEGORY_CODE,
    ceux d'Organization non : on les ignore partout et on les reinjecte depuis
    la definition de l'objet, pour que le resultat soit uniforme.
    """
    path = os.path.join(SRC, 'flex_%s.csv' % obj)
    if not os.path.exists(path):
        return {}
    with open(path, newline='', encoding='utf-8-sig') as fh:
        rows = list(csv.DictReader(fh))
    contexts = {}
    seen = set()
    for row in rows:
        attr = (row['METADATA Attribute'] or '').strip()
        if not attr or attr.startswith('FLEX:') or attr == 'EFF_CATEGORY_CODE':
            continue
        match = re.match(r'^(.+?)\(([A-Z0-9_]+)=(.+)\)$', attr)
        if not match:
            sys.exit('%s : segment flexfield illisible %r' % (obj, attr))
        _, flex_code, context_code = match.groups()
        expected = OBJECTS[obj]['flexfield']['code']
        if flex_code != expected:
            sys.exit('%s : segment sur le flexfield %s, attendu %s'
                     % (obj, flex_code, expected))
        key = (context_code, attr)
        if key in seen:
            continue
        seen.add(key)
        ctx = contexts.setdefault(context_code, {
            'contextCode': context_code,
            'category': (row['Category'] or '').strip(),
            'label': (row['Context'] or '').strip(),
            'segments': [],
        })
        ctx['segments'].append({
            'column': attr,
            'label': (row['Name'] or '').strip(),
            'required': (row['Required'] or '').strip() == 'Yes',
            'valueSet': (row['Value Set Code'] or '').strip() or None,
            'display': attr.split('(')[0].endswith('_Display'),
        })
    return contexts


def read_template_order(hierarchy):
    """Ordre des colonnes tel qu'Oracle le produit dans le modele .dat."""
    path = os.path.join(SRC, 'template_%s.dat' % hierarchy)
    order = {}
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            parts = line.rstrip('\r\n').split('|')
            if parts and parts[0] == 'METADATA':
                cols = [c.split('=')[0] for c in parts[2:]]
                order[parts[1]] = cols
    return order


def check_against_audit(obj, spec):
    """Confronte les faits declares en tete de fichier a l'Audit Report."""
    hierarchy = spec['hierarchy']
    path = os.path.join(SRC, 'audit_AuditReport_%s_%s.txt' % (hierarchy, obj))
    if not os.path.exists(path):
        return 'pas d\'audit report fourni'
    text = open(path, encoding='utf-8').read()

    def field(label):
        m = re.search(r'^\s*%s\s*:\s*(.+?)\s*$' % re.escape(label), text, re.M)
        return m.group(1).strip() if m else None

    ops = field('VALID_OPERATIONS')
    expected_ops = 'MERGE_DELETE' if 'DELETE' in spec['validOperations'] else 'MERGE'
    if ops != expected_ops:
        sys.exit('%s : VALID_OPERATIONS = %r dans l\'audit, %r declare ici'
                 % (obj, ops, expected_ops))

    io_name = field('Integration Object Name')
    if io_name and io_name != spec['integrationObject']:
        sys.exit('%s : Integration Object = %r dans l\'audit, %r declare ici'
                 % (obj, io_name, spec['integrationObject']))

    m = re.search(r'Local Surrogate ID Analysis.*?\[0\]\s*(.+?)\s*$', text, re.S | re.M)
    if m:
        audit_key = [c.strip() for c in m.group(1).split(',')]
        if sorted(audit_key) != sorted(spec['userKey']):
            sys.exit('%s : user key = %r dans l\'audit, %r declaree ici'
                     % (obj, audit_key, spec['userKey']))

    section = re.search(r'References to Integration Enabled Foreign Objects\n=+\n(.*?)\n\n\n',
                        text, re.S)
    if section:
        for block in re.finditer(r'Attribute Name\s*:\s*(\S+).*?\[0\]\s*(.+?)\s*$',
                                 section.group(1), re.S | re.M):
            attr, keys = block.group(1), [c.strip() for c in block.group(2).split(',')]
            declared = FOREIGN_USER_KEYS.get(obj, {}).get(attr)
            if declared is not None and sorted(declared) != sorted(keys):
                sys.exit('%s.%s : cle utilisateur de reference = %r dans l\'audit, %r ici'
                         % (obj, attr, keys, declared))

    if 'parent' in spec:
        m = re.search(r'Parent Surrogate ID Analysis.*?Attribute Name\s*:\s*(\S+).*?'
                      r'\[0\]\s*(.+?)\s*$', text, re.S | re.M)
        if m:
            col, keys = m.group(1), [c.strip() for c in m.group(2).split(',')]
            if col != spec['parent']['column']:
                sys.exit('%s : colonne parent = %r dans l\'audit, %r declaree ici'
                         % (obj, col, spec['parent']['column']))
            if sorted(keys) != sorted(spec['parent']['userKey']):
                sys.exit('%s : user key parent = %r dans l\'audit, %r declaree ici'
                         % (obj, keys, spec['parent']['userKey']))
    return 'verifie'


def main():
    catalogue = {
        'schemaVersion': 2,
        'source': 'My Client Groups > Data Exchange > View Business Objects (export 2026-09)',
        'keyResolutionOrder': ['guid', 'sourceKey', 'userKey'],
        'parentReferenceModes': ['parentUserKey', 'sourceKey', 'guid'],
        'tailColumns': TAIL_COLUMNS,
        'hierarchies': HIERARCHIES,
        'objects': {},
    }
    flexfields = {'schemaVersion': 2, 'objects': {}}
    report = []

    orders = {h: read_template_order(h) for h in HIERARCHIES}

    for obj, spec in OBJECTS.items():
        status = check_against_audit(obj, spec)
        entry = {k: v for k, v in spec.items() if v is not None}
        entry['attributes'] = read_attributes(obj)
        order = orders[spec['hierarchy']].get(obj)
        if order:
            entry['columnOrder'] = [c for c in order if not c.startswith('_')
                                    and '(' not in c]
        rules = CONDITIONAL_RULES.get(obj)
        if rules:
            entry['conditionalRules'] = rules
        catalogue['objects'][obj] = entry

        contexts = read_flex(obj)
        if contexts:
            flexfields['objects'][obj] = {
                'flexfield': spec['flexfield']['code'],
                'contexts': contexts,
            }
        report.append((obj, len(entry['attributes']), len(contexts), status))

    # Index de ce qu'il faudra aller lire dans le tenant pour valider une saisie.
    # Les deux familles ne s'interrogent pas par la meme API, d'ou la separation.
    lookups = {}
    for obj, entry in catalogue['objects'].items():
        for attr in entry['attributes']:
            if 'lookup' in attr:
                lookups.setdefault(attr['lookup'], []).append('%s.%s' % (obj, attr['name']))
    value_sets = {}
    for obj, entry in flexfields['objects'].items():
        for ctx in entry['contexts'].values():
            for seg in ctx['segments']:
                if seg['valueSet']:
                    value_sets.setdefault(seg['valueSet'], set()).add(obj)
    catalogue['validationSources'] = {
        'lookups': {
            'api': '/hcmRestApi/resources/11.13.18.05/commonLookupsLOV',
            'query': "q=LookupType='<code>'",
            'note': 'un lookup marque REST Access Secured ne sort pas de cette ressource : '
                    'traiter le refus comme "non verifiable", jamais comme "invalide"',
            'codes': {k: sorted(v) for k, v in sorted(lookups.items())},
        },
        'valueSets': {
            'api': '/fscmRestApi/resources/11.13.18.05/valueSets',
            'query': "q=ValueSetCode='<code>' puis /valueSets/{id}/child/values",
            'note': 'l\'acces aux valeurs demande un privilege dedie',
            'codes': {k: sorted(v) for k, v in sorted(value_sets.items())},
        },
    }

    # La page embarque le catalogue dans une variable : on n'y met que ce dont
    # le controle et la fabrication du fichier ont besoin. Les libelles Oracle
    # et l'index des value sets restent dans le catalogue complet.
    KEEP_OBJ = ('uiName', 'hierarchy', 'level', 'validOperations', 'userKey',
                'parent', 'flexfield', 'columnOrder', 'conditionalRules')
    KEEP_ATTR = ('name', 'type', 'required', 'keyType', 'lookup', 'softRequired',
                 'foreignUserKey')
    slim = {
        'keyResolutionOrder': catalogue['keyResolutionOrder'],
        'tailColumns': TAIL_COLUMNS,
        'hierarchies': HIERARCHIES,
        'lookupApi': catalogue['validationSources']['lookups']['api'],
        'objects': {},
    }
    for obj, entry in catalogue['objects'].items():
        out = {k: entry[k] for k in KEEP_OBJ if k in entry}
        out['attributes'] = [
            {k: a[k] for k in KEEP_ATTR if k in a} for a in entry['attributes']
        ]
        slim['objects'][obj] = out

    for path, payload in (('businessObjects.json', catalogue),
                          ('flexfields.json', flexfields),
                          ('objectCatalog.page.json', slim)):
        with open(os.path.join(HERE, path), 'w', encoding='utf-8') as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
            fh.write('\n')

    width = max(len(o) for o, _, _, _ in report)
    for obj, n_attr, n_ctx, status in report:
        print('%-*s  %2d attributs  %3d contextes flex  audit: %s'
              % (width, obj, n_attr, n_ctx, status))
    for path in ('businessObjects.json', 'flexfields.json', 'objectCatalog.page.json'):
        size = os.path.getsize(os.path.join(HERE, path))
        print('%-24s %6.1f Ko' % (path, size / 1024.0))


if __name__ == '__main__':
    main()
