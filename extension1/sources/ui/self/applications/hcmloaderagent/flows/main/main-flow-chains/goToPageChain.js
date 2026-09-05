define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Les pages du flux, par etape. Le dossier vit dans les variables du flux :
  // changer de page ne change rien a son contenu, seulement ce qu'on en montre.
  const PAGES = {
    start: 'main-start',
    import: 'dossier-import',
    check: 'dossier-check',
    load: 'dossier-load',
    track: 'dossier-track'
  };

  /**
   * Navigation entre les pages du dossier, avec la condition qui la justifie.
   * On ne va sur une page que si l'etat le permet : le chargement ne s'ouvre
   * pas sur un dossier en anomalie, le suivi pas sans job soumis.
   */
  class goToPageChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {string} params.page  start | import | check | load | track
     * @param {string} params.when  condition : opened | sheets | clean | requestId
     */
    async run(context, { page, when } = {}) {
      const { $variables } = context;
      const target = PAGES[page];
      if (!target) { return; }

      if (when === 'opened' && !$variables.opened) { return; }
      if (when === 'sheets' && !($variables.sheets || []).length) { return; }
      if (when === 'clean' && ($variables.step !== 'submit' || $variables.countIssues)) { return; }
      if (when === 'requestId' && !$variables.requestId) { return; }

      await Actions.navigateToPage(context, { page: target });
    }
  }

  return goToPageChain;
});
