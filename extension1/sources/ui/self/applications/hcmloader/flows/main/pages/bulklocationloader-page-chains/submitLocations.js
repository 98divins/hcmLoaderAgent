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

  async function createLocation(context, row) {
    try {
      const response = await Actions.callRest(context, {
        endpoint: 'site_hcm_extension:hcmRestLocations/create_locationsV2',
        body: toRestPayload(row)
      });
      return { row, ok: true, body: response && response.body };
    } catch (error) {
      return { row, ok: false, body: (error && error.body) || (error && error.message) || error };
    }
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

      const results = [];
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        const result = await createLocation(context, row);
        results.push(result);
      }

      const summaryLines = results.map((result, index) => {
        const code = result.row.locationCode || `(ligne ${index + 1})`;
        if (result.ok) {
          return `OK - ${code}`;
        }
        const errorDetail = (result.body && (result.body.detail || result.body.title || result.body.message))
          || (typeof result.body === 'string' ? result.body.slice(0, 300) : JSON.stringify(result.body));
        return `ECHEC - ${code} - ${errorDetail}`;
      });

      // eslint-disable-next-line no-console
      console.log('submitLocations results:', results);
      window.alert(summaryLines.join('\n'));
    }
  }

  return submitLocations;
});
