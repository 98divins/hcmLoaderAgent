define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Validation explicite d'une ligne en edition. Les champs de la ligne sont
   * lus dans la grille, ecrits dans la ligne du dossier, puis la grille sort
   * de l'edition. Ne depend ni de la touche Entree ni de l'evenement de fin
   * d'edition, qui reste un second chemin, sans effet s'il repasse.
   */
  class commitRowChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {boolean} params.discard  true : abandonner la saisie
     */
    async run(context, { discard } = {}) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      const { $page } = context;
      const editing = $page.variables.editRow || {};
      const key = editing.rowKey;

      if (!discard && key !== null && key !== undefined) {
        const sheets = ($variables.sheets || []).slice();
        const index = $variables.activeSheet || 0;
        const sheet = sheets[index];
        const row = sheet ? (sheet.rows || []).filter((r) => r.rowKey === key)[0] : null;
        const grid = document.getElementById('hdl-grid');
        if (row && grid) {
          const inputs = grid.querySelectorAll('[data-column]');
          for (let i = 0; i < inputs.length; i += 1) {
            const column = inputs[i].getAttribute('data-column');
            const typed = (inputs[i].rawValue !== undefined && inputs[i].rawValue !== null)
              ? inputs[i].rawValue : inputs[i].value;
            if (column && typed !== undefined && (sheet.columns || []).indexOf(column) !== -1) {
              row[column] = typed === null ? '' : String(typed);
            }
          }
          row.statusLabel = 'a controler';
          row.etat = 'A controler';
          row.statusDetail = '';
          row.matchLabel = '';
          row.loaded = false;
          sheets[index] = Object.assign({}, sheet, { rows: (sheet.rows || []).slice() });
          $variables.sheets = sheets;
          $variables.armedAction = '';
          if ($variables.step === 'submit') { $variables.step = 'review'; }
          $variables.summaryText = 'Ligne modifiee : recontrolez le dossier avant de charger.';
        }
      }

      // Sortie de l'edition. L'evenement de fin d'edition qui suit ne doit
      // rien ecrire : la ligne est deja a jour, ou la saisie est abandonnee.
      $page.variables.discardEdit = true;
      $page.variables.editRow = { rowKey: null };
    }
  }

  return commitRowChain;
});
