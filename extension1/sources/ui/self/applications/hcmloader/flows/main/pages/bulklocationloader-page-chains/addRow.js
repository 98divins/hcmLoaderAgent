define([
  'vb/action/actionChain',
  'vb/action/actions',
  'vb/action/actionUtils',
  'ojs/ojarraydataprovider',
], (
  ActionChain,
  Actions,
  ActionUtils,
  ArrayDataProvider
) => {
  'use strict';

  class addRow extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {object} params.event
     */
    async run(context, { event }) {
      const { $page, $flow, $application, $base, $extension, $constants, $variables } = context;

      const newRow = {
        locationCode: '',
        name: '',
        effectiveStartDate: '',
        addressLine1: '',
        townOrCity: '',
        region1: '',
        postalCode: '',
        country: ''
      };

      $variables.locationRows = [...($variables.locationRows || []), newRow];
      $variables.locationRowsDP = new ArrayDataProvider($variables.locationRows, { keyAttributes: '@index' });
    }
  }

  return addRow;
});
