define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  const STEPS = ['data', 'review', 'submit', 'result'];

  /**
   * Va a une etape du dossier, avec la condition qui le justifie. Le template
   * Redwood adresse l'etape par l'URL (currentStep) : chaque etape est une
   * entree d'historique, le bouton Precedent du navigateur fonctionne.
   * "start" ramene a l'accueil.
   */
  class goToStepChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {string} params.step  data | review | submit | result | start
     * @param {string} params.when  condition : sheets | clean | requestId
     */
    async run(context, { step, when } = {}) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;

      if (step === 'start') {
        await Actions.navigateToPage(context, { page: 'main-start' });
        return;
      }
      if (STEPS.indexOf(step) === -1) { return; }

      if (when === 'sheets' && !($variables.sheets || []).length) { return; }
      if (when === 'clean' && ($variables.step !== 'submit' || $variables.countIssues)) { return; }
      if (when === 'requestId' && !$variables.requestId) { return; }

      await Actions.navigateToPage(context, {
        page: 'dossier',
        params: { currentStep: step },
        history: 'push'
      });
    }
  }

  return goToStepChain;
});
