define([
  'vb/action/actionChain',
  'vb/action/actions',
  'hcmloaderagent/resources/js/hdlEngine'
], (ActionChain, Actions, hdlEngine) => {
  'use strict';

  /**
   * Rend le fichier .dat que l'utilisateur chargera lui-meme, par le chemin
   * Oracle habituel. C'est la seconde sortie de l'etape de validation : soit la
   * page charge pour vous, soit elle vous rend le fichier.
   */
  class downloadDatChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      const columns = $variables.columns || [];
      const rows = $variables.rows || [];
      if (!rows.length) { return; }

      try {
        const content = hdlEngine.buildHdlContent({
          businessObject: $variables.businessObject,
          columns,
          rows: rows.map((row) => {
            const values = {};
            columns.forEach((name) => { values[name] = row[name]; });
            return { instruction: 'MERGE', values };
          })
        });

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${$variables.businessObject}.dat`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        $variables.loadStatus = `Fichier ${$variables.businessObject}.dat produit. `
          + 'Placez-le dans une archive .zip avant de le deposer dans HCM Data Loader.';
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('downloadDatChain: erreur =', error);
        $variables.errorText = 'Le fichier .dat n\'a pas pu etre produit.';
      }
    }
  }

  return downloadDatChain;
});
