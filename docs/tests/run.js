#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * Tests hors navigateur de la page de chargement.
 *
 * Visual Builder ne s'execute pas ici : les chaines d'action sont chargees avec
 * un `define` minimal et un `callRest` simule, puis exercees sur les jeux d'essai
 * du depot. Ce que ce fichier prouve :
 *   - les deux fabriques du .dat (telechargement et soumission) sont identiques,
 *     texte pour texte ;
 *   - le controle produit les etats attendus sur les jeux d'essai ;
 *   - rien ne sort sans un controle complet et propre ;
 *   - le rattachement par cle source n'est ecrit que si le parent est dans le
 *     dossier ;
 *   - une suppression ne reclame pas les attributs d'une creation.
 *
 * Usage : node docs/tests/run.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'extension1/sources/ui/self/applications/hcmloaderagent/flows/main/pages');
const CHAINS = path.join(PAGE, 'main-start-page-chains');
const SAMPLES = path.join(ROOT, 'docs/samples');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/metadata/objectCatalog.page.json'), 'utf8'));

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'ECHEC'} ${label}${ok || !detail ? '' : ` -> ${detail}`}`);
  if (!ok) { failures += 1; }
}

// --- chargement d'une chaine avec un REST simule --------------------------------
let restStub = async () => { throw new Error('hors ligne'); };
function load(file) {
  let out;
  const define = (deps, factory) => {
    out = factory(class ActionChain {}, { callRest: (ctx, opts) => restStub(opts) });
  };
  new Function('define', fs.readFileSync(path.join(CHAINS, file), 'utf8'))(define);
  return out;
}

// Le navigateur n'est pas la : on capture ce que le telechargement produirait.
const blobs = [];
global.Blob = function Blob(parts) { blobs.push(parts[0]); };
global.URL = { createObjectURL: () => 'blob:', revokeObjectURL() {} };
global.document = { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } };
global.setTimeout = (fn) => fn();

const Check = load('checkPlanChain.js');
const Download = load('downloadDatChain.js');
const Start = load('startDossierChain.js');

function readCsv(file) {
  const text = fs.readFileSync(path.join(SAMPLES, file), 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r\n|\n/).filter((l) => l.trim());
  const columns = lines[0].split(';');
  const rows = lines.slice(1).map((line, i) => {
    const values = line.split(';');
    const row = { rowKey: `L${i + 1}`, statusLabel: 'a controler', statusDetail: '', matchLabel: '' };
    columns.forEach((c, j) => { row[c] = values[j] === undefined ? '' : values[j]; });
    return row;
  });
  return { columns, rows };
}

function sheet(object, file) {
  const spec = catalog.objects[object];
  const data = readCsv(file);
  return Object.assign({ object, label: spec.uiName, level: spec.level, fileName: file,
    countIssues: 0, countWarnings: 0, statusLabel: '' }, data);
}

function vars(hierarchy, operation, sheets) {
  return { objectCatalog: catalog, hierarchy, operation, sheets, activeSheet: 0,
    countIssues: 0, countTotal: 0, step: 'data', lookupValues: {}, checkSummary: {},
    armedAction: '', isChecking: false };
}

async function main() {
  // 1. Les deux fabriques du .dat sont le meme texte.
  const extract = (file) => {
    const src = fs.readFileSync(path.join(CHAINS, file), 'utf8');
    const start = src.indexOf('  /** Une cle source doit survivre');
    const tail = "    return lines.join('\\r\\n') + '\\r\\n';\n  }\n";
    const end = src.indexOf(tail, start) + tail.length;
    return src.slice(start, end);
  };
  check('fabriques du .dat identiques (download vs submit)',
    extract('downloadDatChain.js') === extract('submitLoadChain.js'));

  // 2. Jeu d'essai Location + adresses.
  restStub = async (opts) => {
    const m = /IN \((.+)\)/.exec(opts.uriParams.q);
    const asked = m ? m[1].split(',').map((s) => s.replace(/'/g, '')) : [];
    const known = ['PAR01', 'NCE01'];
    return { body: { items: asked.filter((v) => known.indexOf(v) !== -1)
      .map((v) => ({ LocationCode: v })) } };
  };
  let v = vars('Location', 'MERGE', [sheet('Location', 'Location.csv'),
    sheet('LocationOtherAddress', 'LocationOtherAddress.csv')]);
  await new Download().run({ $variables: v }, {});
  check('telechargement refuse avant controle', blobs.length === 0 && /Controlez/.test(v.errorText));

  await new Check().run({ $variables: v }, { ask: false });
  const loc = v.sheets[0].rows;
  const adr = v.sheets[1].rows;
  check('doublon de cle detecte (L1, L5)', loc[0].statusLabel === 'erreur' && loc[4].statusLabel === 'erreur'
    && /double/.test(loc[0].statusDetail));
  check('date jj/mm/aaaa refusee (L3)', /aaaa\/mm\/jj/.test(loc[2].statusDetail));
  check('ActiveStatus vide : avertissement seulement (L4)', loc[3].statusLabel === 'a verifier');
  check('rapprochement parent : PAR01 mise a jour, LYO01 creation',
    loc[1].matchLabel === 'creation' && loc[0].matchLabel === 'mise a jour');
  check('adresse L1 : parent cree dans ce dossier', adr[0].matchLabel === 'parent cree dans ce dossier');
  check('adresse L3 NCE01 : parent deja present dans le tenant', adr[2].matchLabel === 'parent deja present dans le tenant');
  check('AddressUsageType vide : cle, donc erreur', adr[0].statusLabel === 'erreur');
  check('corrections automatiques : SetCode, date, ActiveStatus',
    /SetCode = "COMMON"/.test(v.autoFixText) && /2026\/03\/01/.test(v.autoFixText) && /ActiveStatus = "A"/.test(v.autoFixText));
  check('synthese : compteurs de rapprochement', v.checkSummary.match.dossier === 2 && v.checkSummary.match.tenant === 1);
  check('etape review tant qu\'il reste des anomalies', v.step === 'review' && v.countIssues > 0);

  // 3. Fichier produit : feuille mixte -> pas de cle source parent.
  v.step = 'submit'; v.countIssues = 0;
  await new Download().run({ $variables: v }, {});
  const dat = blobs.pop() || '';
  check('un .dat, une METADATA par feuille', (dat.match(/^METADATA\|/gm) || []).length === 2);
  check('feuille mixte : rattachement par cle utilisateur, pas LocationId(SourceSystemId)',
    dat.indexOf('LocationId(SourceSystemId)') === -1 && /SourceSystemId/.test(dat));

  // 4. Tous les enfants dans le dossier -> rattachement par cle source.
  v = vars('Location', 'MERGE', [sheet('Location', 'Location.csv'),
    sheet('LocationOtherAddress', 'LocationOtherAddress.csv')]);
  v.sheets[1].rows = v.sheets[1].rows.slice(0, 2).map((r) => Object.assign(r, { AddressUsageType: 'MAIN' }));
  await new Check().run({ $variables: v }, { ask: false });
  v.step = 'submit'; v.countIssues = 0;
  await new Download().run({ $variables: v }, {});
  const dat2 = blobs.pop() || '';
  check('parents tous dans le dossier : LocationId(SourceSystemId) ecrit',
    /LocationId\(SourceSystemId\)/.test(dat2) && /\|LOCATION_PAR01_COMMON\r\n/.test(dat2));

  // 5. Jeu d'essai Organization.
  restStub = async () => { throw new Error('ressource absente'); };
  v = vars('Organization', 'MERGE', [sheet('Organization', 'Organization.csv'),
    sheet('OrgUnitClassification', 'OrgUnitClassification.csv')]);
  await new Check().run({ $variables: v }, { ask: false });
  const cls = v.sheets[1].rows;
  check('regle conditionnelle SetCode/DEPARTMENT (L2)', /SetCode est obligatoire/.test(cls[1].statusDetail));
  check('CategoryCode vide : avertissement', cls[0].statusLabel === 'a verifier');
  check('parent hors dossier, tenant muet : non verifie', /^non verifie/.test(cls[3].matchLabel));

  // 6. Suppression : pas d'exigence de creation.
  v = vars('Location', 'DELETE', []);
  await new Start().run({ $variables: v });
  check('dossier DELETE Location : premiere feuille = adresse', v.sheets[0].object === 'LocationOtherAddress');
  v.sheets[0] = Object.assign(v.sheets[0], {
    columns: ['AddressUsageType', 'LocationCode', 'LocationSetCode', 'EffectiveStartDate'],
    rows: [{ rowKey: 'L1', AddressUsageType: 'MAIN', LocationCode: 'PAR01', LocationSetCode: 'COMMON',
      EffectiveStartDate: '2026/01/01' }]
  });
  await new Check().run({ $variables: v }, { ask: false });
  check('DELETE : ligne complete pour l\'identification, aucune fausse anomalie',
    v.sheets[0].rows[0].statusLabel === 'ok');

  // 7. Lookup : une valeur hors referentiel bloque, un referentiel illisible ne tranche pas.
  v = vars('Organization', 'MERGE', [sheet('OrgUnitClassification', 'OrgUnitClassification.csv')]);
  v.lookupValues = { ACTIVE_INACTIVE: { ok: true, codes: ['A', 'I'] } };
  v.sheets[0].rows[0].Status = 'ACTIF';
  await new Check().run({ $variables: v }, { ask: false });
  check('valeur hors lookup ACTIVE_INACTIVE refusee', /referentiel ACTIVE_INACTIVE/.test(v.sheets[0].rows[0].statusDetail));
  v.lookupValues = { ACTIVE_INACTIVE: { ok: false } };
  await new Check().run({ $variables: v }, { ask: false });
  check('lookup illisible : note de feuille, pas d\'erreur',
    !/referentiel ACTIVE_INACTIVE/.test(v.sheets[0].rows[0].statusDetail)
    && v.checkSummary.sheets[0].notes.some((n) => /ACTIVE_INACTIVE non lisible/.test(n)));

  console.log(failures ? `\n${failures} echec(s)` : '\ntous les tests passent');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
