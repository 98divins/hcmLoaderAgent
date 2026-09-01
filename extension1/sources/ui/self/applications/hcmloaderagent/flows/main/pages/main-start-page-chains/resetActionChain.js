define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /** Repart d'une page blanche : nouveau fil, nouvelle conversation côté agent. */
  class resetActionChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      $variables.turns = [];
      $variables.question = '';
      $variables.pendingQuestion = '';
      $variables.conversationId = '';
      $variables.errorText = '';
      $variables.agentSteps = [];
      $variables.currentStep = '';
      $variables.aborted = false;
    }
  }

  return resetActionChain;
});
