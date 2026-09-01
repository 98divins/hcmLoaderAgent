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
  // Format francais : 01/03/2026 se lit 1er mars. L'ambiguite avec le format
  // americain est reelle, la proposition le dit donc explicitement.
  const DATE_FR = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;

  /**
   * Corrections que le code etablit lui-meme, sans passer par l'agent : une
   * date a remettre au format attendu, ou une valeur absente que toutes les
   * autres lignes portent a l'identique. Deterministe, immediat, gratuit, et
   * surtout disponible meme quand l'agent ne propose rien.
   */
  function deriveFixes(rows, columns, rules) {
    const fixes = [];

    // Une colonne dont toutes les lignes renseignees portent la meme valeur :
    // une ligne vide se comble sans risque d'invention.
    const single = {};
    rules.keyColumns.concat(rules.requiredColumns).forEach((name) => {
      if (columns.indexOf(name) === -1 || single[name] !== undefined) { return; }
      const seen = [];
      rows.forEach((row) => {
        const value = String(row[name] || '').trim();
        if (value && seen.indexOf(value) === -1) { seen.push(value); }
      });
      single[name] = (seen.length === 1) ? seen[0] : null;
    });

    rows.forEach((row) => {
      columns.forEach((name) => {
        const raw = String(row[name] || '').trim();

        if (!raw && single[name]) {
          fixes.push({
            rowRef: row.rowKey,
            field: name,
            suggestedValue: single[name],
            rationale: `toutes les autres lignes portent "${single[name]}"`
          });
          return;
        }

        if (raw && DATE_COLUMN.test(name) && !DATE_OK.test(raw)) {
          const parts = DATE_FR.exec(raw);
          if (parts) {
            fixes.push({
              rowRef: row.rowKey,
              field: name,
              suggestedValue: `${parts[3]}/${parts[2]}/${parts[1]}`,
              rationale: `"${raw}" lu comme jj/mm/aaaa`
            });
          }
        }
      });
    });

    return fixes;
  }

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
    async run(context, { event, ask } = {}) {
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
      // Le rail suit l'etat reel du dossier : un plan sans anomalie est arrive
      // a l'etape de chargement, il n'y a plus rien a controler.
      $variables.step = issueCount ? 'review' : 'submit';

      // Ces corrections ne dependent d'aucun modele : elles sont disponibles des
      // la fin du controle, et restent la meme si l'assistant ne propose rien.
      const fixes = deriveFixes(checked, columns, rules);
      $variables.hasAutoFix = fixes.length > 0;
      $variables.autoFixJson = fixes.length ? JSON.stringify({ display: 'issues', rows: fixes }) : '';
      $variables.autoFixText = fixes
        .map((f) => `${f.rowRef} · ${f.field} = "${f.suggestedValue}"\n    ${f.rationale}`)
        .join('\n');
      $variables.errorText = missingKeys.length
        ? `Colonnes de cle absentes du fichier : ${missingKeys.join(', ')}. `
          + 'Sans elles, aucune ligne ne peut etre identifiee.'
        : '';

      // Le controle enchaine sur l'analyse de l'agent quand il est declenche par
      // l'utilisateur : c'est la chaine suivante du meme listener qui la lance,
      // en lisant cette question. Apres une application de corrections, le
      // controle sert seulement a rafraichir les etats : solliciter l'agent
      // ferait attendre plusieurs secondes pour rien.
      $variables.question = (ask !== false && issueCount)
        ? 'Analyse des anomalies relevees par le controle : quelles lignes posent '
          + 'probleme, et quelles corrections sont applicables ?'
        : '';

      const clean = rows.length - issueCount;
      const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
      const state = issueCount
        ? `${plural(clean, 'ligne')} ${clean > 1 ? 'saines' : 'saine'} · ${issueCount} a corriger`
        : `${plural(rows.length, 'ligne')} ${rows.length > 1 ? 'saines' : 'saine'}`;
      const note = $variables.appliedNote || '';
      $variables.appliedNote = '';
      $variables.summaryText = note ? `${note} · ${state}` : state;
    }
  }

  return checkPlanChain;
});
