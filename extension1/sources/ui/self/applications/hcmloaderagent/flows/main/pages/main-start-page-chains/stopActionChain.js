define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Interrompt l'attente. La boucle de scrutation lit ce drapeau entre deux
   * tentatives : le travail côté agent continue, mais on cesse de l'attendre.
   */
  class stopActionChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      $variables.aborted = true;
    }
  }

  return stopActionChain;
});
