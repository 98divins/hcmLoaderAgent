define([
  'vb/action/actionChain',
  'vb/action/actions',
  'hcmloaderagent/resources/js/hdlEngine'
], (ActionChain, Actions, hdlEngine) => {
  'use strict';

  // Endpoints valides en execution reelle sur le loader Location
  // (RequestId 9908614, ORA_SUCCESS, 3/3 lignes chargees).
  const UPLOAD = 'site_hcm_extension:hcmRestLoader/doall_uploadFile_dataLoadDataSets';
  const CREATE = 'site_hcm_extension:hcmRestLoader/doall_createFileDataSet_dataLoadDataSets';

  const ROW_LIMIT = 50;

  function unwrap(response) {
    return (response && response.body !== undefined) ? response.body : response;
  }

  /**
   * Le corps d'une reponse d'action collection enveloppe le resultat. On exige
   * le nom du champ attendu plutot que de prendre la premiere valeur venue :
   * une heuristique avait deja fait passer "SUCCESS" pour un ContentId.
   */
  function extractField(response, fieldName) {
    const body = unwrap(response);
    const result = body && (body.result !== undefined ? body.result : body);
    if (result && typeof result === 'object' && result[fieldName] !== undefined) {
      return result[fieldName];
    }
    return null;
  }

  /** Le plan de la page devient le plan que le moteur HDL consomme. */
  function toPlan($variables) {
    return {
      businessObject: $variables.businessObject,
      columns: $variables.columns || [],
      rows: ($variables.rows || []).map((row) => {
        const values = {};
        ($variables.columns || []).forEach((name) => { values[name] = row[name]; });
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

      if (!rows.length) { return; }
      if ($variables.isLoading) { return; }

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
        const pkg = hdlEngine.buildHdlPackage(toPlan($variables));

        $variables.loadStatus = 'Envoi du fichier vers le serveur de contenu Oracle...';
        const uploaded = await Actions.callRest(context, {
          endpoint: UPLOAD,
          body: { content: pkg.base64, fileName: `${$variables.businessObject}Load.zip` }
        });
        const contentId = extractField(uploaded, 'ContentId');
        if (!contentId) {
          throw new Error(`uploadFile n'a pas rendu de ContentId : ${JSON.stringify(unwrap(uploaded))}`);
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
        $variables.errorText = `Le chargement n'a pas pu etre soumis : `
          + `${typeof body === 'string' ? body : JSON.stringify(body)}`;
        $variables.loadStatus = '';
      } finally {
        $variables.isLoading = false;
      }
    }
  }

  return submitLoadChain;
});
