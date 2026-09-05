define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Ouvre la page du dossier sur sa premiere etape. Le dossier lui-meme vit
   * dans le flux : la page ne fait que l'afficher, etape par etape.
   */
  class openDossierChain extends ActionChain {

    async run(context) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      if (!$variables.opened) { return; }
      await Actions.navigateToPage(context, {
        page: 'dossier',
        params: { currentStep: 'data' }
      });
    }
  }

  return openDossierChain;
});
