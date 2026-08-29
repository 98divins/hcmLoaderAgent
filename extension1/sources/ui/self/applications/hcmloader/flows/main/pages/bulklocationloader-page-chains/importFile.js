define([
  'vb/action/actionChain',
  'vb/action/actions',
  'vb/action/actionUtils',
], (
  ActionChain,
  Actions,
  ActionUtils
) => {
  'use strict';

  // Alias de colonnes acceptes (francais/anglais) -> champ interne de locationRows.
  const FIELD_ALIASES = {
    locationcode: 'locationCode',
    'code site': 'locationCode',
    name: 'name',
    nom: 'name',
    effectivestartdate: 'effectiveStartDate',
    "date d'effet": 'effectiveStartDate',
    dateeffet: 'effectiveStartDate',
    addressline1: 'addressLine1',
    adresse: 'addressLine1',
    townorcity: 'townOrCity',
    ville: 'townOrCity',
    region1: 'region1',
    region: 'region1',
    postalcode: 'postalCode',
    'code postal': 'postalCode',
    country: 'country',
    pays: 'country'
  };

  // Si l'entete ne correspond a aucun alias connu, on retombe sur cet ordre positionnel.
  const FALLBACK_FIELD_ORDER = [
    'locationCode',
    'name',
    'effectiveStartDate',
    'addressLine1',
    'townOrCity',
    'region1',
    'postalCode',
    'country'
  ];

  function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  function parseCsv(text) {
    const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      return [];
    }

    const headerCells = parseCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
    const resolvedFields = headerCells.map((cell, index) => FIELD_ALIASES[cell] || FALLBACK_FIELD_ORDER[index]);

    return lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      const row = {};
      resolvedFields.forEach((field, index) => {
        if (field) {
          row[field] = (cells[index] || '').trim();
        }
      });
      return row;
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  class importFile extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {object} params.event
     */
    async run(context, { event }) {
      const { $variables } = context;

      const detail = (event && event.detail) || {};
      // eslint-disable-next-line no-console
      console.log('importFile: event.detail =', detail);
      const files = detail.value || detail.files || [];
      const fileList = Array.isArray(files) ? files : Array.from(files || []);
      // eslint-disable-next-line no-console
      console.log('importFile: resolved fileList =', fileList);

      if (fileList.length === 0) {
        // eslint-disable-next-line no-console
        console.log('importFile: no files resolved, aborting');
        return;
      }

      const text = await readFileAsText(fileList[0]);
      $variables.locationRows = parseCsv(text);
    }
  }

  return importFile;
});
