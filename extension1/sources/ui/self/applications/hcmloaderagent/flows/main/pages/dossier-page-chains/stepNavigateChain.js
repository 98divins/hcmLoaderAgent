define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Les boutons Precedent / Suivant du template Redwood. L'evenement est
   * intercepte (preventDefault) : c'est la page qui decide si l'on avance,
   * selon l'etat du dossier, et qui fait le travail de l'etape au passage.
   *
   *   Importer  -> Controler : le controle est lance, puis l'assistant lit le resultat
   *   Controler -> Charger   : seulement si le dernier controle est propre
   *   Charger   -> Suivre    : jamais par ce bouton, c'est "Oui, charger" qui envoie
   *   retours en arriere     : toujours possibles, hors traitement en cours
   */
  class stepNavigateChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event  spBeforeStepNavigate, detail.nextStep
     */
    async run(context, { event } = {}) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      const { $page } = context;
      const detail = (event && event.detail) || {};
      const next = String(detail.nextStep || '');
      const current = String($page.variables.currentStep || 'data');
      const order = ['data', 'review', 'submit', 'result'];

      // Derniere etape : le bouton de fin du template (Submit) ne designe
      // aucune etape suivante. Le dossier se termine, si le job est fini.
      if (current === 'result' && (!next || order.indexOf(next) === -1)) {
        const summary = $variables.loadSummary || {};
        if (!summary.finished) {
          $variables.errorText = 'Le chargement est encore en cours : attendez sa fin pour terminer le dossier.';
          return;
        }
        await Actions.callChain(context, { chain: 'finishChain' });
        await Actions.callChain(context, { chain: 'resetChain' });
        await Actions.callChain(context, { chain: 'goToStepChain', params: { step: 'start' } });
        return;
      }
      if (order.indexOf(next) === -1 || next === current) { return; }

      if ($variables.isChecking || $variables.isLoading) {
        $variables.errorText = 'Un traitement est en cours : attendez sa fin.';
        return;
      }
      $variables.errorText = '';

      const forward = order.indexOf(next) > order.indexOf(current);

      if (!forward) {
        // Revenir en arriere ne perd rien : le dossier reste dans le flux.
        if (current === 'submit' || current === 'result') {
          await Actions.callChain(context, { chain: 'backToPlanChain' });
        }
        await Actions.callChain(context, { chain: 'goToStepChain', params: { step: next } });
        return;
      }

      if (next === 'review') {
        if (!($variables.sheets || []).length) {
          $variables.errorText = 'Deposez au moins un fichier avant de controler.';
          return;
        }
        await Actions.callChain(context, { chain: 'checkPlanChain', params: { ask: true } });
        await Actions.callChain(context, { chain: 'goToStepChain', params: { step: 'review' } });
        await Actions.callChain(context, { chain: 'askAgentChain' });
        return;
      }

      if (next === 'submit') {
        if ($variables.step !== 'submit' || $variables.countIssues) {
          $variables.errorText = 'Le dossier doit passer un controle sans anomalie bloquante '
            + 'avant de charger. Corrigez, puis recontrolez.';
          return;
        }
        await Actions.callChain(context, { chain: 'goToStepChain', params: { step: 'submit' } });
        return;
      }

      // next === 'result'
      if (!$variables.requestId) {
        $variables.errorText = 'Rien n\'a encore ete envoye : utilisez "Charger dans Oracle", '
          + 'puis confirmez.';
        return;
      }
      await Actions.callChain(context, { chain: 'goToStepChain', params: { step: 'result' } });
    }
  }

  return stepNavigateChain;
});
