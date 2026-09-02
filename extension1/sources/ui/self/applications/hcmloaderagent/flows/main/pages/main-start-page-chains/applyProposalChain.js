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
    async run(context, { event, source } = {}) {
      const { $variables } = context;
      // Deux sources, une seule mecanique : les corrections du controle et
      // celles de l'assistant passent par les memes garde-fous.
      const auto = source === 'auto';
      if (auto ? !$variables.hasAutoFix : !$variables.hasProposal) { return; }

      let proposal;
      try {
        proposal = JSON.parse((auto ? $variables.autoFixJson : $variables.proposalJson) || '{}');
      } catch (e) {
        $variables.errorText = 'La proposition est illisible, elle n\'a pas ete appliquee.';
        return;
      }

      // Une correction designe une feuille et une ligne : dans un dossier
      // multi-feuilles, un rowKey seul est ambigu. Sans indication de feuille,
      // on applique a la feuille selectionnee, qui est celle que l'utilisateur
      // regarde au moment ou il clique.
      const sheets = ($variables.sheets || []).slice();
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
        // Une correction par feuille, indexee par ligne.
        const perSheet = {};
        // Sans numero de feuille, une correction n'est applicable sans risque
        // que si une seule feuille porte des donnees : sinon un rowKey designe
        // potentiellement une ligne dans chacune, et on ne devine pas laquelle.
        const filled = sheets.map((sheet, i) => ((sheet.rows || []).length ? i : -1))
          .filter((i) => i !== -1);
        const fallback = filled.length === 1 ? filled[0] : -1;
        asIssues.forEach((item) => {
          if (!item || !item.rowRef || !item.field) { skipped += 1; return; }
          const index = (item.sheet === undefined || item.sheet === null)
            ? fallback : Number(item.sheet);
          const sheet = sheets[index];
          if (!sheet || (sheet.columns || []).indexOf(item.field) === -1) {
            skipped += 1;
            return;
          }
          if (!perSheet[index]) { perSheet[index] = {}; }
          perSheet[index][item.rowRef] = item;
        });

        Object.keys(perSheet).forEach((key) => {
          const index = Number(key);
          const byKey = perSheet[index];
          const matched = {};
          const nextRows = (sheets[index].rows || []).map((row) => {
            const item = byKey[row.rowKey];
            if (!item) { return row; }
            matched[row.rowKey] = true;
            applied += 1;
            const next = Object.assign({}, row);
            next[item.field] = item.suggestedValue === undefined
              ? '' : String(item.suggestedValue);
            next.statusLabel = 'a controler';
            return next;
          });
          // Une reference de ligne qui ne correspond a rien doit etre comptee :
          // silencieusement ignoree, elle laisserait croire a une correction faite.
          Object.keys(byKey).forEach((ref) => { if (!matched[ref]) { skipped += 1; } });
          sheets[index] = Object.assign({}, sheets[index], { rows: nextRows });
        });
      } else if (proposal.display === 'mapping' && Array.isArray(proposal.pairs)) {
        // Renommer une colonne revient a renommer la meme cle sur chaque ligne.
        // Un renommage de colonne porte sur une feuille : celle que designe la
        // proposition, sinon celle qui est affichee.
        const index = (proposal.sheet === undefined || proposal.sheet === null)
          ? ($variables.activeSheet || 0) : Number(proposal.sheet);
        const sheet = sheets[index];
        if (!sheet) {
          $variables.errorText = 'Cette proposition designe une feuille absente du dossier.';
          return;
        }
        const columns = (sheet.columns || []).slice();
        const renames = proposal.pairs.filter((pair) => pair && pair.source && pair.target
          && columns.indexOf(pair.source) !== -1 && columns.indexOf(pair.target) === -1);
        skipped = proposal.pairs.length - renames.length;
        renames.forEach((pair) => {
          columns[columns.indexOf(pair.source)] = pair.target;
          applied += 1;
        });
        sheets[index] = Object.assign({}, sheet, {
          columns,
          rows: (sheet.rows || []).map((row) => {
            const next = Object.assign({}, row);
            renames.forEach((pair) => {
              next[pair.target] = next[pair.source];
              delete next[pair.source];
            });
            next.statusLabel = 'a controler';
            return next;
          })
        });
      } else {
        $variables.errorText = 'Cette proposition n\'est pas d\'un type applicable.';
        return;
      }

      $variables.sheets = sheets;
      if (auto) {
        $variables.hasAutoFix = false;
        $variables.autoFixText = '';
        $variables.autoFixJson = '';
      } else {
        $variables.hasProposal = false;
        $variables.proposalText = '';
        $variables.proposalJson = '';
      }
      const mark = applied > 1 ? 's' : '';
      // Le controle qui suit reecrit le resume : la note transite par sa propre
      // variable pour ne pas etre perdue en route.
      $variables.appliedNote = `${applied} modification${mark} appliquee${mark}`
        + (skipped ? `, ${skipped} ignoree${skipped > 1 ? 's' : ''} car hors du plan` : '');
      $variables.summaryText = $variables.appliedNote;
    }
  }

  return applyProposalChain;
});
