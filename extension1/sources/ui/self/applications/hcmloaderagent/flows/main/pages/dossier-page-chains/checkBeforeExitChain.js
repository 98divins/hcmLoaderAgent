define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Avant de quitter la page du dossier (Annuler, menu, adresse) : si le
   * dossier a des feuilles et n'est pas termine, le dialogue Redwood demande
   * confirmation. Oui : le dossier est vide et l'on part. Non : on reste.
   * Passer d'une etape a l'autre ne quitte pas la page : rien n'est demande.
   */
  class checkBeforeExitChain extends ActionChain {

    async run(context) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      const { $page, $application, $flow } = context;

      const leaving = !window.location.pathname.endsWith($application.currentPage.id)
        || $page.variables.cancel;
      if (!leaving) { return { cancelled: false }; }

      const dirty = $flow.functions.isDirty($variables.opened, $variables.sheets, $variables.loadSummary);
      if (!dirty) {
        $page.variables.cancel = false;
        if ($variables.opened) { await Actions.callChain(context, { chain: 'resetChain' }); }
        return { cancelled: false };
      }

      $page.variables.dirtyDialogOpen = true;
      const answer = await $page.functions.checkWithUser();

      if (answer === 'YES') {
        $page.variables.cancel = false;
        await Actions.callChain(context, { chain: 'resetChain' });
        return { cancelled: false };
      }

      if ($page.variables.cancel) {
        $page.variables.cancel = false;
      } else {
        await Actions.navigateToPage(context, {
          page: $application.currentPage.id,
          params: { currentStep: $page.variables.currentStep },
          history: 'push'
        });
      }
      return { cancelled: true };
    }
  }

  return checkBeforeExitChain;
});
