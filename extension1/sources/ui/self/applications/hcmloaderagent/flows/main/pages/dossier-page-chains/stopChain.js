define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Cesse d'attendre l'agent. La boucle de scrutation lit ce drapeau entre deux
   * tentatives ; le travail se poursuit cote serveur, on ne l'attend plus.
   */
  class stopChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      $variables.aborted = true;
    }
  }

  return stopChain;
});
