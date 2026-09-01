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
    return values.map((v) => v.trim());
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

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

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
      const headers = parseCsvLine(lines[0], separator).filter((h) => h !== '');

      const rows = [];
      for (let i = 1; i < lines.length; i += 1) {
        const values = parseCsvLine(lines[i], separator);
        const row = { rowKey: `L${i}`, statusLabel: 'a controler' };
        headers.forEach((header, index) => {
          row[header] = values[index] === undefined ? '' : values[index];
        });
        rows.push(row);
      }

      $variables.columns = headers;
      $variables.rows = rows;
      const plural = rows.length > 1 ? 's' : '';
      $variables.fileName = `${file.name} · ${rows.length} ligne${plural} · separateur "${separator}"`;
      $variables.countTotal = rows.length;
      $variables.countIssues = 0;
      $variables.summaryText = `${rows.length} ligne${plural} importee${plural}`;
      $variables.step = 'data';
    }
  }

  return importFileChain;
});
