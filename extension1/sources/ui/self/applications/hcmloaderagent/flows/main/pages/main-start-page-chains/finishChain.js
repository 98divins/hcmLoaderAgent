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
      $variables.armedAction = '';
      $variables.step = 'done';
      $variables.errorText = '';
      $variables.question = '';
    }
  }

  return finishChain;
});
