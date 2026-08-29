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

  // Ordre des colonnes du fichier HDL pour l'objet metier "Location".
  // Noms d'attributs a valider avec la doc Oracle HDL avant un usage reel.
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

  class generateHdlPreview extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {object} params.event
     */
    async run(context, { event }) {
      const { $variables } = context;
      const rows = $variables.locationRows || [];

      const lines = [];
      lines.push(['METADATA', 'Location', ...HDL_COLUMNS].join('|'));
      rows.forEach((row) => {
        const values = ROW_FIELD_ORDER.map((field) => row[field] || '');
        lines.push(['MERGE', 'Location', ...values].join('|'));
      });

      const hdlContent = lines.join('\n');
      // POC: affichage brut en alert. A remplacer par une vraie zone de texte sur la page.
      window.alert(hdlContent || 'Aucune ligne a exporter.');
    }
  }

  return generateHdlPreview;
});
