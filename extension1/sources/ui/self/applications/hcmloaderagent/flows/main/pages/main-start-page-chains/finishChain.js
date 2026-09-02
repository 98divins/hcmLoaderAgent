define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Clot le dossier. Un chargement a une fin : l'utilisateur doit la voir, et
   * savoir ce qui a ete fait. Le dossier reste lisible jusqu'a "Nouveau
   * dossier", mais plus rien ne peut partir.
   */
  class finishChain extends ActionChain {

    async run(context) {
      const { $variables } = context;
      $variables.aborted = true;
      const s = $variables.loadSummary || {};
      const parts = [`Dossier ${$variables.hierarchy} termine`];
      if ($variables.requestId) { parts.push(`RequestId ${$variables.requestId}`); }
      if (s.finished && s.accepted !== null && s.accepted !== undefined) {
        parts.push(`${s.accepted} ligne${s.accepted > 1 ? 's' : ''} acceptee${s.accepted > 1 ? 's' : ''}`
          + (s.rejected ? `, ${s.rejected} rejetee${s.rejected > 1 ? 's' : ''}` : ''));
      }
      // Le bilan survit a la remise a zero qui suit : c'est le seul souvenir
      // qu'on garde du dossier, sur l'ecran d'accueil.
      $variables.lastDossier = parts.join(' · ');
    }
  }

  return finishChain;
});
