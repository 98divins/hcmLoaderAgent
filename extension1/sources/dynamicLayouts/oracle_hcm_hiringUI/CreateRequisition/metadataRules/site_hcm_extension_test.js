/* eslint-disable dot-notation */
define([], () => {
  'use strict';

  /
  /**
   * Default value expression for Details.FullTimeOrPartTime 
   * @param {object} context
   * @return {string}
   */
  function getDetailsFullTimeOrPartTime(context) {
    const { $componentContext, $fields, $modules, $user } = context;

    // Test
    const Test = $fields.RecruitingJobRequisition.HcmParams.JobRequisitionCreationSource.$value();

    // Def
    const Def = $fields.Details.FullTimeOrPartTime.$value();

    if (Def != null) {
      return 'PART_TIME'; // @dt.lov.display_value=Part time
    }

    return '';
  }

  return { getDetailsFullTimeOrPartTime };
});
