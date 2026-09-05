/* Copyright (c) 2026, Oracle and/or its affiliates */

define([
  'vb/action/actionChain',
  'vb/action/actions'
], (
  ActionChain,
  Actions
) => {
  'use strict';

  class spCancelActionChain extends ActionChain {

    /**
     * @param {Object} context
     */
    async run(context) {
      const { $page } = context;

      $page.variables.cancel = true;

      await Actions.navigateToPage(context, {
        "//": "specify page for navigation",
        page: 'null',
      });
    }
  }

  return spCancelActionChain;
});