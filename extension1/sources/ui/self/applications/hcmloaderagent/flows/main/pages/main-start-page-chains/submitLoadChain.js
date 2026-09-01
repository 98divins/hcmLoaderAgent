define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // ------------------------------------------------------------------
  // Moteur HDL en ligne. Un module partage serait plus propre, mais le
  // chemin AMD d'une ressource d'App UI n'est pas verifie : une dependance
  // qui ne se resout pas empeche la chaine entiere de se charger, et le clic
  // ne produit alors rien, sans erreur visible. La page loader validee en
  // production portait deja son moteur en ligne.
  // ------------------------------------------------------------------

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

  /**
   * HDL lit ses fichiers en UTF-8. Tronquer chaque caractere a un octet, comme
   * le faisait la version precedente, transformait "Paris Siege" accentue en
   * suite d'octets Latin-1 : les chargements de validation ne portaient que de
   * l'ASCII, le defaut n'avait donc jamais eu l'occasion de se voir.
   */
  function stringToBytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    // Repli sans TextEncoder : encodage UTF-8 a la main.
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          code = ((code - 0xD800) << 10) + (next - 0xDC00) + 0x10000;
          i += 1;
        }
      }
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      } else if (code < 0x10000) {
        out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      } else {
        out.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F),
          0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      }
    }
    return new Uint8Array(out);
  }

  function dosDateTime(date) {
    const d = date || new Date();
    const dosTime = ((d.getHours() & 0x1F) << 11)
      | ((d.getMinutes() & 0x3F) << 5)
      | ((Math.floor(d.getSeconds() / 2)) & 0x1F);
    const dosDate = (((d.getFullYear() - 1980) & 0x7F) << 9)
      | (((d.getMonth() + 1) & 0x0F) << 5)
      | (d.getDate() & 0x1F);
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

  /** Archive ZIP à une entrée, méthode « stored ». */
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

  // ------------------------------------------------------------------
  // Contenu HDL
  // ------------------------------------------------------------------

  /** HDL attend yyyy/MM/dd ; la saisie et les CSV arrivent en yyyy-MM-dd. */
  function toHdlDate(value) {
    return (value || '').replace(/-/g, '/');
  }

  /**
   * Une valeur ne doit pas casser le découpage par pipe ni la structure en
   * lignes. HDL n'ayant pas d'échappement du séparateur, on neutralise.
   */
  function sanitizeValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[|]/g, ' ').replace(/[\r\n]+/g, ' ');
  }

  const DATE_FIELD_PATTERN = /Date$/;

  /**
   * Génère le contenu .dat à partir d'un plan de chargement.
   *
   * @param {Object} plan
   * @param {string} plan.businessObject  nom de l'objet métier HDL, ex. "Location"
   * @param {string[]} plan.columns       ordre des colonnes du fichier
   * @param {Object[]} plan.rows          lignes { instruction, values }
   * @returns {string} contenu du fichier .dat
   */
  function buildHdlContent(plan) {
    if (!plan || !plan.businessObject) {
      throw new Error('buildHdlContent: businessObject manquant dans le plan.');
    }
    if (!Array.isArray(plan.columns) || plan.columns.length === 0) {
      throw new Error('buildHdlContent: colonnes manquantes dans le plan.');
    }

    const object = plan.businessObject;
    const rows = Array.isArray(plan.rows) ? plan.rows : [];

    const lines = [['METADATA', object].concat(plan.columns).join('|')];

    rows.forEach((row, index) => {
      const instruction = row.instruction || 'MERGE';
      const values = row.values || {};
      const cells = plan.columns.map((column) => {
        const raw = values[column];
        return sanitizeValue(DATE_FIELD_PATTERN.test(column) ? toHdlDate(raw) : raw);
      });
      if (cells.every((cell) => cell === '')) {
        throw new Error(`buildHdlContent: la ligne ${index + 1} est entièrement vide.`);
      }
      lines.push([instruction, object].concat(cells).join('|'));
    });

    // HDL lit des fichiers à fins de ligne CRLF, terminés par un saut de ligne.
    return lines.join('\r\n') + '\r\n';
  }

  /**
   * Chaîne complète : plan → contenu .dat → archive .zip → base64 prêt pour
   * l'action uploadFile de dataLoadDataSets.
   */
  function buildHdlPackage(plan, options) {
    const opts = options || {};
    const datFileName = opts.datFileName || `${plan.businessObject}.dat`;
    const content = buildHdlContent(plan);
    const zipBytes = buildZip(datFileName, content, opts.date);
    return {
      datFileName,
      content,
      zipBytes,
      base64: bytesToBase64(zipBytes)
    };
  }

  // Endpoints valides en execution reelle sur le loader Location
  // (RequestId 9908614, ORA_SUCCESS, 3/3 lignes chargees).
  const UPLOAD = 'site_hcm_extension:hcmRestLoader/doall_uploadFile_dataLoadDataSets';
  const CREATE = 'site_hcm_extension:hcmRestLoader/doall_createFileDataSet_dataLoadDataSets';

  const ROW_LIMIT = 50;

  function unwrap(response) {
    return (response && response.body !== undefined) ? response.body : response;
  }

  /**
   * On exige le nom du champ attendu plutot que de prendre la premiere valeur
   * venue : une heuristique avait deja fait passer "SUCCESS" pour un ContentId.
   */
  function extractField(response, fieldName) {
    const body = unwrap(response);
    const result = body && (body.result !== undefined ? body.result : body);
    if (result && typeof result === 'object' && result[fieldName] !== undefined) {
      return result[fieldName];
    }
    return null;
  }

  function toPlan($variables) {
    const columns = $variables.columns || [];
    return {
      businessObject: $variables.businessObject,
      columns,
      rows: ($variables.rows || []).map((row) => {
        const values = {};
        columns.forEach((name) => { values[name] = row[name]; });
        return { instruction: 'MERGE', values };
      })
    };
  }

  class submitLoadChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      const rows = $variables.rows || [];

      if (!rows.length || $variables.isLoading) { return; }

      // Deux refus avant tout envoi : rien ne part avec des anomalies connues,
      // rien ne part au-dela de la taille couverte.
      if ($variables.countIssues) {
        $variables.errorText = 'Le plan porte encore des anomalies. Corrigez-les avant '
          + 'de charger.';
        return;
      }
      if (rows.length > ROW_LIMIT) {
        $variables.errorText = `Le chargement est limite a ${ROW_LIMIT} lignes pour le `
          + `moment, le dossier en porte ${rows.length}. Decoupez le fichier.`;
        return;
      }

      $variables.errorText = '';
      $variables.isLoading = true;
      $variables.loadStatus = 'Generation du fichier HDL...';

      try {
        const pkg = buildHdlPackage(toPlan($variables));

        $variables.loadStatus = 'Envoi du fichier vers le serveur de contenu Oracle...';
        const uploaded = await Actions.callRest(context, {
          endpoint: UPLOAD,
          body: { content: pkg.base64, fileName: `${$variables.businessObject}Load.zip` }
        });
        const contentId = extractField(uploaded, 'ContentId');
        if (!contentId) {
          throw new Error(`uploadFile n'a pas rendu de ContentId : `
            + `${JSON.stringify(unwrap(uploaded))}`);
        }

        $variables.loadStatus = 'Soumission du chargement HCM Data Loader...';
        const stamp = new Date().toISOString().replace(/[:.]/g, '');
        const dataSetName = `${$variables.businessObject}-${stamp}`;
        const submitted = await Actions.callRest(context, {
          endpoint: CREATE,
          body: { contentId, fileAction: 'IMPORT_AND_LOAD', dataSetName }
        });
        const requestId = extractField(submitted, 'RequestId');

        $variables.dataSetName = dataSetName;
        $variables.requestId = requestId ? String(requestId) : '';
        $variables.step = 'result';
        $variables.loadStatus = requestId
          ? `Chargement soumis. RequestId ${requestId}.`
          : 'Chargement soumis, mais aucun RequestId n\'a ete rendu.';
        $variables.loadDetail = 'Le traitement HDL est asynchrone et prend plusieurs '
          + 'minutes. Le resultat ligne a ligne ne sera lisible qu\'une fois le job '
          + 'termine cote Oracle.';
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('submitLoadChain: erreur =', error);
        const body = (error && error.body) || (error && error.message) || error;
        $variables.errorText = 'Le chargement n\'a pas pu etre soumis : '
          + `${typeof body === 'string' ? body : JSON.stringify(body)}`;
        $variables.loadStatus = '';
      } finally {
        $variables.isLoading = false;
      }
    }
  }

  return submitLoadChain;
});
