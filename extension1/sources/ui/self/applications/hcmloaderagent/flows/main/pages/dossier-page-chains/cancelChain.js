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
      $page.variables.cancel = true;
      await Actions.navigateToPage(context, { page: 'main-start' });
    }
  }

  return cancelChain;
});
