define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Convention d'operationId d'un service adf-rest : getall_<ressource>. Elle
  // n'a pas ete confirmee dans le selecteur du Designer pour cette ressource :
  // si elle est fausse, le message d'erreur nomme l'endpoint, ce qui suffit a
  // le corriger en un aller-retour.
  const STATUS = 'site_hcm_extension:hcmRestLoader/getall_dataLoadDataSets';

  function unwrap(response) {
    return (response && response.body !== undefined) ? response.body : response;
  }

  /** Les collections ADF sont enveloppees : { items, count, hasMore, ... }. */
  function items(node) {
    if (!node) { return []; }
    if (Array.isArray(node)) { return node; }
    return Array.isArray(node.items) ? node.items : [];
  }

  /**
   * On ne sait pas encore quels champs Oracle rend sur cette ressource. Plutot
   * que de figer une liste d'attributs qui serait fausse, on affiche ce qui
   * arrive : les colonnes du tableau se deduisent des cles reellement presentes.
   */
  function toDisplayRows(messages) {
    return messages.map((message, index) => {
      const row = { rowKey: `M${index + 1}` };
      Object.keys(message).forEach((key) => {
        if (key === 'links' || key === '@context') { return; }
        const value = message[key];
        if (value === null || value === undefined) { return; }
        if (typeof value === 'object') { return; }
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

  class checkLoadStatusChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      const requestId = String($variables.requestId || '').trim();
      if (!requestId || $variables.isPolling) { return; }

      $variables.isPolling = true;
      $variables.errorText = '';
      $variables.loadStatus = 'Lecture du statut du chargement...';

      try {
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
          $variables.loadStatus = `Aucun jeu de donnees trouve pour le RequestId ${requestId}.`;
          $variables.loadDetail = 'Le job vient peut-etre d\'etre soumis : reessayez dans '
            + 'une minute.';
          return;
        }

        const dataSet = dataSets[0];
        const messages = toDisplayRows(items(dataSet.messages));

        $variables.loadRows = messages;
        $variables.loadColumns = columnsOf(messages);

        // Le vocabulaire exact des champs de statut n'est pas etabli : on
        // affiche ceux qu'on trouve, et le detail brut sert de filet tant que
        // ce vocabulaire n'est pas confirme par une reponse reelle.
        const status = dataSet.Status || dataSet.status || dataSet.DataSetStatus || '';
        $variables.loadStatus = status
          ? `RequestId ${requestId} · ${status}`
          : `RequestId ${requestId} · statut non identifie dans la reponse`;
        $variables.loadDetail = messages.length
          ? `${messages.length} message${messages.length > 1 ? 's' : ''} renvoye`
            + `${messages.length > 1 ? 's' : ''} par le moteur HDL.`
          : `Aucun message pour l'instant. Reponse brute : ${JSON.stringify(dataSet).slice(0, 600)}`;

        // L'agent n'est sollicite que s'il y a matiere : un chargement propre
        // n'a pas besoin d'etre explique.
        $variables.question = messages.length
          ? 'Le chargement HDL a renvoye les messages suivants. Explique chaque rejet '
            + 'a partir du message exact d\'Oracle, et propose les corrections '
            + `applicables sur les lignes du plan : ${JSON.stringify(messages).slice(0, 3000)}`
          : '';
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('checkLoadStatusChain: erreur =', error);
        const body = (error && error.body) || (error && error.message) || error;
        $variables.errorText = `Lecture du statut impossible via ${STATUS} : `
          + `${typeof body === 'string' ? body : JSON.stringify(body)}`;
        $variables.loadStatus = '';
      } finally {
        $variables.isPolling = false;
      }
    }
  }

  return checkLoadStatusChain;
});
