define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Fin d'edition d'une ligne dans la grille.
   *
   * La cellule est liee en double sens a la ligne du dossier : la valeur est
   * deja ecrite quand l'evenement arrive. Par securite, les champs encore
   * presents dans la ligne sont relus, colonne par colonne. Ensuite la ligne
   * repasse "a controler" : ce qui a change n'est plus verifie, et une ligne
   * deja acceptee par Oracle qu'on modifie devra repartir.
   */
  class rowEditChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Event} params.event  ojBeforeRowEditEnd de la grille
     */
    async run(context, { event } = {}) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      const detail = (event && event.detail) || {};
      if (detail.cancelEdit) { return; }

      // oj-table designe la ligne par rowContext.status.rowKey ; oj-c-table par
      // item.metadata.key ; a defaut, le champ edite porte la cle (data-row).
      const rc = detail.rowContext || {};
      let key = (rc.status && rc.status.rowKey !== undefined) ? rc.status.rowKey
        : (rc.item && rc.item.metadata ? rc.item.metadata.key : null);
      if ((key === null || key === undefined) && event.target && event.target.querySelector) {
        const first = event.target.querySelector('[data-row]');
        key = first ? first.getAttribute('data-row') : null;
      }
      if (key === null || key === undefined) { return; }

      const sheets = ($variables.sheets || []).slice();
      const index = $variables.activeSheet || 0;
      const sheet = sheets[index];
      if (!sheet) { return; }
      const row = (sheet.rows || []).filter((r) => r.rowKey === key)[0];
      if (!row) { return; }

      // Relecture des champs de la ligne, si la liaison n'a pas ecrit.
      const target = event.target;
      if (target && target.querySelectorAll) {
        const inputs = target.querySelectorAll('[data-column]');
        for (let i = 0; i < inputs.length; i += 1) {
          const column = inputs[i].getAttribute('data-column');
          // rawValue suit la frappe ; value n'est ecrit qu'a la validation du
          // champ, qui peut arriver apres cet evenement : on prend le plus frais.
          const typed = (inputs[i].rawValue !== undefined && inputs[i].rawValue !== null)
            ? inputs[i].rawValue : inputs[i].value;
          if (column && typed !== undefined && (sheet.columns || []).indexOf(column) !== -1) {
            row[column] = typed === null ? '' : String(typed);
          }
        }
      }

      row.statusLabel = 'a controler';
      row.etat = 'A controler';
      row.statusDetail = '';
      row.matchLabel = '';
      row.loaded = false;

      $variables.sheets = sheets;
      $variables.armedAction = '';
      if ($variables.step === 'submit') { $variables.step = 'review'; }
      $variables.summaryText = 'Ligne modifiee : recontrolez le dossier avant de charger.';
    }
  }

  return rowEditChain;
});
