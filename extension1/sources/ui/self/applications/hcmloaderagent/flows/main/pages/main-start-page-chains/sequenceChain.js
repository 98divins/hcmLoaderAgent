define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /**
   * Enchaine des chaines l'une apres l'autre. Dans Visual Builder, les chaines
   * listees sur un meme ecouteur partent en parallele : une navigation qui
   * attend le numero de requete de la soumission ne peut pas etre la deuxieme
   * d'une liste. Ici, chaque etape attend la precedente.
   */
  class sequenceChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Array} params.steps  [{ chain, params }]
     */
    async run(context, { steps } = {}) {
      const list = Array.isArray(steps) ? steps : [];
      for (let i = 0; i < list.length; i += 1) {
        const step = list[i] || {};
        if (!step.chain) { continue; }
        // eslint-disable-next-line no-await-in-loop
        await Actions.callChain(context, { chain: step.chain, params: step.params || {} });
      }
    }
  }

  return sequenceChain;
});
