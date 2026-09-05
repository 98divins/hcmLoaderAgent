define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Ramene le dossier a l'etape de controle apres un chargement, pour corriger
   * les lignes rejetees et recharger. Le plan et la conversation sont
   * conserves : c'est le meme dossier qui continue, pas un nouveau.
   */
  class backToPlanChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      // Les lignes que le tenant a acceptees restent marquees chargees : le
      // prochain envoi ne portera que les autres. Recontroler le dossier reste
      // necessaire, c'est lui qui rouvre la voie au chargement.
      $variables.step = 'review';
      $variables.loadStatus = '';
      $variables.loadDetail = '';
      $variables.loadPhases = [];
      $variables.errorText = '';
    }
  }

  return backToPlanChain;
});
