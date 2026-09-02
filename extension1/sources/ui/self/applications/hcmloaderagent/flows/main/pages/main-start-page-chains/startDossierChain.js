define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Ouvre le dossier avec sa premiere feuille.
   *
   * Un dossier MERGE part du parent : c'est lui qui porte les enregistrements
   * auxquels les enfants se rattachent. Un dossier DELETE ne peut pas partir de
   * la : ni Location ni Organization n'acceptent la suppression, donc la
   * premiere feuille est le premier enfant qui l'autorise.
   */
  class startDossierChain extends ActionChain {

    async run(context) {
      const { $variables } = context;
      const catalog = $variables.objectCatalog || {};
      const tree = (catalog.hierarchies || {})[$variables.hierarchy];
      if (!tree) { return; }

      const operation = $variables.operation || 'MERGE';
      const allowed = [tree.top].concat(tree.children || []).filter((name) => {
        const spec = (catalog.objects || {})[name] || {};
        return (spec.validOperations || []).indexOf(operation) !== -1;
      });

      if (!allowed.length) {
        $variables.errorText = `Aucun objet de la hierarchie ${$variables.hierarchy} `
          + `n'autorise l'operation ${operation}.`;
        return;
      }

      const first = allowed[0];
      const spec = catalog.objects[first];
      $variables.sheets = [{
        object: first,
        label: spec.uiName || first,
        level: spec.level,
        fileName: '',
        columns: [],
        rows: [],
        countIssues: 0,
        countWarnings: 0,
        statusLabel: 'aucune donnee'
      }];
      $variables.activeSheet = 0;
      $variables.step = 'data';
      $variables.errorText = '';
      $variables.summaryText = '';
      $variables.turns = [];
      $variables.hasAutoFix = false;
      $variables.hasProposal = false;
      $variables.armedAction = '';
      $variables.checkSummary = {};
      $variables.lookupValues = {};
    }
  }

  return startDossierChain;
});
