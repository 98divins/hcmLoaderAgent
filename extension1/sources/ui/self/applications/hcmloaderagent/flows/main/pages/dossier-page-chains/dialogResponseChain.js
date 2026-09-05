define(['vb/action/actionChain'], (ActionChain) => {
  'use strict';

  /** Reponse au dialogue "modifications non enregistrees" : YES ou NO. */
  class dialogResponseChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {string} params.response  YES | NO
     */
    async run(context, { response } = {}) {
      const { $page } = context;
      await $page.functions.userResponse(response);
      $page.variables.dirtyDialogOpen = false;
    }
  }

  return dialogResponseChain;
});
