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

  function toRestPayload(row) {
    return {
      LocationCode: row.locationCode || '',
      LocationName: row.name || '',
      AddressLine1: row.addressLine1 || '',
      TownOrCity: row.townOrCity || '',
      Region1: row.region1 || '',
      PostalCode: row.postalCode || '',
      Country: row.country || ''
    };
  }

  class submitLocations extends ActionChain {

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

      // Hypothese de format "bulk" Oracle (parts[]) - a ajuster selon la reponse reelle du serveur.
      const parts = rows.map((row, index) => ({
        id: String(index + 1),
        path: '/locationsV2',
        operation: 'create',
        payload: toRestPayload(row)
      }));

      let response;
      try {
        response = await Actions.callRest(context, {
          endpoint: 'site_hcm_extension:hcmRestLocations/batch',
          body: { parts }
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('submitLocations: callRest error', error);
        window.alert(`Echec de l'appel REST : ${error && error.message ? error.message : JSON.stringify(error)}`);
        return;
      }

      // eslint-disable-next-line no-console
      console.log('submitLocations: response', response);
      const bodyPreview = JSON.stringify((response && response.body) || response).slice(0, 800);
      window.alert(`Reponse recue, voir la console pour le detail.\n${bodyPreview}`);
    }
  }

  return submitLocations;
});
