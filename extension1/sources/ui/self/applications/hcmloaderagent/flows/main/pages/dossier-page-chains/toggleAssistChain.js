define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Ouvre ou replie le panneau d'assistance. Replie, il rend sa largeur a la
   * grille : c'est ce qui permet de voir toutes les colonnes d'un objet metier
   * qui en porte beaucoup.
   */
  class toggleAssistChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      $variables.assistOpen = !$variables.assistOpen;
    }
  }

  return toggleAssistChain;
});
