define([
  'vb/action/actionChain',
  'vb/action/actions',
  'vb/action/actionUtils',
], (
  ActionChain,
  Actions,
  ActionUtils
) => {
  'use strict';

  class FilePickerSelectChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {object} params.event
     * @param {object[]} params.files
     */
    async run(context, { event, files }) {
      const { $page, $flow, $application, $base, $extension, $constants, $variables } = context;
    }
  }

  return FilePickerSelectChain;
});
