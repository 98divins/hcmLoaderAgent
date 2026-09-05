define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * A l'entree d'une page du dossier : si l'etat ne correspond pas a l'etape,
   * on renvoie a la bonne page. Une adresse tapee a la main, un retour
   * navigateur ou un rechargement ne doivent jamais montrer une etape vide.
   */
  class guardChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {string} params.needs  opened | clean | requestId
     */
    async run(context, { needs } = {}) {
      const { $variables } = context;

      if (!$variables.opened) {
        await Actions.navigateToPage(context, { page: 'main-start' });
        return;
      }
      if (needs === 'clean' && ($variables.step !== 'submit' || $variables.countIssues)) {
        await Actions.navigateToPage(context, { page: 'dossier-check' });
        return;
      }
      if (needs === 'requestId' && !$variables.requestId) {
        await Actions.navigateToPage(context, { page: 'dossier-check' });
      }
    }
  }

  return guardChain;
});
