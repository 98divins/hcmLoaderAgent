define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Ce que l'on sait d'un objet metier, tant que les metadonnees ne sont pas
   * lues a l'execution (cf. docs/ARCHITECTURE-AGENT-HDL.md 8.2). Chaque entree
   * vient d'une erreur reelle du moteur HDL, pas d'une supposition.
   */
  const OBJECT_RULES = {
    Location: {
      keyColumns: ['LocationCode', 'SetCode'],
      requiredColumns: ['LocationCode', 'SetCode', 'EffectiveStartDate', 'LocationName']
    }
  };

  const DATE_COLUMN = /Date$/;
  // HDL attend yyyy/MM/dd ; on accepte la saisie ISO, convertie a la generation.
  const DATE_OK = /^\d{4}[/-]\d{2}[/-]\d{2}$/;

  /**
   * Controles deterministes, faits par le code et non par l'agent : une regle
   * verifiable ne se demande pas a un modele. L'agent intervient ensuite, sur
   * ce que ces controles ne savent pas juger.
   */
  function checkRow(row, columns, rules) {
    const issues = [];

    rules.keyColumns.forEach((key) => {
      if (columns.indexOf(key) === -1) { return; }
      if (!String(row[key] || '').trim()) {
        issues.push(`${key} vide : sans lui la ligne n'a pas de reference unique`);
      }
    });

    rules.requiredColumns.forEach((name) => {
      if (columns.indexOf(name) === -1) { return; }
      if (rules.keyColumns.indexOf(name) !== -1) { return; }
      if (!String(row[name] || '').trim()) {
        issues.push(`${name} vide`);
      }
    });

    columns.forEach((name) => {
      if (!DATE_COLUMN.test(name)) { return; }
      const value = String(row[name] || '').trim();
      if (value && !DATE_OK.test(value)) {
        issues.push(`${name} : "${value}" n'est pas une date aaaa/mm/jj`);
      }
    });

    return issues;
  }

  class checkPlanChain extends ActionChain {

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

      const rules = OBJECT_RULES[$variables.businessObject];
      if (!rules) {
        $variables.errorText = `Les regles de l'objet ${$variables.businessObject} ne sont `
          + 'pas connues. Demandez a l\'assistant les colonnes attendues.';
        return;
      }

      // Une colonne de cle absente du fichier concerne tout le plan, pas une
      // ligne : c'est un defaut de structure, signale a part.
      const missingKeys = rules.keyColumns.filter((key) => columns.indexOf(key) === -1);

      let issueCount = 0;
      const checked = rows.map((row) => {
        const issues = checkRow(row, columns, rules);
        const next = Object.assign({}, row);
        if (missingKeys.length || issues.length) { issueCount += 1; }
        next.statusLabel = issues.length ? issues.join(' · ') : 'ok';
        return next;
      });

      $variables.rows = checked;
      $variables.countIssues = issueCount;
      $variables.step = 'review';
      $variables.errorText = missingKeys.length
        ? `Colonnes de cle absentes du fichier : ${missingKeys.join(', ')}. `
          + 'Sans elles, aucune ligne ne peut etre identifiee.'
        : '';

      // Le controle enchaine sur l'analyse de l'agent : c'est la chaine suivante
      // du meme listener qui la lance, en lisant cette question. Sans anomalie,
      // la question reste vide et l'agent n'est pas sollicite pour rien.
      $variables.question = issueCount
        ? 'Analyse des anomalies relevees par le controle : quelles lignes posent '
          + 'probleme, et quelles corrections sont applicables ?'
        : '';

      const clean = rows.length - issueCount;
      const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
      $variables.summaryText = issueCount
        ? `${plural(clean, 'ligne')} ${clean > 1 ? 'saines' : 'saine'} · ${issueCount} a corriger`
        : `${plural(rows.length, 'ligne')} ${rows.length > 1 ? 'saines' : 'saine'}`;
    }
  }

  return checkPlanChain;
});
