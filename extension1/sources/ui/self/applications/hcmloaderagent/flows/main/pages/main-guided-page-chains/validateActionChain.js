/* Copyright (c) 2026, Oracle and/or its affiliates */

define([
  'vb/action/actionChain',
  'vb/action/actions'
], (
  ActionChain,
  Actions
) => {
  'use strict';

  class validateActionChain extends ActionChain {

    /**
     * @param {Object} context 
     */
    async run(context) {
      await Actions.callComponentMethod(context, {
        selector: '#validationGroup',
        method: 'showMessages',
      });
    }
  }

  return validateActionChain;
});