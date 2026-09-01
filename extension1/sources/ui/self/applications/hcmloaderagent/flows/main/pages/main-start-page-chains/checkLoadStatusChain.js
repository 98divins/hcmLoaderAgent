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

  /**
   * Le vocabulaire des messages n'est pas etabli : on affiche les cles
   * reellement presentes plutot qu'une liste figee qui rendrait un tableau
   * vide sans rien signaler.
   */
  function toMessageRows(messages) {
    return messages.map((message, index) => {
      const row = { rowKey: `M${index + 1}` };
      Object.keys(message).forEach((key) => {
        if (key === 'links' || key === '@context') { return; }
        const value = message[key];
        if (value === null || value === undefined || typeof value === 'object') { return; }
        row[key] = String(value);
      });
      return row;
    });
  }

  function columnsOf(rows) {
    const names = [];
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key !== 'rowKey' && names.indexOf(key) === -1) { names.push(key); }
      });
    });
    return names;
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

          const dataSets = items(response);
          if (!dataSets.length) {
            $variables.loadStatus = `Aucun jeu de donnees pour le RequestId ${requestId}.`;
            $variables.loadDetail = 'Le job vient peut-etre d\'etre soumis. La lecture '
              + 'reprend automatiquement.';
            // eslint-disable-next-line no-continue
            continue;
          }

          const dataSet = dataSets[0];
          const messages = toMessageRows(items(dataSet.messages));

          $variables.loadPhases = toPhaseRows(dataSet);
          $variables.loadRows = messages;
          $variables.loadColumns = columnsOf(messages);
          $variables.dataSetName = dataSet.DataSetName || $variables.dataSetName;
          $variables.loadStatus = `RequestId ${requestId} · `
            + `${dataSet.DataSetStatusMeaning || dataSet.DataSetStatusCode || 'statut inconnu'}`;
          $variables.loadDetail = messages.length
            ? `${messages.length} message${messages.length > 1 ? 's' : ''} du moteur HDL.`
            : 'Aucun message pour l\'instant.';

          if (!isRunning(dataSet)) {
            // Terminal : l'agent n'est sollicite que s'il y a matiere.
            $variables.question = messages.length
              ? 'Le chargement HDL est termine et a renvoye les messages suivants. '
                + 'Explique chaque rejet a partir du message exact d\'Oracle, et propose '
                + 'les corrections applicables sur les lignes du plan : '
                + JSON.stringify(messages).slice(0, 3000)
              : '';
            break;
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('checkLoadStatusChain: erreur =', error);
        const body = (error && error.body) || (error && error.message) || error;
        $variables.errorText = `Lecture du statut impossible via ${STATUS} : `
          + `${typeof body === 'string' ? body : JSON.stringify(body)}`;
      } finally {
        $variables.isPolling = false;
      }
    }
  }

  return checkLoadStatusChain;
});
