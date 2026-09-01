define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Ramene le dossier a l'etape de controle apres un chargement, pour corriger
   * les lignes rejetees et recharger. Le plan et la conversation sont
   * conserves : c'est le meme dossier qui continue, pas un nouveau.
   */
  class backToPlanChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      $variables.step = $variables.countIssues ? 'review' : 'submit';
      $variables.loadStatus = '';
      $variables.loadDetail = '';
      $variables.loadRows = [];
      $variables.loadColumns = [];
      $variables.errorText = '';
    }
  }

  return backToPlanChain;
});
