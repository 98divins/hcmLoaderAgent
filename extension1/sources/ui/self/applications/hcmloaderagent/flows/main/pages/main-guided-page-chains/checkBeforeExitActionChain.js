/* Copyright (c) 2026, Oracle and/or its affiliates */

define([
  'vb/action/actionChain',
  'vb/action/actions'
], (
  ActionChain,
  Actions
) => {
  'use strict';

  class checkBeforeExitActionChain extends ActionChain {

    /**
     * @param {Object} context
     */
    async run(context) {
      const { $page, $application } = context;

      if (!window.location.pathname.endsWith($application.currentPage.id) || $page.variables.cancel) {
        if ($page.variables.dirtyDataFlag) {

          // Open dialog
          $page.variables.dirtyDialogOpen = true;

          // Pause navigation
          const callOpenDialog = await $page.functions.checkWithUser();

          if (callOpenDialog === 'YES') {
            return { cancelled: false };
          } else {
            if ($page.variables.cancel) {
              $page.variables.cancel = false;
            } else {
              await Actions.navigateToPage(context, {
                page: $application.currentPage.id,
                params: {
                  currentStep: $page.variables.currentStep,
                  dirtyDataFlag: $page.variables.dirtyDataFlag
                },
                history: "push"
              });
            }

            return { cancelled: true };
          }
        }
      }
    }
  }

  return checkBeforeExitActionChain;
});