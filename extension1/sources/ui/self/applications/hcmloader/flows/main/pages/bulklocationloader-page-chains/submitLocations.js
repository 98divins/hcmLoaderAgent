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

  // Date de fin d'effet "sans fin" standard Oracle (utilisee dans tout Fusion pour un enregistrement ouvert).
  const OPEN_ENDED_DATE = '4712-12-31';
  // Jeu de donnees de reference par defaut - a confirmer/ajuster selon la config du tenant.
  const DEFAULT_SET_CODE = 'COMMON';
  // Code d'usage d'adresse - a confirmer via la LOV commonLookupsLOV (LOCATION_ADDRESS_USAGE_TYPE) si invalide.
  const DEFAULT_ADDRESS_USAGE_TYPE = 'MAIN';

  function toRestPayload(row) {
    return {
      LocationCode: row.locationCode || '',
      LocationName: row.name || '',
      EffectiveStartDate: row.effectiveStartDate || '',
      EffectiveEndDate: OPEN_ENDED_DATE,
      SetCode: DEFAULT_SET_CODE,
      addresses: [
        {
          EffectiveStartDate: row.effectiveStartDate || '',
          EffectiveEndDate: OPEN_ENDED_DATE,
          Country: row.country || '',
          AddressUsageType: DEFAULT_ADDRESS_USAGE_TYPE,
          AddressLine1: row.addressLine1 || '',
          TownOrCity: row.townOrCity || '',
          Region1: row.region1 || '',
          PostalCode: row.postalCode || ''
        }
      ]
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
