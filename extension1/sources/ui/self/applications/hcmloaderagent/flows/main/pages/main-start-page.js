define(['ojs/ojarraydataprovider'], (ArrayDataProvider) => {
  'use strict';

  // Libelles des etapes du dossier. Le rail les affiche dans cet ordre ;
  // l'etape courante est une donnee du dossier, pas un compteur.
  const STEPS = [
    { id: 'data', label: 'Donnees' },
    { id: 'review', label: 'Controle' },
    { id: 'submit', label: 'Chargement' },
    { id: 'result', label: 'Resultat' }
  ];

  function activeSheet(sheets, index) {
    return (sheets || [])[index || 0] || { columns: [], rows: [] };
  }

  class PageModule {

    /**
     * oj-c-table exige un vrai DataProvider : un tableau JS brut donne
     * "Invalid data type". La cle est portee par la ligne elle-meme.
     */
    getRowsDP(sheets, index) {
      return new ArrayDataProvider(activeSheet(sheets, index).rows || [],
        { keyAttributes: 'rowKey' });
    }

    /**
     * Les colonnes sont construites a l'execution a partir de celles de la
     * feuille : rien n'est fige pour un objet metier donne.
     */
    getTableColumns(sheets, index) {
      // L'etat porte un message, pas un code : il lui faut plus de place qu'une
      // colonne de donnee, sinon il est tronque a quelques lettres.
      const list = [
        { field: 'statusLabel', headerText: 'Etat', weight: 4, minWidth: 150 },
        { field: 'matchLabel', headerText: 'Rapprochement', weight: 3, minWidth: 130 }
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

    /** Meme mecanique que le plan, pour les messages rendus par le moteur HDL. */
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
      return (sheets || []).map((sheet, position) => ({
        index: position,
        object: sheet.object,
        label: sheet.label,
        detail: sheet.statusLabel || 'aucune donnee',
        cls: position === (index || 0) ? 'hdl-sheet hdl-sheet-courante' : 'hdl-sheet',
        etat: sheet.countIssues ? 'anomalie' : ((sheet.rows || []).length ? 'ok' : 'vide')
      }));
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
          creer: merge ? 'oui' : 'non',
          majour: merge ? 'oui' : 'non',
          supprimer: ops.indexOf('DELETE') !== -1 ? 'oui' : 'non'
        };
      });
    }

    /** Cle utilisateur du parent d'une hierarchie, affichee sur la carte. */
    getHierarchyKey(catalog, hierarchy) {
      const tree = ((catalog || {}).hierarchies || {})[hierarchy];
      if (!tree) { return ''; }
      const spec = ((catalog || {}).objects || {})[tree.top] || {};
      return (spec.userKey || []).join(' + ');
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
  }

  return PageModule;
});
