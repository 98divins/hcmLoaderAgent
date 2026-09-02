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

  // Taille couverte pour l'instant. Au-dela, la preparation reste possible mais
  // le chargement devra etre decoupe : on le dit plutot que de tronquer en
  // silence, un fichier ampute sans le dire serait charge incomplet.
  const ROW_LIMIT = 50;

  class importFileChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Array} params.files
     */
    async run(context, { files } = {}) {
      const { $variables } = context;
      const file = files && files[0];
      if (!file) { return; }

      $variables.errorText = '';

      let text;
      try {
        text = await readFileAsText(file);
      } catch (error) {
        $variables.errorText = 'Le fichier n\'a pas pu etre lu.';
        return;
      }

      // Le BOM d'un export Excel se colle au premier nom de colonne et le rend
      // meconnaissable : il faut le retirer avant tout decoupage.
      const clean = text.replace(/^﻿/, '');
      const lines = clean.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');

      if (lines.length < 2) {
        $variables.errorText = 'Le fichier doit contenir une ligne d\'en-tete '
          + 'puis au moins une ligne de donnees.';
        return;
      }

      const separator = detectSeparator(lines[0]);
      // Un fichier reimporte apres export porte les colonnes de service de la
      // page. Les garder les ferait passer pour des attributs de l'objet metier
      // et le chargement les rejetterait.
      const META_COLUMNS = ['Etat', 'Anomalie', 'Rapprochement', 'rowKey', 'statusLabel', 'matchLabel'];
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
        const row = { rowKey: `L${i}`, statusLabel: 'a controler' };
        headers.forEach((header, position) => {
          const value = values[keptIndexes[position]];
          row[header] = value === undefined ? '' : value;
        });
        rows.push(row);
      }

      // Les donnees vont dans la feuille selectionnee : un dossier porte
      // plusieurs objets, et c'est le rail qui dit lequel on alimente.
      const sheets = ($variables.sheets || []).slice();
      const index = $variables.activeSheet || 0;
      if (!sheets[index]) {
        $variables.errorText = 'Choisissez d\'abord un objet et ouvrez un dossier.';
        return;
      }

      const plural = rows.length > 1 ? 's' : '';
      sheets[index] = Object.assign({}, sheets[index], {
        columns: headers,
        rows,
        countIssues: 0,
        countWarnings: 0,
        fileName: `${file.name} - ${rows.length} ligne${plural} - separateur "${separator}"`,
        statusLabel: `${rows.length} ligne${plural} - a controler`
      });
      $variables.sheets = sheets;

      const total = sheets.reduce((sum, sheet) => sum + (sheet.rows || []).length, 0);
      $variables.countTotal = total;
      $variables.countIssues = 0;
      $variables.summaryText = `${sheets[index].label} : ${rows.length} ligne${plural} `
        + `importee${plural}`;
      $variables.errorText = total > ROW_LIMIT
        ? `${total} lignes dans le dossier. Le chargement est limite a ${ROW_LIMIT} lignes `
          + 'pour le moment : preparez votre dossier, mais decoupez avant de charger.'
        : '';
      $variables.step = 'data';
    }
  }

  return importFileChain;
});
