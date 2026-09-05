define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Selection d'une feuille dans le rail.
   *
   * L'ecoute est posee sur le conteneur et non sur chaque ligne : a l'interieur
   * d'un <template>, $listeners n'est pas resolu par Visual Builder. On lit donc
   * l'index sur l'element clique, en remontant depuis la cible de l'evenement.
   */
  class selectSheetChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Event} params.event
     */
    async run(context, { event } = {}) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      const target = event && event.target;
      if (!target || !target.closest) { return; }

      const node = target.closest('[data-sheet]');
      if (!node) { return; }

      const index = parseInt(node.getAttribute('data-sheet'), 10);
      if (isNaN(index) || index < 0 || index >= ($variables.sheets || []).length) { return; }
      $variables.armedAction = '';
      $variables.activeSheet = index;
    }
  }

  return selectSheetChain;
});
