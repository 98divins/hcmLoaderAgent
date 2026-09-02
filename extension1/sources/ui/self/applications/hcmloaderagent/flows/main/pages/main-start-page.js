define(['ojs/ojarraydataprovider'], (ArrayDataProvider) => {
  'use strict';

  // Etapes du dossier, dans l'ordre ou l'utilisateur les traverse. Le
  // rapprochement n'est pas une etape a part : il fait partie du controle et
  // s'execute dans la meme passe.
  const STEPS = [
    { id: 'data', label: 'Importer' },
    { id: 'review', label: 'Controler' },
    { id: 'submit', label: 'Charger' },
    { id: 'result', label: 'Analyser' }
  ];

  const STATE_LABELS = {
    ok: 'OK',
    erreur: 'Erreur',
    'a verifier': 'A verifier',
    'a controler': 'A controler'
  };

  function activeSheet(sheets, index) {
    return (sheets || [])[index || 0] || { columns: [], rows: [] };
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
     * feuille : rien n'est fige pour un objet metier donne. L'etat est court,
     * le detail porte le message : un texte long dans une cellule etroite ne
     * se lit pas.
     */
    getTableColumns(sheets, index) {
      const list = [
        { field: 'etat', headerText: 'Etat', weight: 1, minWidth: 90 },
        { field: 'statusDetail', headerText: 'Detail', weight: 4, minWidth: 220 },
        { field: 'matchLabel', headerText: 'Rapprochement', weight: 3, minWidth: 160 }
      ];
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

    /** Meme mecanique que le dossier, pour les messages rendus par le moteur HDL. */
    getLoadRowsDP(rows) {
      return new ArrayDataProvider(rows || [], { keyAttributes: 'rowKey' });
    }

    getLoadColumns(columns) {
      return (columns || []).map((name) => ({ field: name, headerText: name, weight: 2 }));
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

    /**
     * Les feuilles du dossier, telles que le rail les affiche. L'index voyage
     * avec la feuille : c'est lui que la selection relit sur l'element clique,
     * $listeners n'etant pas resolu a l'interieur d'un <template>.
     */
    getSheets(sheets, index) {
      return (sheets || []).map((sheet, position) => {
        const count = (sheet.rows || []).length;
        const etat = sheet.countIssues ? 'anomalie' : (count ? 'ok' : 'vide');
        return {
          index: position,
          object: sheet.object,
          label: sheet.label,
          detail: sheet.statusLabel || 'aucune donnee',
          cls: position === (index || 0) ? 'hdl-sheet hdl-sheet-courante' : 'hdl-sheet',
          dot: `hdl-dot hdl-dot-${etat}`
        };
      });
    }

    /** Feuilles qui bloquent le chargement, nommees pour le rail. */
    getBlockingSheets(sheets) {
      const names = (sheets || []).filter((sheet) => sheet.countIssues).map((s) => s.label);
      if (!names.length) { return ''; }
      return `Chargement bloque par ${names.join(', ')}`;
    }

    /**
     * Hierarchies proposees a l'entree, lues dans le catalogue : ajouter un
     * objet metier revient a completer une donnee, pas a modifier l'ecran.
     */
    getHierarchies(catalog, selected) {
      const tree = (catalog || {}).hierarchies || {};
      return Object.keys(tree).map((id) => {
        const top = ((catalog || {}).objects || {})[tree[id].top] || {};
        return {
          id,
          label: id,
          title: tree[id].title || '',
          description: tree[id].description || '',
          userKey: (top.userKey || []).join(' + '),
          cls: id === selected ? 'hdl-card hdl-card-choisie' : 'hdl-card',
          action: id === selected ? 'Retenu' : 'Choisir'
        };
      });
    }

    /**
     * Objets que le dossier peut encore accueillir : ceux de la hierarchie qui
     * autorisent l'operation en cours et ne sont pas deja une feuille. Le
     * catalogue tranche, la page n'a rien a deviner.
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
          parent: spec.level === 'top',
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
     * Texte de confirmation avant un chargement reel : ce qui part, en clair.
     * Une suppression est nommee comme telle.
     */
    confirmText(hierarchy, operation, countTotal, sheets) {
      const n = countTotal || 0;
      const s = (sheets || []).filter((sheet) => (sheet.rows || []).length).length;
      const lines = n === 1 ? '1 ligne' : `${n} lignes`;
      const feuilles = s === 1 ? '1 feuille' : `${s} feuilles`;
      if (operation === 'DELETE') {
        return `Vous allez demander a Oracle la SUPPRESSION de ${lines} (${feuilles}, `
          + `hierarchie ${hierarchy}). Les enregistrements designes seront supprimes. `
          + 'Cette action est irreversible.';
      }
      return `Vous allez soumettre a Oracle un chargement de ${lines} (${feuilles}, `
        + `hierarchie ${hierarchy}) : creation des enregistrements absents, mise a jour `
        + 'des existants. Le traitement demarre immediatement.';
    }

    /** Synthese du controle, prete a afficher : les trois cas de rapprochement comptes. */
    getMatchCards(summary) {
      const m = (summary && summary.match) || null;
      if (!m) { return []; }
      const cards = [];
      if (m.dossier) { cards.push({ cls: 'hdl-match hdl-match-ok', count: m.dossier, text: 'parent cree dans ce dossier' }); }
      if (m.tenant) { cards.push({ cls: 'hdl-match hdl-match-info', count: m.tenant, text: 'parent deja present dans le tenant' }); }
      if (m.missing) { cards.push({ cls: 'hdl-match hdl-match-ko', count: m.missing, text: 'parent introuvable : ligne rejetee' }); }
      if (m.create) { cards.push({ cls: 'hdl-match hdl-match-ok', count: m.create, text: 'creation' }); }
      if (m.update) { cards.push({ cls: 'hdl-match hdl-match-info', count: m.update, text: 'mise a jour' }); }
      if (m.unverified) { cards.push({ cls: 'hdl-match hdl-match-na', count: m.unverified, text: 'non verifie' }); }
      return cards;
    }

    /** Etat d'une ligne de la synthese, sous forme de classe. */
    itemClass(state) {
      return state === 'erreur' ? 'hdl-item hdl-item-ko' : 'hdl-item hdl-item-warn';
    }
  }

  return PageModule;
});
