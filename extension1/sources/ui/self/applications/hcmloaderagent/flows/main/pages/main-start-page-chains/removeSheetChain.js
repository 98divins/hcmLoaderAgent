define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Retire la feuille selectionnee du dossier.
   *
   * Une feuille vide part au premier clic. Une feuille qui porte des lignes
   * demande une confirmation : le premier clic arme, le second retire. Le
   * dossier garde au moins une feuille, sinon il n'a plus d'objet.
   */
  class removeSheetChain extends ActionChain {

    async run(context) {
      const { $variables } = context;
      const sheets = ($variables.sheets || []).slice();
      const index = $variables.activeSheet || 0;
      const sheet = sheets[index];
      if (!sheet) { return; }

      if (sheets.length === 1) {
        $variables.errorText = 'Un dossier garde au moins une feuille. Pour changer '
          + "d'objet, ouvrez un nouveau dossier.";
        return;
      }

      const hasRows = (sheet.rows || []).length > 0;
      if (hasRows && $variables.armedAction !== 'removeSheet') {
        $variables.armedAction = 'removeSheet';
        return;
      }

      sheets.splice(index, 1);
      $variables.sheets = sheets;
      $variables.activeSheet = Math.max(0, Math.min(index, sheets.length - 1));
      $variables.armedAction = '';
      $variables.checkSummary = {};
      $variables.errorText = '';

      // Le dossier a change : ce qui avait ete controle ne l'est plus.
      const total = sheets.reduce((sum, s) => sum + (s.rows || []).length, 0);
      $variables.countTotal = total;
      $variables.countIssues = 0;
      $variables.step = 'data';
      $variables.summaryText = hasRows
        ? `Feuille ${sheet.label} retiree, ${sheet.rows.length} ligne`
          + `${sheet.rows.length > 1 ? 's' : ''} ecartee${sheet.rows.length > 1 ? 's' : ''}`
        : `Feuille ${sheet.label} retiree`;
    }
  }

  return removeSheetChain;
});
