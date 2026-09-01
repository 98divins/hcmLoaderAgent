define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Generation du contenu HDL en ligne, pour la meme raison que dans
  // submitLoadChain : une dependance AMD non resolue rend la chaine muette.


  /** HDL attend yyyy/MM/dd ; la saisie et les CSV arrivent en yyyy-MM-dd. */
  function toHdlDate(value) {
    return (value || '').replace(/-/g, '/');
  }

  /**
   * Une valeur ne doit pas casser le découpage par pipe ni la structure en
   * lignes. HDL n'ayant pas d'échappement du séparateur, on neutralise.
   */
  function sanitizeValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[|]/g, ' ').replace(/[\r\n]+/g, ' ');
  }

  const DATE_FIELD_PATTERN = /Date$/;

  /**
   * Génère le contenu .dat à partir d'un plan de chargement.
   *
   * @param {Object} plan
   * @param {string} plan.businessObject  nom de l'objet métier HDL, ex. "Location"
   * @param {string[]} plan.columns       ordre des colonnes du fichier
   * @param {Object[]} plan.rows          lignes { instruction, values }
   * @returns {string} contenu du fichier .dat
   */
  function buildHdlContent(plan) {
    if (!plan || !plan.businessObject) {
      throw new Error('buildHdlContent: businessObject manquant dans le plan.');
    }
    if (!Array.isArray(plan.columns) || plan.columns.length === 0) {
      throw new Error('buildHdlContent: colonnes manquantes dans le plan.');
    }

    const object = plan.businessObject;
    const rows = Array.isArray(plan.rows) ? plan.rows : [];

    const lines = [['METADATA', object].concat(plan.columns).join('|')];

    rows.forEach((row, index) => {
      const instruction = row.instruction || 'MERGE';
      const values = row.values || {};
      const cells = plan.columns.map((column) => {
        const raw = values[column];
        return sanitizeValue(DATE_FIELD_PATTERN.test(column) ? toHdlDate(raw) : raw);
      });
      if (cells.every((cell) => cell === '')) {
        throw new Error(`buildHdlContent: la ligne ${index + 1} est entièrement vide.`);
      }
      lines.push([instruction, object].concat(cells).join('|'));
    });

    // HDL lit des fichiers à fins de ligne CRLF, terminés par un saut de ligne.
    return lines.join('\r\n') + '\r\n';
  }

  class downloadDatChain extends ActionChain {

    /**
     * Rend le fichier .dat que l'utilisateur chargera lui-meme, par le chemin
     * Oracle habituel. C'est la seconde sortie de l'etape de validation : soit
     * la page charge pour vous, soit elle vous rend le fichier.
     *
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
        const content = buildHdlContent({
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
