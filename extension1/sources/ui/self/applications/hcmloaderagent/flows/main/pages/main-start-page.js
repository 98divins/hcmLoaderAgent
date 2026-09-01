define(['ojs/ojarraydataprovider'], (ArrayDataProvider) => {
  'use strict';

  // Libelles des etapes du dossier de chargement. Le rail les affiche dans cet
  // ordre ; l'etape courante est une donnee du dossier, pas un compteur.
  const STEPS = [
    { id: 'data', label: 'Donnees' },
    { id: 'review', label: 'Controle' },
    { id: 'submit', label: 'Chargement' },
    { id: 'result', label: 'Resultat' }
  ];

  class PageModule {

    /**
     * oj-c-table exige un vrai DataProvider : un tableau JS brut donne
     * "Invalid data type". La cle est portee par la ligne elle-meme.
     */
    getRowsDP(rows) {
      return new ArrayDataProvider(rows || [], { keyAttributes: 'rowKey' });
    }

    /**
     * Les colonnes sont construites a l'execution a partir des colonnes du
     * dossier : rien n'est fige pour un objet metier donne.
     */
    getTableColumns(columns) {
      // L'etat porte un message, pas un code : il lui faut plus de place qu'une
      // colonne de donnee, sinon il est tronque a quelques lettres.
      const list = [{
        field: 'statusLabel',
        headerText: 'Etat',
        weight: 4,
        minWidth: 150
      }];
      (columns || []).forEach((name) => {
        list.push({ field: name, headerText: name, weight: 2 });
      });
      return list;
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
  }

  return PageModule;
});
