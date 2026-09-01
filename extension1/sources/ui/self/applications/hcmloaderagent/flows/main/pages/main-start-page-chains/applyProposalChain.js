define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Applique une proposition de l'agent au plan. Rien n'est applique sans ce
   * geste : l'agent propose, l'utilisateur decide, le code execute.
   *
   * Une proposition ne peut toucher que des lignes et des colonnes qui existent
   * deja dans le plan. Une reference inconnue est ignoree, pas creee : c'est ce
   * qui empeche une reponse fantaisiste d'introduire des donnees.
   */
  class applyProposalChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      if (!$variables.hasProposal) { return; }

      let proposal;
      try {
        proposal = JSON.parse($variables.proposalJson || '{}');
      } catch (e) {
        $variables.errorText = 'La proposition est illisible, elle n\'a pas ete appliquee.';
        return;
      }

      const columns = ($variables.columns || []).slice();
      let rows = ($variables.rows || []).slice();
      let applied = 0;
      let skipped = 0;

      // Un diagnostic post-chargement porte les memes corrections qu'une
      // anomalie, sous une autre forme : on le ramene a la forme commune.
      const asIssues = (proposal.display === 'diagnosis' && Array.isArray(proposal.rows))
        ? proposal.rows
          .filter((r) => r && r.suggestedFix && r.suggestedFix.field)
          .map((r) => ({ rowRef: r.rowRef, field: r.suggestedFix.field,
            suggestedValue: r.suggestedFix.value }))
        : proposal.rows;

      if ((proposal.display === 'issues' || proposal.display === 'diagnosis')
          && Array.isArray(asIssues)) {
        const byKey = {};
        asIssues.forEach((item) => {
          if (!item || !item.rowRef || !item.field) { skipped += 1; return; }
          if (columns.indexOf(item.field) === -1) { skipped += 1; return; }
          byKey[item.rowRef] = item;
        });
        const matched = {};
        rows = rows.map((row) => {
          const item = byKey[row.rowKey];
          if (!item) { return row; }
          matched[row.rowKey] = true;
          applied += 1;
          const next = Object.assign({}, row);
          next[item.field] = item.suggestedValue === undefined ? '' : String(item.suggestedValue);
          next.statusLabel = 'a controler';
          return next;
        });
        // Une reference de ligne qui ne correspond a rien doit etre comptee :
        // silencieusement ignoree, elle laisserait croire a une correction faite.
        Object.keys(byKey).forEach((key) => { if (!matched[key]) { skipped += 1; } });
      } else if (proposal.display === 'mapping' && Array.isArray(proposal.pairs)) {
        // Renommer une colonne revient a renommer la meme cle sur chaque ligne.
        const renames = proposal.pairs.filter((p) => p && p.source && p.target
          && columns.indexOf(p.source) !== -1 && columns.indexOf(p.target) === -1);
        skipped = proposal.pairs.length - renames.length;
        renames.forEach((pair) => {
          const index = columns.indexOf(pair.source);
          columns[index] = pair.target;
          applied += 1;
        });
        rows = rows.map((row) => {
          const next = Object.assign({}, row);
          renames.forEach((pair) => {
            next[pair.target] = next[pair.source];
            delete next[pair.source];
          });
          next.statusLabel = 'a controler';
          return next;
        });
      } else {
        $variables.errorText = 'Cette proposition n\'est pas d\'un type applicable.';
        return;
      }

      $variables.columns = columns;
      $variables.rows = rows;
      $variables.hasProposal = false;
      $variables.proposalText = '';
      $variables.proposalJson = '';
      const mark = applied > 1 ? 's' : '';
      $variables.summaryText = `${applied} modification${mark} appliquee${mark}`
        + (skipped ? `, ${skipped} ignoree${skipped > 1 ? 's' : ''} car hors du plan` : '')
        + '. Relancez le controle.';
    }
  }

  return applyProposalChain;
});
