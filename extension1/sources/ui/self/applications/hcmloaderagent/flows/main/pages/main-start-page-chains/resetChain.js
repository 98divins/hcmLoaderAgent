define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  /** Repart d'un dossier vide, et d'une conversation neuve cote agent. */
  class resetChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      $variables.rows = [];
      $variables.columns = [];
      $variables.fileName = '';
      $variables.countTotal = 0;
      $variables.countIssues = 0;
      $variables.summaryText = '';
      $variables.step = 'data';
      $variables.turns = [];
      $variables.question = '';
      $variables.pendingQuestion = '';
      $variables.conversationId = '';
      $variables.errorText = '';
      $variables.agentSteps = [];
      $variables.currentStep = '';
      $variables.aborted = false;
      $variables.isLoading = false;
      $variables.loadStatus = '';
      $variables.loadDetail = '';
      $variables.requestId = '';
      $variables.dataSetName = '';
      $variables.appliedNote = '';
      $variables.hasAutoFix = false;
      $variables.autoFixText = '';
      $variables.autoFixJson = '';
      $variables.hasProposal = false;
      $variables.proposalText = '';
      $variables.proposalJson = '';
    }
  }

  return resetChain;
});
