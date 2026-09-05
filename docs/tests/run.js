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
const FLOW = path.join(ROOT, 'extension1/sources/ui/self/applications/hcmloaderagent/flows/main');
const CHAINS = path.join(FLOW, 'main-flow-chains');
const SAMPLES = path.join(ROOT, 'docs/samples');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/metadata/objectCatalog.page.json'), 'utf8'));

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'ECHEC'} ${label}${ok || !detail ? '' : ` -> ${detail}`}`);
  if (!ok) { failures += 1; }
}

// --- chargement d'une chaine avec un REST simule --------------------------------
let restStub = async () => { throw new Error('hors ligne'); };
const navigations = [];
function load(file) {
  let out;
  const define = (deps, factory) => {
    out = factory(class ActionChain {}, {
      callRest: (ctx, opts) => restStub(opts),
      navigateToPage: async (ctx, opts) => { navigations.push(opts.page); }
    });
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
const Import = load('importFileChain.js');
const Status = load('checkLoadStatusChain.js');
const Submit = load('submitLoadChain.js');
const Apply = load('applyProposalChain.js');
const RowEdit = load('rowEditChain.js');
const GoTo = load('goToPageChain.js');
const Guard = load('guardChain.js');

// Un fichier depose, tel que le navigateur le presente : nom et contenu.
global.FileReader = function FileReader() {
  this.readAsText = function (file) { this.result = file.text; this.onload(); };
};
function fakeFile(name) {
  return { name, text: fs.readFileSync(path.join(SAMPLES, name), 'utf8') };
}

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
    armedAction: '', isChecking: false, opened: true, loadSummary: {}, rejects: [] };
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
  check('ActiveStatus vide : note de feuille, pas d\'anomalie de ligne (L4)', loc[3].statusLabel !== 'erreur'
    && v.checkSummary.sheets[0].notes.some((n) => /ActiveStatus vide/.test(n)));
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
    dat.indexOf('LocationId(SourceSystemId)') === -1);

  // 4. Tous les enfants dans le dossier -> rattachement par cle source.
  v = vars('Location', 'MERGE', [sheet('Location', 'Location.csv'),
    sheet('LocationOtherAddress', 'LocationOtherAddress.csv')]);
  v.sheets[1].rows = v.sheets[1].rows.slice(0, 2).map((r) => Object.assign(r, { AddressUsageType: 'MAIN' }));
  await new Check().run({ $variables: v }, { ask: false });
  v.step = 'submit'; v.countIssues = 0;
  await new Download().run({ $variables: v }, {});
  const dat2 = blobs.pop() || '';
  check('sans proprietaire de source enregistre : aucune cle source ecrite',
    dat2.indexOf('SourceSystemOwner') === -1 && dat2.indexOf('LocationId(SourceSystemId)') === -1);
  v.lookupValues = { _sourceOwner: true };
  await new Download().run({ $variables: v }, {});
  const dat3 = blobs.pop() || '';
  check('proprietaire HDLAGENT enregistre et parents dans le dossier : LocationId(SourceSystemId) ecrit',
    /LocationId\(SourceSystemId\)/.test(dat3) && /\|LOCATION_PAR01_COMMON\r\n/.test(dat3));

  // 5. Jeu d'essai Organization.
  restStub = async () => { throw new Error('ressource absente'); };
  v = vars('Organization', 'MERGE', [sheet('Organization', 'Organization.csv'),
    sheet('OrgUnitClassification', 'OrgUnitClassification.csv')]);
  await new Check().run({ $variables: v }, { ask: false });
  const cls = v.sheets[1].rows;
  check('regle conditionnelle SetCode/DEPARTMENT (L2)', /SetCode est obligatoire/.test(cls[1].statusDetail));
  check('CategoryCode vide : note de feuille, pas d\'anomalie de ligne', cls[0].statusLabel !== 'erreur'
    && v.checkSummary.sheets[1].notes.some((n) => /CategoryCode vide/.test(n)));
  check('parent hors dossier, tenant muet : non verifie', /^non verifie/.test(cls[3].matchLabel));

  // 5b. Reference vers un autre objet : un site inconnu du tenant bloque la ligne,
  // avant qu'Oracle ne le dise par "valid value for the LocationId attribute".
  restStub = async (opts) => {
    const m = /IN \((.+)\)/.exec(opts.uriParams.q);
    const asked = m ? m[1].split(',').map((s) => s.replace(/'/g, '')) : [];
    if (/LocationCode/.test(opts.uriParams.q)) {
      return { body: { items: asked.filter((x) => x === 'PAR01').map((x) => ({ LocationCode: x })) } };
    }
    return { body: { items: [] } };
  };
  v = vars('Organization', 'MERGE', [sheet('Organization', 'Organization.csv')]);
  v.sheets[0].rows.forEach((r) => { r.EffectiveStartDate = '2026/01/01'; });
  v.sheets[0].rows[2].LocationCode = 'MAR01';
  await new Check().run({ $variables: v }, { ask: false });
  check('site MAR01 absent du tenant : ligne bloquee avant chargement',
    v.sheets[0].rows[2].statusLabel === 'erreur' && /MAR01 introuvable dans Oracle \(LocationCode\)/.test(v.sheets[0].rows[2].statusDetail));
  check('site PAR01 present : les autres lignes ne sont pas touchees', v.sheets[0].rows[0].statusLabel !== 'erreur');

  // 5c. Une valeur de remplacement de l'assistant n'est jamais ecrite.
  v.hasProposal = true;
  v.proposalJson = JSON.stringify({ display: 'issues', rows: [
    { sheet: 0, rowRef: 'L1', field: 'ClassificationCode', suggestedValue: 'undefined' },
    { sheet: 0, rowRef: 'L2', field: 'ClassificationCode' },
    { sheet: 0, rowRef: 'L3', field: 'LocationCode', suggestedValue: 'PAR01' }] });
  await new Apply().run({ $variables: v }, { source: 'agent' });
  check('"undefined" et valeur absente refusees, valeur reelle appliquee',
    v.sheets[0].rows[0].ClassificationCode === 'DEPARTMENT' && v.sheets[0].rows[1].ClassificationCode === 'DEPARTMENT'
    && v.sheets[0].rows[2].LocationCode === 'PAR01' && /2/.test(v.appliedNote), v.appliedNote);

  // 5d. Edition dans la grille : la ligne repasse "a controler", le dossier revient au controle.
  v.step = 'submit'; v.armedAction = 'load';
  const inputs = [{ getAttribute: () => 'LocationCode', value: 'LYO01' }];
  await new RowEdit().run({ $variables: v }, { event: {
    detail: { rowContext: { item: { metadata: { key: 'L1' } } } },
    target: { querySelectorAll: () => inputs } } });
  check('ligne editee : valeur relue, statut a controler, retour au controle',
    v.sheets[0].rows[0].LocationCode === 'LYO01' && v.sheets[0].rows[0].statusLabel === 'a controler'
    && v.step === 'review' && v.armedAction === '');

  // 6. Import : l'objet de chaque fichier est reconnu a ses colonnes.
  v = vars('Location', 'MERGE', []);
  await new Start().run({ $variables: v });
  check('le dossier s\'ouvre sans feuille', v.opened === true && v.sheets.length === 0);
  await new Import().run({ $variables: v }, { files: [fakeFile('LocationOtherAddress.csv'), fakeFile('Location.csv')] });
  check('deux fichiers deposes ensemble, deux feuilles, parent en premier',
    v.sheets.length === 2 && v.sheets[0].object === 'Location' && v.sheets[1].object === 'LocationOtherAddress');
  await new Import().run({ $variables: v }, { files: [fakeFile('Organization.csv')] });
  check('un fichier d\'une autre hierarchie est refuse avec explication',
    v.sheets.length === 2 && /aucun objet de Location/.test(v.errorText));
  await new Import().run({ $variables: v }, { files: [fakeFile('Location.csv')] });
  check('redeposer un fichier remplace la feuille de son objet', v.sheets.length === 2);

  // 7. Suppression : pas d'exigence de creation.
  v = vars('Location', 'DELETE', []);
  await new Start().run({ $variables: v });
  v.sheets = [{ object: 'LocationOtherAddress', label: 'Location Other Address', level: 2,
    columns: ['AddressUsageType', 'LocationCode', 'LocationSetCode', 'EffectiveStartDate'],
    rows: [{ rowKey: 'L1', AddressUsageType: 'MAIN', LocationCode: 'PAR01', LocationSetCode: 'COMMON',
      EffectiveStartDate: '2026/01/01' }], countIssues: 0, countWarnings: 0 }];
  await new Check().run({ $variables: v }, { ask: false });
  check('DELETE : ligne complete pour l\'identification, aucune fausse anomalie',
    v.sheets[0].rows[0].statusLabel === 'ok');

  // 8. Suivi : un rejet est rattache a sa ligne, les autres sont marquees chargees.
  // Les trois endpoints portent "dataLoadDataSets" : le statut se reconnait a
  // son operation, pas a la ressource.
  restStub = async (opts) => {
    if (/getall_dataLoadDataSets/.test(opts.endpoint)) {
      return { body: { items: [{ DataSetStatusCode: 'ORA_ERROR', DataSetStatusMeaning: 'Error',
        LoadStatusMeaning: 'Error', ImportStatusMeaning: 'Success',
        messages: { items: [{ MessageTypeCode: 'ERROR', FileLine: 4, MessageText: 'The value "à fournir" is invalid for CategoryCode.' }] } }] } };
    }
    if (/uploadFile/.test(opts.endpoint)) { return { body: { result: { ContentId: 'C1' } } }; }
    if (/createFileDataSet/.test(opts.endpoint)) { return { body: { result: { RequestId: 42 } } }; }
    throw new Error('endpoint inattendu ' + opts.endpoint);
  };
  v = vars('Organization', 'MERGE', [sheet('Organization', 'Organization.csv')]);
  v.sheets[0].rows.forEach((r) => { r.EffectiveStartDate = '2026/01/01'; });
  await new Check().run({ $variables: v }, { ask: false });
  v.step = 'submit'; v.countIssues = 0; v.armedAction = 'load';
  await new Submit().run({ $variables: v }, {});
  check('soumission : RequestId retenu et lignes numerotees', v.requestId === '42' && v.sheets[0].rows[1].datLine === 4, v.errorText);
  await new Status().run({ $variables: v }, { auto: false });
  const s0 = v.sheets[0].rows;
  // COMMENT est la ligne 1, METADATA la 2 : la ligne 4 du fichier est la 2e ligne de donnees.
  check('rejet rattache a la 2e ligne (ligne 4 du fichier)', s0[1].statusLabel === 'erreur' && /CategoryCode/.test(s0[1].statusDetail));
  check('les trois autres lignes sont marquees chargees', s0[0].loaded && s0[2].loaded && s0[3].loaded && !s0[1].loaded);
  check('bilan : 3 acceptees, 1 rejetee', v.loadSummary.accepted === 3 && v.loadSummary.rejected === 1);
  check('question a l\'agent en termes metier, sans JSON', /Ressources Humaines/.test(v.question) && v.question.indexOf('{') === -1);
  restStub = async () => ({ body: { items: [{ DataSetStatusCode: 'ORA_IN_PROGRESS', DataSetStatusMeaning: 'In progress',
    ImportStatusMeaning: 'Success', messages: { items: [] } }] } });
  const before = v.sheets[0].rows.map((r) => r.statusLabel).join(',');
  await new Status().run({ $variables: v }, { auto: false });
  check('statut inconnu : le job reste en cours, aucune ligne remarquee',
    v.loadSummary.finished === false && v.sheets[0].rows.map((r) => r.statusLabel).join(',') === before);
  v.step = 'submit'; v.countIssues = 0;
  await new Download().run({ $variables: v }, {});
  const dat4 = blobs.pop() || '';
  check('nouvel envoi : seule la ligne rejetee repart', (dat4.match(/^MERGE\|/gm) || []).length === 1 && /Ressources Humaines/.test(dat4));

  // 9. Lookup : une valeur hors referentiel bloque, un referentiel illisible ne tranche pas.
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

  // 10. Navigation : une page ne s'ouvre que si l'etat le permet.
  v = vars('Location', 'MERGE', []);
  v.opened = false; v.requestId = '';
  await new Guard().run({ $variables: v }, { needs: 'opened' });
  await new GoTo().run({ $variables: v }, { page: 'import', when: 'opened' });
  check('dossier ferme : la garde renvoie a l\'accueil, la navigation refuse',
    navigations.join(',') === 'main-start');
  v.opened = true; v.step = 'review'; v.countIssues = 2;
  await new GoTo().run({ $variables: v }, { page: 'load', when: 'clean' });
  await new Guard().run({ $variables: v }, { needs: 'clean' });
  check('dossier en anomalie : pas de page de chargement, retour au controle',
    navigations.join(',') === 'main-start,dossier-check');
  v.step = 'submit'; v.countIssues = 0;
  await new GoTo().run({ $variables: v }, { page: 'load', when: 'clean' });
  await new Guard().run({ $variables: v }, { needs: 'requestId' });
  v.requestId = '42';
  await new GoTo().run({ $variables: v }, { page: 'track', when: 'requestId' });
  check('dossier propre : chargement ouvert ; suivi seulement avec un RequestId',
    navigations.join(',') === 'main-start,dossier-check,dossier-load,dossier-check,dossier-track');

  // 11. Le chrome Redwood (styles) est le meme texte sur toutes les pages du flux.
  const pages = ['main-start', 'dossier-import', 'dossier-check', 'dossier-load', 'dossier-track'];
  const chrome = (name) => {
    const src = fs.readFileSync(path.join(PAGE, `${name}-page.html`), 'utf8');
    const start = src.indexOf('  /* Chrome commun');
    const end = src.indexOf('  .hdl-subtitle {', start);
    return src.slice(start, end);
  };
  check('chrome commun identique sur les cinq pages',
    pages.every((name) => chrome(name).length > 200 && chrome(name) === chrome(pages[0])));
  const refs = pages.map((name) => JSON.parse(fs.readFileSync(path.join(PAGE, `${name}-page.json`), 'utf8')));
  const chainFiles = fs.readdirSync(CHAINS).map((f) => f.replace(/\.js$/, ''));
  const referenced = [];
  refs.forEach((page) => Object.keys(page.eventListeners).forEach((l) => page.eventListeners[l].chains
    .forEach((c) => referenced.push(c.chain))));
  check('toutes les chaines referencees sont des chaines du flux qui existent',
    referenced.every((c) => /^flow:/.test(c) && chainFiles.indexOf(c.replace('flow:', '')) !== -1));

  console.log(failures ? `\n${failures} echec(s)` : '\ntous les tests passent');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
