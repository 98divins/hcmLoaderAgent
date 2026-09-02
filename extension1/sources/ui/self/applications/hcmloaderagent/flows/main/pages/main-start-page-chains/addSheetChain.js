define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Ajoute au dossier une feuille pour un objet de la hierarchie.
   *
   * L'objet doit appartenir a la hierarchie du dossier et autoriser l'operation
   * du dossier : le catalogue tranche, le code ne devine pas.
   */
  class addSheetChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Event} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      const target = event && event.target;
      const node = target && target.closest ? target.closest('[data-object]') : null;
      if (!node) { return; }

      const name = node.getAttribute('data-object');
      const catalog = $variables.objectCatalog || {};
      const spec = (catalog.objects || {})[name];
      const tree = (catalog.hierarchies || {})[$variables.hierarchy] || {};
      const belongs = name === tree.top || (tree.children || []).indexOf(name) !== -1;

      if (!spec || !belongs) { return; }
      if ((spec.validOperations || []).indexOf($variables.operation) === -1) { return; }

      $variables.armedAction = '';
      const sheets = ($variables.sheets || []).slice();
      if (sheets.some((sheet) => sheet.object === name)) {
        $variables.activeSheet = sheets.map((s) => s.object).indexOf(name);
        return;
      }

      sheets.push({
        object: name,
        label: spec.uiName || name,
        level: spec.level,
        fileName: '',
        columns: [],
        rows: [],
        countIssues: 0,
        countWarnings: 0,
        statusLabel: 'aucune donnee'
      });

      // Le parent d'abord, puis les enfants : c'est l'ordre dans lequel HDL
      // traite le fichier, et celui dans lequel on veut les lire.
      sheets.sort((a, b) => (a.level === 'top' ? 0 : 1) - (b.level === 'top' ? 0 : 1));

      $variables.sheets = sheets;
      $variables.activeSheet = sheets.map((s) => s.object).indexOf(name);
    }
  }

  return addSheetChain;
});
