/* Copyright (c) 2026, Oracle and/or its affiliates */

define([
  'vb/action/actionChain',
  'vb/action/actions'
], (
  ActionChain,
  Actions
) => {
  'use strict';

  class spBeforeStepNavigate extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {any} params.event
     */
    async run(context, { event }) {
      const { $page } = context;

      if ($page.variables.valid !== 'valid') {
        await Actions.callChain(context, {
          chain: 'validateActionChain',
        });
      } else {
        await Actions.callChain(context, {
          chain: 'gotoNextStepActionChain',
          params: {
            event: event,
          },
        });
      }
    }
  }

  return spBeforeStepNavigate;
});