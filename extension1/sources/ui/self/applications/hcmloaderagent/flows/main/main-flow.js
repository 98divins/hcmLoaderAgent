define(['ojs/ojarraydataprovider'], (ArrayDataProvider) => {
  'use strict';

  // Les etapes du dossier, une page chacune, dans l'ordre ou l'utilisateur les
  // traverse. Le train en tete de page les montre ; les boutons de pied de page
  // font avancer. Terminer ramene a l'accueil, ce n'est pas une etape.
  const STEPS = [
    { id: 'data', label: 'Importer', title: 'Apportez vos donnees',
      subtitle: 'Deposez vos fichiers CSV, un par objet. La page reconnait l\'objet de chaque fichier a ses colonnes.' },
    { id: 'review', label: 'Controler', title: 'Controle du dossier',
      subtitle: 'Chaque ligne est verifiee contre la specification de l\'objet et contre Oracle. Corrigez directement dans la grille.' },
    { id: 'submit', label: 'Charger', title: 'Le dossier est pret a partir',
      subtitle: 'La page charge pour vous, sous votre identite. Ou vous recuperez le fichier et le deposez vous-meme dans HCM Data Loader.' },
    { id: 'result', label: 'Suivre', title: 'Suivi du chargement',
      subtitle: 'Le job Oracle est relu automatiquement jusqu\'a sa fin. Les rejets sont rattaches a la ligne du dossier.' }
  ];

  function activeSheet(sheets, index) {
    return (sheets || [])[index || 0] || { columns: [], rows: [] };
  }

  function plural(n, word) {
    return `${n} ${word}${n > 1 ? 's' : ''}`;
  }

  class FlowModule {

    // ------------------------------------------------------------ chrome

    /**
     * Les etapes pour le train Redwood. Seule l'etape courante est active : le
     * train montre ou l'on est, ce sont les boutons de la page qui font avancer.
     */
    getTrainSteps(step) {
      const current = STEPS.map((s) => s.id).indexOf(step);
      return STEPS.map((s, index) => ({
        id: s.id,
        label: s.label,
        visited: index < current,
        disabled: index !== current
      }));
    }

    /** "Etape 2 sur 4" : l'utilisateur sait toujours ou il en est. */
    stepCounter(step) {
      const index = STEPS.map((s) => s.id).indexOf(step);
      return index === -1 ? '' : `Etape ${index + 1} sur ${STEPS.length}`;
    }

    stepTitle(step) {
      const found = STEPS.filter((s) => s.id === step)[0];
      return found ? found.title : '';
    }

    stepSubtitle(step) {
      const found = STEPS.filter((s) => s.id === step)[0];
      return found ? found.subtitle : '';
    }

    /** Libelle de l'operation, tel qu'on en parle plutot que tel que HDL l'ecrit. */
    operationLabel(operation) {
      return operation === 'DELETE' ? 'Supprimer' : 'Creer et mettre a jour';
    }

    /** Surtitre du dossier : objet et operation, en une ligne. */
    dossierOverline(hierarchy, operation) {
      return hierarchy ? `${hierarchy} · ${this.operationLabel(operation)}` : '';
    }

    // ------------------------------------------------------------ accueil

    /**
     * Hierarchies proposees a l'entree, lues dans le catalogue : ajouter un
     * objet metier revient a completer une donnee, pas a modifier l'ecran.
     */
    getHierarchies(catalog, selected) {
      const tree = (catalog || {}).hierarchies || {};
      return Object.keys(tree).map((id) => {
        const top = ((catalog || {}).objects || {})[tree[id].top] || {};
        const children = (tree[id].children || []).length;
        return {
          id,
          label: id,
          title: tree[id].title || '',
          description: tree[id].description || '',
          objects: `${1 + children} objet${children ? 's' : ''} : ${top.uiName || id}`
            + (children ? ` et ${plural(children, 'objet')} enfant${children > 1 ? 's' : ''}` : ''),
          cls: id === selected ? 'hdl-card hdl-card-choisie' : 'hdl-card',
          action: id === selected ? 'Objet retenu' : 'Choisir'
        };
      });
    }

    /**
     * Matrice objet x operation d'une hierarchie. HDL ne connait que MERGE et
     * DELETE : "creer" et "mettre a jour" sont la meme instruction, on les
     * montre separement parce que c'est ainsi qu'on raisonne.
     */
    getObjectMatrix(catalog, hierarchy) {
      const tree = ((catalog || {}).hierarchies || {})[hierarchy];
      if (!tree) { return []; }
      return [tree.top].concat(tree.children || []).map((name) => {
        const spec = ((catalog || {}).objects || {})[name] || {};
        const ops = spec.validOperations || [];
        const merge = ops.indexOf('MERGE') !== -1;
        return {
          name,
          label: spec.uiName || name,
          creer: merge ? 'oui' : '—',
          majour: merge ? 'oui' : '—',
          supprimer: ops.indexOf('DELETE') !== -1 ? 'oui' : '—'
        };
      });
    }

    allowsDelete(catalog, hierarchy) {
      const tree = ((catalog || {}).hierarchies || {})[hierarchy];
      if (!tree) { return false; }
      return [tree.top].concat(tree.children || []).some((name) => {
        const spec = ((catalog || {}).objects || {})[name] || {};
        return (spec.validOperations || []).indexOf('DELETE') !== -1;
      });
    }

    /** Les operations possibles pour l'objet retenu, en cartes a choisir. */
    getOperations(catalog, hierarchy, selected) {
      if (!hierarchy) { return []; }
      const list = [{
        id: 'MERGE',
        label: 'Creer et mettre a jour',
        description: 'Une ligne absente d\'Oracle est creee, une ligne existante est mise a jour. '
          + 'HDL fait ce choix lui-meme, ligne par ligne.'
      }];
      if (this.allowsDelete(catalog, hierarchy)) {
        list.push({
          id: 'DELETE',
          label: 'Supprimer',
          description: 'Les lignes designees sont supprimees d\'Oracle. Irreversible.'
        });
      }
      return list.map((op) => Object.assign(op, {
        cls: op.id === selected ? 'hdl-option hdl-option-choisie' : 'hdl-option',
        marker: op.id === selected ? 'Retenu' : ''
      }));
    }

    /** Bandeau d'accueil : le bilan du dernier dossier, s'il y en a un. */
    getLastDossierDP(lastDossier) {
      const items = lastDossier ? [{
        key: 'last',
        severity: 'confirmation',
        closeAffordance: 'off',
        summary: 'Dernier dossier',
        detail: `${lastDossier}. Le detail reste consultable dans Oracle : Data Exchange, Import and Load Data.`
      }] : [];
      return new ArrayDataProvider(items, { keyAttributes: 'key' });
    }

    // ------------------------------------------------------------ feuilles et grille

    /**
     * oj-c-table exige un vrai DataProvider. Il enveloppe les lignes elles-memes,
     * pas des copies : une cellule editee ecrit dans la ligne du dossier, et le
     * controle qui suit lit ce que l'utilisateur a tape.
     */
    getRowsDP(sheets, index) {
      return new ArrayDataProvider(activeSheet(sheets, index).rows || [],
        { keyAttributes: 'rowKey' });
    }

    /**
     * Colonnes de la grille. A l'import, les donnees seules. Au controle,
     * l'etat, le detail et le rapprochement viennent en tete, et chaque
     * colonne de donnees porte le modele d'edition.
     */
    getTableColumns(sheets, index, step) {
      const list = [];
      if (step !== 'data') {
        list.push({ field: 'etat', headerText: 'Etat', weight: 1, minWidth: 96 });
        list.push({ field: 'statusDetail', headerText: 'Detail', weight: 4, minWidth: 240 });
        list.push({ field: 'matchLabel', headerText: 'Rapprochement', weight: 3, minWidth: 180 });
      }
      (activeSheet(sheets, index).columns || []).forEach((name) => {
        list.push({ field: name, headerText: name, weight: 2, minWidth: 150, editTemplate: 'editCell' });
      });
      return list;
    }

    /**
     * Les feuilles, presentees en onglets au-dessus de la grille. L'index
     * voyage avec l'onglet : c'est lui que la selection relit sur l'element
     * clique, $listeners n'etant pas resolu a l'interieur d'un <template>.
     */
    getSheets(sheets, index) {
      return (sheets || []).map((sheet, position) => {
        const count = (sheet.rows || []).length;
        const loaded = (sheet.rows || []).filter((r) => r.loaded).length;
        const etat = sheet.countIssues ? 'anomalie' : (count ? 'ok' : 'vide');
        return {
          index: position,
          object: sheet.object,
          label: sheet.label,
          detail: `${plural(count, 'ligne')}`
            + (sheet.countIssues ? ` · ${sheet.countIssues} a corriger` : '')
            + (loaded ? ` · ${loaded} chargee${loaded > 1 ? 's' : ''}` : ''),
          cls: position === (index || 0) ? 'hdl-tab hdl-tab-courante' : 'hdl-tab',
          dot: `hdl-dot hdl-dot-${etat}`
        };
      });
    }

    activeFileName(sheets, index) {
      const sheet = (sheets || [])[index || 0];
      return sheet ? (sheet.fileName || '') : '';
    }

    /** Objets que le dossier peut encore accueillir, pour dire quels fichiers deposer. */
    getAddableObjects(catalog, hierarchy, operation, sheets) {
      const tree = ((catalog || {}).hierarchies || {})[hierarchy];
      if (!tree) { return []; }
      const present = (sheets || []).map((sheet) => sheet.object);
      return [tree.top].concat(tree.children || [])
        .filter((name) => present.indexOf(name) === -1)
        .map((name) => ({ name, spec: ((catalog || {}).objects || {})[name] }))
        .filter((entry) => entry.spec
          && (entry.spec.validOperations || []).indexOf(operation) !== -1)
        .map((entry) => ({ name: entry.name, label: entry.spec.uiName || entry.name }));
    }

    addableText(catalog, hierarchy, operation, sheets) {
      const list = this.getAddableObjects(catalog, hierarchy, operation, sheets);
      if (!list.length) { return 'Tous les objets de la hierarchie sont dans le dossier.'; }
      return `Vous pouvez encore deposer : ${list.map((e) => e.label).join(', ')}.`;
    }

    /** Nombre de lignes qui partiront : celles qui ne sont pas deja chargees. */
    pendingRows(sheets) {
      return (sheets || []).reduce((sum, sheet) => sum
        + (sheet.rows || []).filter((r) => !r.loaded).length, 0);
    }

    // ------------------------------------------------------------ controle

    /**
     * Le resultat du controle, dit en phrases. Les chiffres sont la, mais c'est
     * la phrase qui se lit.
     */
    resultSentences(summary, operation) {
      const s = summary || {};
      const m = s.match || {};
      const out = [];
      if (!s.rows) { return out; }
      if (operation === 'DELETE') {
        out.push('Operation de suppression : les lignes designees seront supprimees.');
      } else {
        const parts = [];
        if (m.create) { parts.push(`${plural(m.create, 'ligne')} creeron${m.create > 1 ? 't' : 'a'} un nouvel enregistrement`); }
        if (m.update) { parts.push(`${plural(m.update, 'ligne')} mettron${m.update > 1 ? 't' : 'a'} a jour un enregistrement existant`); }
        if (m.dossier) { parts.push(`${plural(m.dossier, 'ligne')} enfant${m.dossier > 1 ? 's' : ''} se rattache${m.dossier > 1 ? 'nt' : ''} a un parent cree dans ce meme dossier`); }
        if (m.tenant) { parts.push(`${plural(m.tenant, 'ligne')} enfant${m.tenant > 1 ? 's' : ''} se rattache${m.tenant > 1 ? 'nt' : ''} a un parent deja present dans Oracle`); }
        if (parts.length) { out.push(`${parts.join(' ; ')}.`); }
        if (m.missing) {
          out.push(`${plural(m.missing, 'ligne')} enfant${m.missing > 1 ? 's' : ''} designe${m.missing > 1 ? 'nt' : ''} `
            + 'un parent qui n\'existe ni dans le dossier ni dans Oracle : corrigez le nom du '
            + 'parent dans la grille, ou ajoutez-le a la feuille parent.');
        }
        if (m.unverified) {
          out.push(`${plural(m.unverified, 'ligne')} n'${m.unverified > 1 ? 'ont' : 'a'} pas pu etre `
            + 'rapprochee' + (m.unverified > 1 ? 's' : '') + ' avec Oracle : ni confirmee'
            + (m.unverified > 1 ? 's' : '') + ', ni infirmee' + (m.unverified > 1 ? 's' : '') + '.');
        }
      }
      return out;
    }

    /** Notes de feuille : ce qui n'est pas une anomalie mais merite d'etre su. */
    sheetNotes(summary) {
      const notes = [];
      ((summary || {}).sheets || []).forEach((sheet) => {
        (sheet.notes || []).forEach((n) => { notes.push(`${sheet.label} : ${n}.`); });
      });
      return notes;
    }

    /**
     * Les bandeaux Redwood du controle : un par niveau. L'erreur d'abord, avec
     * ce qu'il faut faire ; l'avertissement ; puis la confirmation quand tout
     * est propre. Chaque bandeau porte les phrases de bilan en detail.
     */
    getBannersDP(summary, operation, hasAutoFix, hasProposal) {
      const s = summary || {};
      const items = [];
      if (s.rows) {
        const sentences = this.resultSentences(s, operation).join(' ');
        if (s.issues) {
          items.push({
            key: 'issues',
            severity: 'error',
            closeAffordance: 'off',
            summary: `${plural(s.issues, 'ligne')} a corriger avant de charger, sur ${s.rows} controlee${s.rows > 1 ? 's' : ''}`,
            detail: (hasAutoFix || hasProposal
              ? 'Appliquez les corrections proposees par l\'assistant, ou corrigez dans la grille '
                + '(double-clic sur la ligne), puis recontrolez. '
              : 'Corrigez dans la grille (double-clic sur la ligne, Entree pour valider), puis '
                + 'recontrolez. L\'assistant explique chaque anomalie. ')
              + sentences
          });
        }
        if (s.warnings) {
          items.push({
            key: 'warnings',
            severity: 'warning',
            closeAffordance: 'off',
            summary: `${plural(s.warnings, 'ligne')} a verifier, le chargement reste possible`,
            detail: 'Ces lignes n\'ont pas pu etre confirmees par Oracle. Verifiez-les avant de charger.'
          });
        }
        if (!s.issues) {
          items.push({
            key: 'clean',
            severity: 'confirmation',
            closeAffordance: 'off',
            summary: `${plural(s.rows, 'ligne')} controlee${s.rows > 1 ? 's' : ''}, aucune anomalie bloquante`,
            detail: `${sentences} Vous pouvez continuer vers le chargement.`
          });
        }
        const notes = this.sheetNotes(s);
        if (notes.length) {
          items.push({
            key: 'notes',
            severity: 'info',
            closeAffordance: 'off',
            summary: 'A savoir',
            detail: notes.join(' ')
          });
        }
      }
      return new ArrayDataProvider(items, { keyAttributes: 'key' });
    }

    /**
     * Texte de confirmation avant un chargement reel : ce qui part, en clair.
     * Une suppression est nommee comme telle.
     */
    confirmText(hierarchy, operation, sheets) {
      const pending = this.pendingRows(sheets);
      const filled = (sheets || []).filter((sheet) => (sheet.rows || []).some((r) => !r.loaded)).length;
      const lines = plural(pending, 'ligne');
      const feuilles = plural(filled, 'feuille');
      if (operation === 'DELETE') {
        return `Oracle va supprimer ${lines} (${feuilles}, ${hierarchy}). `
          + 'Cette action est irreversible.';
      }
      return `Oracle va creer ou mettre a jour ${lines} (${feuilles}, ${hierarchy}). `
        + 'Le traitement demarre immediatement.';
    }

    // ------------------------------------------------------------ suivi

    /** Le suivi, en une phrase. */
    loadSentence(summary) {
      const s = summary || {};
      if (!s.submitted) { return ''; }
      if (!s.finished) {
        return `${plural(s.submitted, 'ligne')} envoyee${s.submitted > 1 ? 's' : ''}. Le traitement est en cours cote Oracle.`;
      }
      if (s.accepted === null || s.accepted === undefined) {
        return `${plural(s.submitted, 'ligne')} envoyee${s.submitted > 1 ? 's' : ''}, ${plural(s.rejected + (s.unmapped || 0), 'message')} `
          + 'd\'erreur. Certains ne designent aucune ligne : lisez-les ci-dessous.';
      }
      if (!s.rejected) {
        return `Termine : ${plural(s.accepted, 'ligne')} acceptee${s.accepted > 1 ? 's' : ''} par Oracle, aucun rejet.`;
      }
      return `Termine : ${plural(s.accepted, 'ligne')} acceptee${s.accepted > 1 ? 's' : ''}, `
        + `${plural(s.rejected, 'ligne')} rejetee${s.rejected > 1 ? 's' : ''}. Les lignes acceptees ne repartiront pas.`;
    }

    /** Bandeau du suivi : la couleur dit l'issue, le texte dit les chiffres. */
    getTrackBannersDP(summary, loadStatus, loadDetail) {
      const s = summary || {};
      const items = [];
      if (s.submitted) {
        let severity = 'info';
        if (s.finished) { severity = s.rejected || s.accepted === null ? 'error' : 'confirmation'; }
        items.push({
          key: 'track',
          severity,
          closeAffordance: 'off',
          summary: loadStatus || '',
          detail: this.loadSentence(s) || loadDetail || ''
        });
      }
      return new ArrayDataProvider(items, { keyAttributes: 'key' });
    }

    /** Rejets lisibles : feuille, ligne, message d'Oracle. */
    getRejects(rejects) {
      return (rejects || []).filter((r) => r.error).map((r, i) => ({
        key: `R${i}`,
        where: r.sheet === -1
          ? `${r.sheetLabel}${r.line ? `, ligne ${r.line} du fichier` : ''}`
          : `${r.sheetLabel}, ligne "${r.label}"`,
        text: r.text
      }));
    }

    refreshText(isPolling, nextRefreshIn, lastRefresh) {
      if (isPolling) {
        return nextRefreshIn ? `Prochaine lecture dans ${nextRefreshIn} s` : 'Lecture en cours...';
      }
      return lastRefresh ? `Derniere lecture ${lastRefresh}` : '';
    }

    // ------------------------------------------------------------ assistant

    /**
     * La derniere reponse de l'assistant, seule. L'historique empile devenait
     * illisible et contredisait l'etat courant : ce qui compte est la reponse
     * au dernier controle ou au dernier chargement.
     */
    lastTurn(turns) {
      const list = turns || [];
      return list.length ? list[list.length - 1] : null;
    }

    olderTurns(turns) {
      const n = Math.max(0, (turns || []).length - 1);
      return n ? `${plural(n, 'reponse')} precedente${n > 1 ? 's' : ''} masquee${n > 1 ? 's' : ''}` : '';
    }
  }

  return FlowModule;
});
