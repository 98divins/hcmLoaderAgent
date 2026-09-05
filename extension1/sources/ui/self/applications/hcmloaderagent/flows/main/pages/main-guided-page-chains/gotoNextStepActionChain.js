/* Copyright (c) 2026, Oracle and/or its affiliates */

define([
  'vb/action/actionChain',
  'vb/action/actions'
], (
  ActionChain,
  Actions
) => {
  'use strict';

  class gotoNextStepActionChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {any} params.event 
     */
    async run(context, { event }) {
      const { $application } = context;
      await Actions.navigateToPage(context, {
        page: $application.currentPage.id,
        params: {
          currentStep: event.detail.nextStep,
        },
        history: "push"
      });
    }
  }

  return gotoNextStepActionChain;
});