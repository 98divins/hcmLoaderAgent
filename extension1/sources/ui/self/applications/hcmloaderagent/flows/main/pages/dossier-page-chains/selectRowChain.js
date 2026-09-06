define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Une ligne selectionnee dans la grille ouvre le formulaire de correction :
   * un champ par colonne, prerempli avec la ligne telle qu'elle est.
   */
  class selectRowChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event  firstSelectedRowChanged, detail.value = { key, data }
     */
    async run(context, { event } = {}) {
      // L'etat du dossier vit dans le flux : la page n'en montre qu'une etape.
      const $variables = context.$flow.variables;
      const { $page } = context;
      const value = (event && event.detail && event.detail.value) || {};
      const key = value.key;
      if (key === null || key === undefined) { return; }

      const sheet = ($variables.sheets || [])[$variables.activeSheet || 0];
      const row = sheet ? (sheet.rows || []).filter((r) => r.rowKey === key)[0] : null;
      if (!row) { return; }

      const spec = (($variables.objectCatalog || {}).objects || {})[sheet.object] || {};
      const keys = (spec.userKey || []).filter((k) => (sheet.columns || []).indexOf(k) !== -1);
      const label = keys.map((k) => String(row[k] || '')).filter((v) => v).join(' / ') || String(key);

      $page.variables.editColumns = (sheet.columns || []).map((name) => ({
        name, value: row[name] === undefined || row[name] === null ? '' : String(row[name])
      }));
      $page.variables.editLabel = label;
      $page.variables.editDetail = row.statusDetail || '';
      $page.variables.editKey = String(key);
    }
  }

  return selectRowChain;
});
