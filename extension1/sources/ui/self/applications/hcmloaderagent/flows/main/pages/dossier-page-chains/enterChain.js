define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  const STEPS = ['data', 'review', 'submit', 'result'];

  /**
   * A l'entree de la page, a chaque etape (l'etape est dans l'URL). Si l'etat
   * du dossier ne correspond pas a l'etape demandee, on renvoie a la bonne :
   * une adresse tapee a la main, un retour navigateur ou un rechargement ne
   * montrent jamais une etape vide. Et ce que l'etape doit lancer, elle le
   * lance ici : les referentiels a l'import, la scrutation du job au suivi.
   */
  class enterChain extends ActionChain {

    async run(context) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      const { $page } = context;

      if (!$variables.opened) {
        await Actions.navigateToPage(context, { page: 'main-start' });
        return;
      }

      const step = String($page.variables.currentStep || '');
      const go = (target) => Actions.navigateToPage(context, {
        page: 'dossier', params: { currentStep: target }, history: 'replace'
      });

      if (STEPS.indexOf(step) === -1) { await go('data'); return; }
      if (step === 'submit' && ($variables.step !== 'submit' || $variables.countIssues)) {
        await go('review');
        return;
      }
      if (step === 'result' && !$variables.requestId) { await go('review'); return; }

      if (step === 'data' && !Object.keys($variables.lookupValues || {}).length) {
        await Actions.callChain(context, { chain: 'loadLookupsChain' });
      }

      const summary = $variables.loadSummary || {};
      if (step === 'result' && $variables.requestId && !summary.finished && !$variables.isPolling) {
        await Actions.callChain(context, { chain: 'checkLoadStatusChain', params: { auto: true } });
      }
    }
  }

  return enterChain;
});
