define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Un dossier porte une seule operation, pour toutes ses feuilles.
   *
   * HDL ne connait que deux instructions : MERGE cree l'enregistrement s'il est
   * absent et le met a jour s'il existe, DELETE le supprime. "Creer" et "mettre
   * a jour" ne sont donc pas deux operations distinctes dans le fichier ; ce que
   * chaque ligne fera reellement, c'est le rapprochement du controle qui le dit.
   */
  class pickOperationChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {string} params.operation  MERGE ou DELETE
     */
    async run(context, { operation } = {}) {
      const { $variables } = context;
      if (operation !== 'MERGE' && operation !== 'DELETE') { return; }
      $variables.operation = operation;

      // Changer d'operation change la liste des feuilles possibles : celles que
      // l'objet n'autorise pas dans cette operation quittent le dossier plutot
      // que d'y rester avec des lignes qui seraient rejetees.
      const catalog = $variables.objectCatalog || {};
      const sheets = ($variables.sheets || []).filter((sheet) => {
        const spec = (catalog.objects || {})[sheet.object] || {};
        return (spec.validOperations || []).indexOf(operation) !== -1;
      });
      if (sheets.length !== ($variables.sheets || []).length) {
        $variables.sheets = sheets;
        $variables.activeSheet = 0;
      }
    }
  }

  return pickOperationChain;
});
