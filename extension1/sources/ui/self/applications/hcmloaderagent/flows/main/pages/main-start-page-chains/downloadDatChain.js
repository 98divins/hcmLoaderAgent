define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Generation du contenu HDL en ligne, pour la meme raison que dans
  // submitLoadChain : une dependance AMD non resolue rend la chaine muette.
  // Toute correction ici doit etre reportee la-bas.

  /** HDL attend aaaa/mm/jj ; la saisie et les CSV arrivent en aaaa-mm-jj. */
  function toHdlDate(value) {
    return String(value || '').replace(/-/g, '/');
  }

  /**
   * Une valeur ne doit casser ni le decoupage par pipe ni la structure en
   * lignes. HDL n'ayant pas d'echappement du separateur, on neutralise.
   */
  function sanitizeValue(value) {
    if (value === null || value === undefined) { return ''; }
    return String(value).replace(/[|]/g, ' ').replace(/[\r\n]+/g, ' ');
  }

  /** Une cle source doit survivre a un aller-retour dans un fichier texte. */
  function slug(text) {
    return String(text === null || text === undefined ? '' : text)
      .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  /**
   * Identifiant source d'un enregistrement, deduit de sa cle utilisateur.
   *
   * Le parent et l'enfant doivent produire la meme chaine pour le meme
   * enregistrement : ils passent donc la meme liste de colonnes dans le meme
   * ordre, chacun avec les noms que porte SA feuille. C'est ce que garantit
   * l'ordre des colonnes declare dans le catalogue, cote parent comme cote
   * enfant.
   */
  function sourceIdFor(objectName, keyColumns, row) {
    return `${slug(objectName)}_${keyColumns.map((name) => slug(row[name])).join('_')}`;
  }

  function dateColumns(spec) {
    const dates = {};
    (spec.attributes || []).forEach((attribute) => {
      if (attribute.type === 'date') { dates[attribute.name] = true; }
    });
    return dates;
  }

  /**
   * Fabrique le .dat du dossier : une ligne METADATA par feuille, puis ses
   * lignes de donnees. HDL traite les parents avant les enfants d'apres le
   * niveau hierarchique, l'ordre des blocs n'a donc pas a etre gere ici.
   *
   * Les cles source ne sont posees que lorsque le dossier porte plusieurs
   * feuilles : c'est le seul cas ou l'enfant a besoin de designer son parent.
   * Un dossier a une feuille produit le meme fichier qu'avant, celui dont les
   * chargements reels ont valide le format.
   */
  function buildDossierContent(catalog, hierarchy, operation, sheets, options) {
    const opts = options || {};
    // Les lignes deja acceptees par le tenant ne repartent pas : apres un
    // chargement partiel, seul le reste est renvoye.
    const used = (sheets || [])
      .map((sheet) => Object.assign({}, sheet, {
        rows: (sheet.rows || []).filter((row) => !row.loaded)
      }))
      .filter((sheet) => sheet.rows.length);
    if (!used.length) { throw new Error('buildDossierContent: aucune ligne a charger.'); }

    // Les cles source ne s'ecrivent que si le proprietaire HDLAGENT est
    // enregistre dans le tenant : sinon HDL rejette chaque ligne. Sans elles,
    // les colonnes de cle du parent, presentes sur l'enfant, font le lien.
    const linked = Boolean(opts.sourceKeys) && used.length > 1;
    const owner = 'HDLAGENT';
    const lines = [`COMMENT Data for Business Object: ${hierarchy}`];
    const lineIndex = [];

    used.forEach((sheet) => {
      const spec = (catalog.objects || {})[sheet.object];
      if (!spec) {
        throw new Error(`buildDossierContent: objet ${sheet.object} absent du catalogue.`);
      }
      const columns = (sheet.columns || []).slice();
      if (!columns.length) {
        throw new Error(`buildDossierContent: la feuille ${sheet.label} n'a pas de colonnes.`);
      }
      const dates = dateColumns(spec);
      const parent = spec.parent;

      // Le rattachement par cle source n'est ecrit que si chaque ligne de la
      // feuille designe un parent cree dans ce meme dossier : une cle source qui
      // n'existe pas encore dans le tenant ne se resout pas, et la ligne serait
      // rejetee. Dans tous les autres cas, les colonnes de cle du parent, deja
      // presentes sur l'enfant, suffisent : HDL traite les parents d'abord.
      const bySource = Boolean(linked && parent
        && (sheet.rows || []).every((row) => row.matchLabel === 'parent cree dans ce dossier'));

      const header = columns.slice();
      if (linked) {
        header.push('SourceSystemOwner', 'SourceSystemId');
        if (bySource) { header.push(`${parent.column}(SourceSystemId)`); }
      }
      lines.push(['METADATA', sheet.object].concat(header).join('|'));

      sheet.rows.forEach((row, index) => {
        const cells = columns.map((name) => sanitizeValue(
          dates[name] ? toHdlDate(row[name]) : row[name]));
        if (cells.every((cell) => cell === '')) {
          throw new Error(`buildDossierContent: ${sheet.label}, ligne ${index + 1} vide.`);
        }
        if (linked) {
          cells.push(owner, sourceIdFor(sheet.object, spec.userKey || [], row));
          if (bySource) {
            cells.push(sourceIdFor(parent.object, parent.userKey || [], row));
          }
        }
        lines.push([operation, sheet.object].concat(cells).join('|'));
        // Numero de ligne dans le fichier : c'est ainsi que HDL designe une
        // ligne rejetee, et c'est ce qui permet de la retrouver dans le dossier.
        lineIndex.push({ object: sheet.object, rowKey: row.rowKey, line: lines.length });
      });
    });

    // HDL lit des fichiers a fins de ligne CRLF, termines par un saut de ligne.
    return { content: lines.join('\r\n') + '\r\n', lineIndex };
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
      const sheets = ($variables.sheets || []).filter((sheet) => (sheet.rows || []).length);
      if (!sheets.length) { return; }

      // Meme exigence que pour le chargement : un fichier telecharge est un
      // fichier qui sera charge. Il faut un controle complet et sans anomalie,
      // pas seulement l'absence d'anomalie connue : avant le premier controle,
      // le dossier n'en connait aucune.
      if ($variables.step !== 'submit' || $variables.countIssues) {
        $variables.errorText = $variables.countIssues
          ? 'Le dossier porte encore des anomalies. Corrigez-les avant de produire le fichier.'
          : 'Controlez le dossier avant de produire le fichier.';
        return;
      }

      try {
        const fileName = `${$variables.hierarchy}.dat`;
        const built = buildDossierContent(
          $variables.objectCatalog || {},
          $variables.hierarchy,
          $variables.operation || 'MERGE',
          sheets,
          { sourceKeys: Boolean(($variables.lookupValues || {})._sourceOwner) });
        const content = built.content;

        // UTF-8 explicite : un encodage octet a octet corrompait les accents,
        // ce qui ne se voyait pas tant que les jeux d'essai etaient en ASCII.
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        const count = sheets.length;
        $variables.loadStatus = `Fichier ${fileName} produit, ${count} objet`
          + `${count > 1 ? 's' : ''}. Placez-le dans une archive .zip avant de le `
          + 'deposer dans HCM Data Loader.';
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('downloadDatChain: erreur =', error);
        $variables.errorText = `Le fichier .dat n'a pas pu etre produit : ${error.message}`;
      }
    }
  }

  return downloadDatChain;
});
