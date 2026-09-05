define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Choix de la hierarchie d'objets metier, avant tout import.
   *
   * C'est ce choix qui fixe les colonnes attendues, les feuilles que le dossier
   * pourra contenir et les operations permises. Changer de hierarchie vide donc
   * le dossier : les donnees d'un site n'ont aucun sens sur une organisation.
   */
  class pickHierarchyChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {string} params.hierarchy  ou l'evenement d'un clic sur une carte
     * @param {Event} params.event
     */
    async run(context, { hierarchy, event } = {}) {
      const { $variables } = context;
      const catalog = $variables.objectCatalog || {};
      // Les cartes sont rendues par une boucle, et $listeners n'est pas resolu
      // dans un <template> : le clic est ecoute sur le conteneur, et la carte
      // cliquee porte son identifiant.
      let wanted = hierarchy;
      if (!wanted && event && event.target && event.target.closest) {
        const node = event.target.closest('[data-hierarchy]');
        wanted = node ? node.getAttribute('data-hierarchy') : '';
      }
      const tree = (catalog.hierarchies || {})[wanted];
      if (!tree) { return; }

      $variables.hierarchy = wanted;
      $variables.sheets = [];
      $variables.activeSheet = 0;
      $variables.errorText = '';
      $variables.summaryText = '';

      // Aucun objet de la hierarchie n'acceptant la suppression, l'operation
      // selectionnee deviendrait impossible : on retombe sur MERGE plutot que
      // de laisser ouvrir un dossier qui ne pourrait porter aucune feuille.
      const names = [tree.top].concat(tree.children || []);
      const anyDelete = names.some((name) => {
        const spec = (catalog.objects || {})[name] || {};
        return (spec.validOperations || []).indexOf('DELETE') !== -1;
      });
      if ($variables.operation === 'DELETE' && !anyDelete) {
        $variables.operation = 'MERGE';
      }
    }
  }

  return pickHierarchyChain;
});
