define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /** Ecarte la proposition en cours sans toucher au plan. */
  class ignoreProposalChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event, source } = {}) {
      const { $variables } = context;
      if (source === 'auto') {
        $variables.hasAutoFix = false;
        $variables.autoFixText = '';
        $variables.autoFixJson = '';
        return;
      }
      $variables.hasProposal = false;
      $variables.proposalText = '';
      $variables.proposalJson = '';
    }
  }

  return ignoreProposalChain;
});
