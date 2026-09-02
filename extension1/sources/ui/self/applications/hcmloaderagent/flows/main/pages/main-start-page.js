define(['ojs/ojarraydataprovider'], (ArrayDataProvider) => {
  'use strict';

  // Etapes du dossier, dans l'ordre ou l'utilisateur les traverse. Chaque etape
  // est un ecran : on n'y voit que ce qui compte a ce moment-la.
  const STEPS = [
    { id: 'data', label: 'Importer', title: 'Apportez vos donnees' },
    { id: 'review', label: 'Controler', title: 'Controle du dossier' },
    { id: 'submit', label: 'Charger', title: 'Le dossier est pret a partir' },
    { id: 'result', label: 'Suivre', title: 'Suivi du chargement' },
    { id: 'done', label: 'Terminer', title: 'Dossier termine' }
  ];

  const STATE_LABELS = {
    ok: 'OK',
    erreur: 'Erreur',
    'a verifier': 'A verifier',
    'a controler': 'A controler',
    chargee: 'Chargee'
  };

  function activeSheet(sheets, index) {
    return (sheets || [])[index || 0] || { columns: [], rows: [] };
  }

  function plural(n, word, fem) {
    const e = fem ? 'e' : '';
    return `${n} ${word}${e}${n > 1 ? 's' : ''}`;
  }

  class PageModule {

    /**
     * oj-c-table exige un vrai DataProvider : un tableau JS brut donne
     * "Invalid data type". La cle est portee par la ligne elle-meme.
     */
    getRowsDP(sheets, index) {
      const rows = (activeSheet(sheets, index).rows || []).map((row) => Object.assign({}, row, {
        etat: STATE_LABELS[row.statusLabel] || row.statusLabel || ''
      }));
      return new ArrayDataProvider(rows, { keyAttributes: 'rowKey' });
    }

    /**
     * Les colonnes sont construites a l'execution a partir de celles de la
     * feuille. Avant le controle, la grille ne montre que les donnees : l'etat
     * et le detail n'ont rien a dire. Apres, ils viennent en tete, et le
     * rapprochement seulement s'il a ete fait.
     */
    getTableColumns(sheets, index, step) {
      const list = [];
      if (step !== 'data') {
        list.push({ field: 'etat', headerText: 'Etat', weight: 1, minWidth: 90 });
        list.push({ field: 'statusDetail', headerText: 'Detail', weight: 4, minWidth: 220 });
        list.push({ field: 'matchLabel', headerText: 'Rapprochement', weight: 3, minWidth: 160 });
      }
      (activeSheet(sheets, index).columns || []).forEach((name) => {
        list.push({ field: name, headerText: name, weight: 2 });
      });
      return list;
    }

    /** Suivi du job : une ligne par phase, colonnes fixes car connues. */
    getPhasesDP(rows) {
      return new ArrayDataProvider(rows || [], { keyAttributes: 'rowKey' });
    }

    getPhaseColumns() {
      return [
        { field: 'Etape', headerText: 'Etape', weight: 2 },
        { field: 'Etat', headerText: 'Etat', weight: 3 },
        { field: 'Avancement', headerText: 'Avancement', weight: 2 }
      ];
    }

    /** Le rail : chaque etape sait si elle est faite, courante ou a venir. */
    getSteps(step) {
      const current = STEPS.map((s) => s.id).indexOf(step);
      return STEPS.map((s, index) => {
        let state = 'a-venir';
        if (index < current) { state = 'faite'; }
        if (index === current) { state = 'courante'; }
        return {
          id: s.id,
          label: s.label,
          marker: index < current ? 'OK' : String(index + 1),
          cls: `hdl-step hdl-step-${state}`
        };
      });
    }

    /** Titre de l'ecran courant : dit ou l'on est et ce qu'on y fait. */
    stepTitle(step) {
      const found = STEPS.filter((s) => s.id === step)[0];
      return found ? found.title : '';
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
          userKey: (top.userKey || []).join(' + '),
          cls: id === selected ? 'hdl-card hdl-card-choisie' : 'hdl-card',
          action: id === selected ? 'Objet retenu' : 'Cliquer pour choisir'
        };
      });
    }

    /**
     * Objets que le dossier peut encore accueillir. Sert a dire a l'utilisateur
     * quels fichiers il peut encore deposer, pas a lui faire choisir.
     */
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

    /** Liste lisible des objets encore attendus. */
    addableText(catalog, hierarchy, operation, sheets) {
      const list = this.getAddableObjects(catalog, hierarchy, operation, sheets);
      if (!list.length) { return 'Tous les objets de la hierarchie sont dans le dossier.'; }
      return `Vous pouvez encore deposer : ${list.map((e) => e.label).join(', ')}.`;
    }

    /**
     * Matrice objet x operation d'une hierarchie, pour l'ecran d'entree.
     * HDL ne connait que MERGE et DELETE : "creer" et "mettre a jour" sont la
     * meme instruction, on les montre separement parce que c'est ainsi qu'on
     * raisonne, mais le fichier n'en porte qu'une.
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

    /**
     * Une hierarchie dont aucun objet n'accepte DELETE ne doit pas proposer un
     * dossier de suppression : il ne pourrait porter aucune feuille.
     */
    allowsDelete(catalog, hierarchy) {
      const tree = ((catalog || {}).hierarchies || {})[hierarchy];
      if (!tree) { return false; }
      return [tree.top].concat(tree.children || []).some((name) => {
        const spec = ((catalog || {}).objects || {})[name] || {};
        return (spec.validOperations || []).indexOf('DELETE') !== -1;
      });
    }

    /** Libelle de l'operation, tel qu'on en parle plutot que tel que HDL l'ecrit. */
    operationLabel(operation) {
      return operation === 'DELETE' ? 'Supprimer' : 'Creer et mettre a jour';
    }

    /**
     * Le resultat du controle, dit en phrases. Les chiffres sont la, mais c'est
     * la phrase qui se lit : "3 lignes creeront un enregistrement" plutot qu'un
     * compteur sous une etiquette technique.
     */
    resultSentences(summary, operation) {
      const s = summary || {};
      const m = s.match || {};
      const out = [];
      if (!s.rows) { return out; }
      out.push(`${plural(s.rows, 'ligne')} controlee${s.rows > 1 ? 's' : ''} : `
        + `${plural(s.clean, 'ligne')} sans remarque`
        + (s.issues ? `, ${s.issues} a corriger avant de charger` : '')
        + (s.warnings ? `, ${s.warnings} a verifier (le chargement reste possible)` : '')
        + '.');
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
            + 'parent, ou ajoutez-le a la feuille parent.');
        }
        if (m.unverified) {
          out.push(`${plural(m.unverified, 'ligne')} n'${m.unverified > 1 ? 'ont' : 'a'} pas pu etre `
            + 'rapprochee' + (m.unverified > 1 ? 's' : '') + ' avec Oracle : ni confirmee'
            + (m.unverified > 1 ? 's' : '') + ', ni infirmee' + (m.unverified > 1 ? 's' : '') + '.');
        }
      }
      const notes = [];
      (s.sheets || []).forEach((sheet) => {
        (sheet.notes || []).forEach((n) => { notes.push(`${sheet.label} : ${n}.`); });
      });
      return out.concat(notes);
    }

    /** Ce qu'il reste a faire, en une phrase, selon l'etat du controle. */
    nextAction(summary, hasAutoFix, hasProposal) {
      const s = summary || {};
      if (!s.rows) { return ''; }
      if (s.issues) {
        if (hasAutoFix || hasProposal) {
          return 'Appliquez les corrections proposees dans le panneau de droite, puis recontrolez.';
        }
        return 'Corrigez les lignes en erreur : exportez, modifiez dans Excel, redeposez le '
          + 'fichier, puis recontrolez. L\'assistant peut vous guider.';
      }
      return 'Aucune anomalie bloquante : vous pouvez passer au chargement.';
    }

    /**
     * Texte de confirmation avant un chargement reel : ce qui part, en clair.
     * Une suppression est nommee comme telle.
     */
    confirmText(hierarchy, operation, sheets) {
      const pending = (sheets || []).reduce((sum, sheet) => sum
        + (sheet.rows || []).filter((r) => !r.loaded).length, 0);
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

    /** Nombre de lignes qui partiront : celles qui ne sont pas deja chargees. */
    pendingRows(sheets) {
      return (sheets || []).reduce((sum, sheet) => sum
        + (sheet.rows || []).filter((r) => !r.loaded).length, 0);
    }

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

  }

  return PageModule;
});
