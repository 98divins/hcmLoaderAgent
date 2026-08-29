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

  // ---------------------------------------------------------------------
  // Mini-builder de fichier ZIP (methode "stored", sans compression).
  // Valide independamment via Node/unzip/python avant integration ici -
  // voir /scratchpad/zip-test dans la session de dev.
  // ---------------------------------------------------------------------

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function stringToBytes(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i) & 0xFF;
    }
    return bytes;
  }

  function dosDateTime(date) {
    const d = date || new Date();
    const dosTime = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1F);
    const dosDate = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
    return { dosTime, dosDate };
  }

  function writeUint16LE(view, offset, value) {
    view[offset] = value & 0xFF;
    view[offset + 1] = (value >>> 8) & 0xFF;
  }

  function writeUint32LE(view, offset, value) {
    view[offset] = value & 0xFF;
    view[offset + 1] = (value >>> 8) & 0xFF;
    view[offset + 2] = (value >>> 16) & 0xFF;
    view[offset + 3] = (value >>> 24) & 0xFF;
  }

  function concatBytes(arrays) {
    let total = 0;
    arrays.forEach((a) => { total += a.length; });
    const result = new Uint8Array(total);
    let offset = 0;
    arrays.forEach((a) => {
      result.set(a, offset);
      offset += a.length;
    });
    return result;
  }

  function buildZip(fileName, content, date) {
    const nameBytes = stringToBytes(fileName);
    const dataBytes = stringToBytes(content);
    const crc = crc32(dataBytes);
    const { dosTime, dosDate } = dosDateTime(date);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUint32LE(localHeader, 0, 0x04034b50);
    writeUint16LE(localHeader, 4, 20);
    writeUint16LE(localHeader, 6, 0);
    writeUint16LE(localHeader, 8, 0);
    writeUint16LE(localHeader, 10, dosTime);
    writeUint16LE(localHeader, 12, dosDate);
    writeUint32LE(localHeader, 14, crc);
    writeUint32LE(localHeader, 18, size);
    writeUint32LE(localHeader, 22, size);
    writeUint16LE(localHeader, 26, nameBytes.length);
    writeUint16LE(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32LE(centralHeader, 0, 0x02014b50);
    writeUint16LE(centralHeader, 4, 20);
    writeUint16LE(centralHeader, 6, 20);
    writeUint16LE(centralHeader, 8, 0);
    writeUint16LE(centralHeader, 10, 0);
    writeUint16LE(centralHeader, 12, dosTime);
    writeUint16LE(centralHeader, 14, dosDate);
    writeUint32LE(centralHeader, 16, crc);
    writeUint32LE(centralHeader, 20, size);
    writeUint32LE(centralHeader, 24, size);
    writeUint16LE(centralHeader, 28, nameBytes.length);
    writeUint16LE(centralHeader, 30, 0);
    writeUint16LE(centralHeader, 32, 0);
    writeUint16LE(centralHeader, 34, 0);
    writeUint16LE(centralHeader, 36, 0);
    writeUint32LE(centralHeader, 38, 0);
    writeUint32LE(centralHeader, 42, 0);
    centralHeader.set(nameBytes, 46);

    const centralDirOffset = localHeader.length + dataBytes.length;
    const centralDirSize = centralHeader.length;

    const eocd = new Uint8Array(22);
    writeUint32LE(eocd, 0, 0x06054b50);
    writeUint16LE(eocd, 4, 0);
    writeUint16LE(eocd, 6, 0);
    writeUint16LE(eocd, 8, 1);
    writeUint16LE(eocd, 10, 1);
    writeUint32LE(eocd, 12, centralDirSize);
    writeUint32LE(eocd, 16, centralDirOffset);
    writeUint16LE(eocd, 20, 0);

    return concatBytes([localHeader, dataBytes, centralHeader, eocd]);
  }

  function bytesToBase64(bytes) {
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  // ---------------------------------------------------------------------
  // Contenu HDL - noms de colonnes a valider avec les erreurs reelles du
  // job de chargement HDL (l'objet Location peut demander d'autres/moins
  // de colonnes selon la configuration du tenant).
  // ---------------------------------------------------------------------

  const HDL_COLUMNS = [
    'LocationCode',
    'EffectiveStartDate',
    'Name',
    'AddressLine1',
    'TownOrCity',
    'Region1',
    'PostalCode',
    'Country'
  ];

  const ROW_FIELD_ORDER = [
    'locationCode',
    'effectiveStartDate',
    'name',
    'addressLine1',
    'townOrCity',
    'region1',
    'postalCode',
    'country'
  ];

  function toHdlDateFormat(isoDate) {
    // HDL attend yyyy/MM/dd, nos lignes sont saisies en yyyy-MM-dd.
    return (isoDate || '').replace(/-/g, '/');
  }

  function buildHdlContent(rows) {
    const lines = [];
    lines.push(['METADATA', 'Location', ...HDL_COLUMNS].join('|'));
    rows.forEach((row) => {
      const values = ROW_FIELD_ORDER.map((field) => {
        if (field === 'effectiveStartDate') {
          return toHdlDateFormat(row[field]);
        }
        return row[field] || '';
      });
      lines.push(['MERGE', 'Location', ...values].join('|'));
    });
    return lines.join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------------
  // Soumission - endpoint a completer une fois la Service Connection
  // hcmDataLoaders creee dans le Designer (cf. discussion en cours).
  // ---------------------------------------------------------------------

  // Endpoints VB pour les actions collection de dataLoadDataSets - a completer
  // avec les references exactes affichees dans le selecteur "Call REST" du Designer.
  const UPLOAD_FILE_ENDPOINT = 'site_hcm_extension:hcmRestLoader/doall_uploadFile_dataLoadDataSets';
  const CREATE_FILE_DATA_SET_ENDPOINT = 'site_hcm_extension:hcmRestLoader/doall_createFileDataSet_dataLoadDataSets';

  function extractResultValue(response) {
    const body = response && response.body;
    if (!body) {
      return null;
    }
    const result = body.result !== undefined ? body.result : body;
    if (typeof result === 'string') {
      return result;
    }
    if (result && typeof result === 'object') {
      // Le resultat peut etre un objet cle/valeur (ex: { ContentId: '...' }) selon l'action.
      const values = Object.values(result);
      return values.length > 0 ? values[0] : JSON.stringify(result);
    }
    return JSON.stringify(result);
  }

  class submitHdlImport extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {object} params.event
     */
    async run(context, { event }) {
      const { $variables } = context;
      const rows = $variables.locationRows || [];

      if (rows.length === 0) {
        window.alert('Aucune ligne a envoyer.');
        return;
      }

      const hdlContent = buildHdlContent(rows);
      const zipBytes = buildZip('Location.dat', hdlContent);
      const base64Zip = bytesToBase64(zipBytes);

      // eslint-disable-next-line no-console
      console.log('submitHdlImport: HDL content =', hdlContent);
      // eslint-disable-next-line no-console
      console.log('submitHdlImport: zip size =', zipBytes.length, 'base64 length =', base64Zip.length);

      if (UPLOAD_FILE_ENDPOINT.indexOf('TODO') === 0 || CREATE_FILE_DATA_SET_ENDPOINT.indexOf('TODO') === 0) {
        window.alert('Endpoints dataLoadDataSets pas encore configures - voir console pour le ZIP genere en base64.');
        return;
      }

      try {
        // Etape 1 : upload du fichier sur le serveur de contenu Oracle.
        const uploadResponse = await Actions.callRest(context, {
          endpoint: UPLOAD_FILE_ENDPOINT,
          body: {
            content: base64Zip,
            fileName: 'BulkLocationLoad.zip'
          }
        });
        // eslint-disable-next-line no-console
        console.log('submitHdlImport: uploadFile response =', uploadResponse);
        const contentId = extractResultValue(uploadResponse);

        if (!contentId) {
          window.alert('uploadFile a reussi mais aucun contentId n\'a ete trouve dans la reponse - voir console.');
          return;
        }

        // Etape 2 : soumission du data set pour import + chargement.
        const dataSetName = `BulkLocationLoad-${new Date().toISOString().replace(/[:.]/g, '')}`;
        const submitResponse = await Actions.callRest(context, {
          endpoint: CREATE_FILE_DATA_SET_ENDPOINT,
          body: {
            contentId,
            fileAction: 'IMPORT_AND_LOAD',
            dataSetName
          }
        });
        // eslint-disable-next-line no-console
        console.log('submitHdlImport: createFileDataSet response =', submitResponse);
        const requestId = extractResultValue(submitResponse);

        window.alert(`Import HDL soumis avec succes.\ncontentId: ${contentId}\ndataSetName: ${dataSetName}\nrequestId: ${requestId}\n\nLe traitement HDL est asynchrone (peut prendre plusieurs minutes) - verifier le statut dans dataLoadDataSets.`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('submitHdlImport: error =', error);
        const body = (error && error.body) || (error && error.message) || error;
        window.alert(`Echec de la soumission HDL: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
      }
    }
  }

  return submitHdlImport;
});
