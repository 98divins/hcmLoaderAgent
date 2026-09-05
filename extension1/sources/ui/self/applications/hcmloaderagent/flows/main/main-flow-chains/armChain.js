define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Arme ou desarme une action irreversible.
   *
   * Un chargement reel se confirme en deux temps : un premier clic affiche ce
   * qui va partir, un second l'envoie. Toute autre action entre les deux
   * desarme. Le meme mecanisme sert au retrait d'une feuille qui porte des
   * lignes. Pas de boite de dialogue : un composant non eprouve sur cette page
   * serait un risque de plus, la ou deux boutons suffisent.
   */
  class armChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {string} params.action  'load', 'removeSheet', ou '' pour desarmer
     */
    async run(context, { action } = {}) {
      const { $variables } = context;
      const wanted = String(action || '');
      if (wanted && wanted !== 'load' && wanted !== 'removeSheet') { return; }
      if (wanted === 'load' && ($variables.step !== 'submit' || $variables.countIssues)) {
        $variables.errorText = 'Controlez le dossier avant de charger : rien ne part sans '
          + 'un controle complet.';
        return;
      }
      $variables.errorText = '';
      $variables.armedAction = wanted;
    }
  }

  return armChain;
});
