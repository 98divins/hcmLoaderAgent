const response2 = define([
  'vb/action/actionChai{
  endpoint: 'site_hcm_extension:hcmRestLocations/batch',
}
  'vb/action/actions',
  'vb/action/actionUtils',
], (
  ActionChain,
  Actions,
  ActionUtils
) => {
  'use strict';

  // Hypothese de ressource REST et de noms de champs pour l'objet Location.
  // A ajuster selon la reponse reelle de l'API (URL et/ou noms d'attributs).
  const LOCATIONS_RESOURCE_URL = '/hcmRestApi/resources/latest/locations';

  function getXsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)(XSRF-TOKEN[^=]*)=([^;]+)/);
    return match ? decodeURIComponent(match[2]) : null;
  }

  function toRestPayload(row) {
    return {
      LocationCode: row.locationCode || '',
      LocationName: row.name || '',
      EffectiveStartDate: row.effectiveStartDate || '',
      AddressLine1: row.addressLine1 || '',
      TownOrCity: row.townOrCity || '',
      Region1: row.region1 || '',
      PostalCode: row.postalCode || '',
      Country: row.country || ''
    };
  }

  async function createLocation(row) {
    const xsrfToken = getXsrfToken();
    // eslint-disable-next-line no-console
    console.log('submitLocations: xsrfToken found =', xsrfToken);
    const headers = {
      'Content-Type': 'application/vnd.oracle.adf.resourceitem+json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    };
    if (xsrfToken) {
      headers['X-XSRF-TOKEN'] = xsrfToken;
    }

    const response = await fetch(LOCATIONS_RESOURCE_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(toRestPayload(row))
    });

    const bodyText = await response.text();
    let bodyJson = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch (e) {
      // Reponse non-JSON (ex: page d'erreur HTML) : on garde le texte brut.
    }

    // eslint-disable-next-line no-console
    console.log('submitLocations: response headers for', row.locationCode, [...response.headers.entries()]);

    return {
      row,
      ok: response.ok,
      status: response.status,
      body: bodyJson || bodyText
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
      await Actions.callRest(context, {
      });

      const rows = $variables.locationRows || [];

      if (rows.length === 0) {
        window.alert('Aucune ligne a envoyer.');
        return;
      }

      const results = [];
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        const result = await createLocation(row);
        results.push(result);
      }

      const summaryLines = results.map((result, index) => {
        const code = result.row.locationCode || (ligne ${index + 1});
        if (result.ok) {
          return OK - ${code};
        }
        const errorDetail = (result.body && (result.body.detail || result.body.title || result.body.message))
          || (typeof result.body === 'string' ? result.body.slice(0, 300) : JSON.stringify(result.body));
        return ECHEC - ${code} - HTTP ${result.status} - ${errorDetail};
      });

      // eslint-disable-next-line no-console
      console.log('submitLocations results:', results);
      window.alert(summaryLines.join('\n'));
    }
  }

  return submitLocations;
});