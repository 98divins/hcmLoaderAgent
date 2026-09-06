define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Le bouton Annuler du template Redwood : on quitte le dossier. Si le
   * dossier a quelque chose a perdre, vbBeforeExit ouvre le dialogue
   * "modifications non enregistrees" et attend la reponse.
   */
  class cancelChain extends ActionChain {

    async run(context) {
      const { $page } = context;
      const $variables = context.$flow.variables;
      const summary = $variables.loadSummary || {};
      // Sur l'etape Suivre, le job termine, Annuler n'a plus de sens : c'est
      // terminer le dossier, avec son bilan.
      if ($page.variables.currentStep === 'result' && summary.finished) {
        await Actions.callChain(context, { chain: 'finishChain' });
        await Actions.callChain(context, { chain: 'resetChain' });
        await Actions.callChain(context, { chain: 'goToStepChain', params: { step: 'start' } });
        return;
      }
      $page.variables.cancel = true;
      await Actions.navigateToPage(context, { page: 'main-start' });
    }
  }

  return cancelChain;
});
