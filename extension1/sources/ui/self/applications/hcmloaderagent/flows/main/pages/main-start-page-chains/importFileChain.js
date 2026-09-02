define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Decoupe une ligne CSV en respectant les guillemets et les doubles
   * guillemets d'echappement. Un separateur a l'interieur d'un champ cite ne
   * coupe pas : c'est le cas des adresses, qui contiennent des virgules.
   */
  function parseCsvLine(line, separator) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; } else { inQuotes = !inQuotes; }
      } else if (char === separator && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map((v) => unwrapText(v.trim()));
  }

  /**
   * Le separateur n'est pas demande a l'utilisateur : on retient celui qui
   * decoupe l'en-tete en le plus grand nombre de colonnes. Un export Excel
   * francais sort en point-virgule, un export anglo-saxon en virgule.
   */
  function detectSeparator(headerLine) {
    let best = ',';
    let bestCount = 0;
    [';', ',', '\t', '|'].forEach((candidate) => {
      const count = parseCsvLine(headerLine, candidate).length;
      if (count > bestCount) { bestCount = count; best = candidate; }
    });
    return best;
  }

  /**
   * Retire l'enveloppe ="valeur" posee a l'export pour empecher Excel de
   * convertir les codes et les dates. Un tableur qui resout la formule et
   * reecrit la valeur nue reste accepte : les deux formes passent.
   */
  function unwrapText(value) {
    const match = /^="(.*)"$/.exec(value);
    return match ? match[1].replace(/""/g, '"') : value;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  // Un fichier reimporte apres export porte les colonnes de service de la
  // page. Les garder les ferait passer pour des attributs de l'objet metier
  // et le chargement les rejetterait.
  const META_COLUMNS = ['Etat', 'Detail', 'Anomalie', 'Rapprochement', 'rowKey',
    'statusLabel', 'statusDetail', 'matchLabel'];

  // Taille couverte pour l'instant. Au-dela, la preparation reste possible mais
  // le chargement devra etre decoupe : on le dit plutot que de tronquer en
  // silence, un fichier ampute sans le dire serait charge incomplet.
  const ROW_LIMIT = 50;

  function isFlexColumn(spec, name) {
    const flex = spec.flexfield;
    if (!flex || !flex.code) { return false; }
    if (name === `FLEX:${flex.code}`) { return true; }
    if (flex.support === 'EFF' && name === 'EFF_CATEGORY_CODE') { return true; }
    return new RegExp(`^[A-Za-z0-9_]+\\(${flex.code}=[^)]+\\)$`).test(name);
  }

  /**
   * Reconnait l'objet d'un fichier a ses colonnes.
   *
   * L'utilisateur n'a pas a dire de quel objet parle son fichier : on le lit
   * dans l'en-tete. Chaque objet de la hierarchie est note sur le nombre de
   * colonnes qu'il reconnait, et sur le nombre de colonnes de sa cle
   * utilisateur presentes. Sans colonne de cle, la reconnaissance est refusee :
   * un fichier qu'on ne sait pas identifier ne s'attribue pas au hasard.
   */
  function detectObject(catalog, hierarchy, operation, headers) {
    const tree = (catalog.hierarchies || {})[hierarchy];
    if (!tree) { return { object: null, candidates: [] }; }
    const candidates = [tree.top].concat(tree.children || [])
      .map((name) => {
        const spec = (catalog.objects || {})[name];
        if (!spec || (spec.validOperations || []).indexOf(operation) === -1) { return null; }
        const known = {};
        (spec.attributes || []).forEach((attribute) => { known[attribute.name] = true; });
        const hits = headers.filter((h) => known[h] || isFlexColumn(spec, h)).length;
        const keyHits = (spec.userKey || []).filter((k) => headers.indexOf(k) !== -1).length;
        return { name, label: spec.uiName || name, hits, keyHits, keySize: (spec.userKey || []).length };
      })
      .filter((c) => c);

    candidates.sort((a, b) => (b.keyHits - a.keyHits) || (b.hits - a.hits));
    const best = candidates[0];
    // Une colonne de cle partagee ne suffit pas : un fichier d'organisations
    // porte LocationCode sans etre un fichier de sites. L'objet retenu doit
    // reconnaitre la nette majorite des colonnes du fichier.
    const ratio = best && headers.length ? best.hits / headers.length : 0;
    if (!best || best.keyHits === 0 || best.hits < 2 || ratio < 0.6) {
      return { object: null, candidates };
    }
    // Deux objets a egalite parfaite : on ne tranche pas a leur place.
    const second = candidates[1];
    if (second && second.keyHits === best.keyHits && second.hits === best.hits) {
      return { object: null, candidates, ambiguous: [best.label, second.label] };
    }
    return { object: best.name, label: best.label, candidates };
  }

  function parseCsv(text) {
    // Le BOM d'un export Excel se colle au premier nom de colonne et le rend
    // meconnaissable : il faut le retirer avant tout decoupage.
    const clean = text.replace(/^﻿/, '');
    const lines = clean.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
    if (lines.length < 2) { return null; }

    const separator = detectSeparator(lines[0]);
    const allHeaders = parseCsvLine(lines[0], separator);
    const keptIndexes = [];
    const headers = [];
    allHeaders.forEach((name, index) => {
      if (name === '' || META_COLUMNS.indexOf(name) !== -1) { return; }
      keptIndexes.push(index);
      headers.push(name);
    });

    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
      const values = parseCsvLine(lines[i], separator);
      const row = { rowKey: `L${i}`, statusLabel: 'a controler', statusDetail: '', matchLabel: '' };
      headers.forEach((header, position) => {
        const value = values[keptIndexes[position]];
        row[header] = value === undefined ? '' : value;
      });
      rows.push(row);
    }
    return { headers, rows, separator };
  }

  class importFileChain extends ActionChain {

    /**
     * Un ou plusieurs fichiers, deposes ensemble ou l'un apres l'autre. Chacun
     * est reconnu a ses colonnes et cree, ou remplace, la feuille de son objet.
     *
     * @param {Object} context
     * @param {Object} params
     * @param {Array} params.files
     */
    async run(context, { files } = {}) {
      const { $variables } = context;
      const list = Array.prototype.slice.call(files || []);
      if (!list.length || !$variables.opened) { return; }

      const catalog = $variables.objectCatalog || {};
      const hierarchy = $variables.hierarchy;
      const operation = $variables.operation || 'MERGE';
      const problems = [];
      const accepted = [];
      let sheets = ($variables.sheets || []).slice();
      let lastIndex = $variables.activeSheet || 0;

      for (let f = 0; f < list.length; f += 1) {
        const file = list[f];
        let text;
        try {
          // eslint-disable-next-line no-await-in-loop
          text = await readFileAsText(file);
        } catch (error) {
          problems.push(`${file.name} : le fichier n'a pas pu etre lu.`);
          // eslint-disable-next-line no-continue
          continue;
        }

        const parsed = parseCsv(text);
        if (!parsed) {
          problems.push(`${file.name} : il faut une ligne d'en-tete puis au moins une ligne de donnees.`);
          // eslint-disable-next-line no-continue
          continue;
        }

        const detected = detectObject(catalog, hierarchy, operation, parsed.headers);
        if (!detected.object) {
          const names = detected.candidates.map((c) => c.label).join(', ');
          problems.push(detected.ambiguous
            ? `${file.name} : les colonnes correspondent autant a ${detected.ambiguous.join(' qu\'a ')}. `
              + 'Ajoutez une colonne propre a l\'objet vise.'
            : `${file.name} : aucun objet de ${hierarchy} ne reconnait ces colonnes `
              + `(${parsed.headers.slice(0, 6).join(', ')}${parsed.headers.length > 6 ? ', ...' : ''}). `
              + `Objets possibles : ${names}. Il faut au moins les colonnes de cle de l'objet.`);
          // eslint-disable-next-line no-continue
          continue;
        }

        const spec = catalog.objects[detected.object];
        const plural = parsed.rows.length > 1 ? 's' : '';
        const sheet = {
          object: detected.object,
          label: spec.uiName || detected.object,
          level: spec.level,
          columns: parsed.headers,
          rows: parsed.rows,
          countIssues: 0,
          countWarnings: 0,
          fileName: `${file.name} - ${parsed.rows.length} ligne${plural}`,
          statusLabel: `${parsed.rows.length} ligne${plural} - a controler`
        };

        const existing = sheets.map((s) => s.object).indexOf(detected.object);
        if (existing !== -1) {
          sheets[existing] = sheet;
          lastIndex = existing;
        } else {
          sheets.push(sheet);
          lastIndex = sheets.length - 1;
        }
        accepted.push(`${file.name} : ${sheet.label}, ${parsed.rows.length} ligne${plural}`);
      }

      // Le parent d'abord, puis les enfants : c'est l'ordre dans lequel HDL
      // traite le fichier, et celui dans lequel on veut les lire.
      const lastObject = sheets[lastIndex] ? sheets[lastIndex].object : null;
      sheets.sort((a, b) => (a.level === 'top' ? 0 : 1) - (b.level === 'top' ? 0 : 1));
      $variables.sheets = sheets;
      $variables.activeSheet = lastObject ? sheets.map((s) => s.object).indexOf(lastObject) : 0;
      $variables.armedAction = '';
      $variables.checkSummary = {};

      const total = sheets.reduce((sum, s) => sum + (s.rows || []).length, 0);
      $variables.countTotal = total;
      $variables.countIssues = 0;
      // Le dossier a change : ce qui avait ete controle ne l'est plus.
      $variables.step = 'data';
      $variables.summaryText = accepted.join(' ; ');

      const limit = total > ROW_LIMIT
        ? `${total} lignes dans le dossier. Le chargement est limite a ${ROW_LIMIT} lignes `
          + 'pour le moment : preparez votre dossier, mais decoupez avant de charger.'
        : '';
      $variables.errorText = problems.concat(limit ? [limit] : []).join(' ');
    }
  }

  return importFileChain;
});
