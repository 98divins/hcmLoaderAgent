define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Endpoint confirme en execution reelle : la reponse a livre le vocabulaire
  // ci-dessous, qui n'est donc plus devine.
  const STATUS = 'site_hcm_extension:hcmRestLoader/getall_dataLoadDataSets';

  // Le suivi se rafraichit tant que le job avance, et s'arrete de lui-meme des
  // qu'il est termine : une scrutation qui continue apres la fin ne fait
  // qu'user le pod.
  const POLL_MS = 10000;
  const MAX_POLLS = 60;

  /** Etapes du job, dans l'ordre ou Oracle les enchaine. */
  const PHASES = [
    { label: 'Transfert', code: 'TransferStatusCode', meaning: 'TransferStatusMeaning' },
    { label: 'Import', code: 'ImportStatusCode', meaning: 'ImportStatusMeaning',
      percent: 'ImportPercentageComplete' },
    { label: 'Chargement', code: 'LoadStatusCode', meaning: 'LoadStatusMeaning',
      percent: 'LoadPercentageComplete' }
  ];

  const RUNNING = ['ORA_IN_PROGRESS', 'IN_PROGRESS', 'NOT_READY', 'PENDING', 'ORA_PENDING'];

  // Champs par lesquels un message d'Oracle peut designer la ligne du fichier.
  // Le vocabulaire exact varie selon l'objet et la phase : on essaie chacun, et
  // faute de numero on cherche "line N" dans le texte.
  const LINE_FIELDS = ['FileLine', 'FileLineNumber', 'LineNumber', 'DatFileLineNumber', 'LineId'];

  function unwrap(response) {
    return (response && response.body !== undefined) ? response.body : response;
  }

  function items(node) {
    if (!node) { return []; }
    if (Array.isArray(node)) { return node; }
    return Array.isArray(node.items) ? node.items : [];
  }

  function wait(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
  }

  function now() {
    return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /** Une ligne par phase, lisible : etat en clair et avancement quand il existe. */
  function toPhaseRows(dataSet) {
    return PHASES.map((phase, index) => {
      const meaning = dataSet[phase.meaning] || dataSet[phase.code] || '';
      const percent = phase.percent ? dataSet[phase.percent] : null;
      return {
        rowKey: `P${index + 1}`,
        Etape: phase.label,
        Etat: String(meaning),
        Avancement: (percent === null || percent === undefined || percent === '')
          ? '' : `${percent} %`
      };
    });
  }

  function lineOf(message) {
    for (let i = 0; i < LINE_FIELDS.length; i += 1) {
      const raw = message[LINE_FIELDS[i]];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        const n = parseInt(String(raw), 10);
        if (!isNaN(n)) { return n; }
      }
    }
    if (message.ReportedAgainstCode === 'ORA_FILE_LINE' && message.ReportedAgainstValue) {
      const n = parseInt(String(message.ReportedAgainstValue), 10);
      if (!isNaN(n)) { return n; }
    }
    const text = String(message.MessageText || message.Message || '');
    const m = /\bline\s+(\d+)/i.exec(text);
    return m ? parseInt(m[1], 10) : 0;
  }

  function isError(message) {
    const type = String(message.MessageTypeCode || message.MessageType || 'ERROR').toUpperCase();
    return type.indexOf('ERROR') !== -1 || type === 'FATAL';
  }

  /**
   * Un message d'Oracle, ramene a ce qu'un utilisateur peut lire : quelle
   * feuille, quelle ligne du dossier, quel texte. La ligne est retrouvee par son
   * numero dans le fichier envoye, note au moment de la soumission.
   */
  function toReject(message, sheets, catalog) {
    const line = lineOf(message);
    const text = String(message.MessageText || message.Message || message.MessageName || '')
      .replace(/\s+/g, ' ').trim();
    const object = String(message.BusinessObjectDiscriminator || message.DataSetBusinessObjectName
      || message.BusinessObjectName || '');

    let found = null;
    if (line) {
      sheets.forEach((sheet, sheetIndex) => {
        (sheet.rows || []).forEach((row) => {
          if (row.datLine === line) { found = { sheetIndex, sheet, row }; }
        });
      });
    }

    let label = '';
    if (found) {
      const spec = ((catalog || {}).objects || {})[found.sheet.object] || {};
      const keys = (spec.userKey || []).filter((k) => (found.sheet.columns || []).indexOf(k) !== -1);
      label = keys.map((k) => String(found.row[k] || '')).filter((v) => v).join(' / ');
    }

    return {
      rowKey: found ? found.row.rowKey : '',
      sheet: found ? found.sheetIndex : -1,
      sheetLabel: found ? found.sheet.label : (object || 'objet non identifie'),
      label: label || (found ? found.row.rowKey : ''),
      line,
      error: isError(message),
      text: text || 'message sans texte'
    };
  }

  function isRunning(dataSet) {
    const code = dataSet.DataSetStatusCode || '';
    return RUNNING.indexOf(code) !== -1;
  }

  class checkLoadStatusChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     * @param {boolean} params.auto  scrutation automatique jusqu'a la fin du job
     */
    async run(context, { event, auto } = {}) {
      const { $variables } = context;
      const requestId = String($variables.requestId || '').trim();
      if (!requestId || $variables.isPolling) { return; }

      $variables.isPolling = true;
      $variables.errorText = '';

      const attempts = (auto === false) ? 1 : MAX_POLLS;

      try {
        for (let i = 0; i < attempts; i += 1) {
          if ($variables.aborted) { break; }
          if (i > 0) {
            // eslint-disable-next-line no-await-in-loop
            await wait(POLL_MS);
            if ($variables.aborted) { break; }
          }

          // eslint-disable-next-line no-await-in-loop
          const response = unwrap(await Actions.callRest(context, {
            endpoint: STATUS,
            uriParams: {
              q: `RequestId=${requestId}`,
              expand: 'messages',
              onlyData: true,
              limit: 1
            }
          }));
          $variables.lastRefresh = now();

          const dataSets = items(response);
          if (!dataSets.length) {
            $variables.loadStatus = 'Chargement soumis, le job n\'est pas encore visible.';
            $variables.loadDetail = 'La lecture reprend automatiquement toutes les dix secondes.';
            // eslint-disable-next-line no-continue
            continue;
          }

          const dataSet = dataSets[0];
          const messages = items(dataSet.messages);
          const sheets = $variables.sheets || [];
          const rejects = messages.map((m) => toReject(m, sheets, $variables.objectCatalog));
          const running = isRunning(dataSet);
          const submitted = ($variables.loadSummary || {}).submitted || 0;

          // Lignes rejetees : celles qu'un message d'erreur designe. Une ligne
          // non designee n'est consideree chargee que si le job est termine et
          // que chaque erreur a pu etre rattachee a une ligne : sinon on ne
          // sait pas, et on ne marque rien.
          const errorRejects = rejects.filter((r) => r.error);
          const allMapped = errorRejects.every((r) => r.sheet !== -1);
          const rejectedKeys = {};
          errorRejects.forEach((r) => { if (r.sheet !== -1) { rejectedKeys[`${r.sheet}|${r.rowKey}`] = r.text; } });
          const rejectedCount = Object.keys(rejectedKeys).length;

          $variables.loadPhases = toPhaseRows(dataSet);
          $variables.rejects = rejects;
          $variables.dataSetName = dataSet.DataSetName || $variables.dataSetName;
          const status = dataSet.DataSetStatusMeaning || dataSet.DataSetStatusCode || 'statut inconnu';
          $variables.loadStatus = running
            ? `Chargement en cours : ${status}`
            : `Chargement termine : ${status}`;

          $variables.loadSummary = {
            submitted,
            rejected: rejectedCount,
            unmapped: errorRejects.length - errorRejects.filter((r) => r.sheet !== -1).length,
            accepted: (!running && allMapped) ? Math.max(0, submitted - rejectedCount) : null,
            finished: !running,
            status
          };

          if (!running && allMapped) {
            // Les lignes acceptees sont marquees : un nouvel envoi ne portera
            // que les autres. Les rejetees portent le message d'Oracle.
            $variables.sheets = sheets.map((sheet, sheetIndex) => Object.assign({}, sheet, {
              rows: (sheet.rows || []).map((row) => {
                if (!row.datLine) { return row; }
                const reason = rejectedKeys[`${sheetIndex}|${row.rowKey}`];
                if (reason) {
                  return Object.assign({}, row, { statusLabel: 'erreur', statusDetail: reason, loaded: false });
                }
                return Object.assign({}, row, { statusLabel: 'chargee', statusDetail: '', loaded: true });
              })
            }));
            $variables.loadDetail = rejectedCount
              ? `${submitted - rejectedCount} ligne${submitted - rejectedCount > 1 ? 's' : ''} acceptee`
                + `${submitted - rejectedCount > 1 ? 's' : ''}, ${rejectedCount} rejetee${rejectedCount > 1 ? 's' : ''}.`
              : `${submitted} ligne${submitted > 1 ? 's' : ''} acceptee${submitted > 1 ? 's' : ''}.`;
          } else if (!running) {
            $variables.loadDetail = `${errorRejects.length} message${errorRejects.length > 1 ? 's' : ''} `
              + 'd\'erreur, dont certains ne designent aucune ligne du dossier : aucune ligne '
              + 'n\'est marquee chargee.';
          } else {
            $variables.loadDetail = 'Actualisation automatique toutes les dix secondes.';
          }

          if (!running) {
            // Terminal : l'agent n'est sollicite que s'il y a matiere, et en
            // termes metier, jamais avec le JSON brut du moteur.
            const lines = errorRejects.slice(0, 20).map((r) => `- feuille ${r.sheetLabel}`
              + `${r.label ? `, ligne "${r.label}"` : ''}${r.rowKey ? ` (${r.rowKey})` : ''} : ${r.text}`);
            $variables.question = errorRejects.length
              ? `Le chargement est termine avec ${rejectedCount || errorRejects.length} rejet`
                + `${errorRejects.length > 1 ? 's' : ''}. Explique chaque rejet en termes metier, `
                + 'a partir du message exact d\'Oracle, et propose la correction applicable '
                + `sur la ligne concernee :\n${lines.join('\n')}`
              : '';
            if (errorRejects.length) { $variables.assistOpen = true; }
            break;
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('checkLoadStatusChain: erreur =', error);
        const body = (error && error.body) || (error && error.message) || error;
        $variables.errorText = 'Lecture du statut impossible : '
          + `${typeof body === 'string' ? body : JSON.stringify(body)}`;
      } finally {
        $variables.isPolling = false;
      }
    }
  }

  return checkLoadStatusChain;
});
