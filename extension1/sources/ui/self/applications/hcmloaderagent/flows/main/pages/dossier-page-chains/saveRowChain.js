define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Enregistre le formulaire de correction dans la ligne du dossier. Les
   * champs sont lus dans le formulaire, colonne par colonne. La ligne repasse
   * "a controler" : ce qui a change n'est plus verifie, et une ligne deja
   * acceptee par Oracle qu'on modifie devra repartir.
   */
  class saveRowChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {boolean} params.close  true : fermer sans enregistrer
     */
    async run(context, { close } = {}) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      const { $page } = context;
      const key = $page.variables.editKey;

      if (!close && key !== null && key !== undefined) {
        const sheets = ($variables.sheets || []).slice();
        const index = $variables.activeSheet || 0;
        const sheet = sheets[index];
        const row = sheet ? (sheet.rows || []).filter((r) => String(r.rowKey) === String(key))[0] : null;
        const form = document.getElementById('hdl-row-form');
        if (!row || !form) {
          $variables.errorText = 'La ligne a corriger n\'a pas ete retrouvee : fermez le formulaire et cliquez de nouveau sur la ligne.';
          return;
        }
        let changed = 0;
        const inputs = form.querySelectorAll('[data-column]');
        for (let i = 0; i < inputs.length; i += 1) {
          const column = inputs[i].getAttribute('data-column');
          // rawValue suit la frappe ; value n'est ecrit qu'a la validation du champ.
          const typed = (inputs[i].rawValue !== undefined && inputs[i].rawValue !== null)
            ? inputs[i].rawValue : inputs[i].value;
          if (!column || typed === undefined || (sheet.columns || []).indexOf(column) === -1) { continue; }
          const next = typed === null ? '' : String(typed);
          if (next !== String(row[column] === undefined || row[column] === null ? '' : row[column])) {
            row[column] = next;
            changed += 1;
          }
        }
        if (changed) {
          row.statusLabel = 'a controler';
          row.etat = 'A controler';
          row.statusDetail = '';
          row.matchLabel = '';
          row.loaded = false;
          // Un nouveau tableau de lignes : la grille recoit un nouveau
          // fournisseur de donnees et se redessine.
          sheets[index] = Object.assign({}, sheet, { rows: (sheet.rows || []).slice() });
          $variables.sheets = sheets;
          $variables.armedAction = '';
          if ($variables.step === 'submit') { $variables.step = 'review'; }
          $variables.summaryText = `Ligne ${$page.variables.editLabel} modifiee `
            + `(${changed} champ${changed > 1 ? 's' : ''}) : recontrolez le dossier avant de charger.`;
        } else {
          $variables.summaryText = 'Aucun champ modifie.';
        }
        $variables.errorText = '';
      }

      $page.variables.editKey = null;
      $page.variables.editColumns = [];
      $page.variables.editLabel = '';
      $page.variables.editDetail = '';
    }
  }

  return saveRowChain;
});
