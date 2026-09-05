/* Copyright (c) 2026, Oracle and/or its affiliates */

define([
  'vb/action/actionChain',
  'vb/action/actions',
], (
  ActionChain,
  Actions
) => {
  'use strict';

  class firePageLayoutEventActionChain extends ActionChain {

    /**
     * @param {Object} context
     */
    async run(context) {

      await Actions.fireEvent(context, {
        event: 'ojSpRedwoodPageLayout',
        payload: {
          pageType: 'edgeToEdge',
        },
      }, { id: 'firePageLayoutEventAction' });
    }
  }

  return firePageLayoutEventActionChain;
});
