define(['ojs/ojarraydataprovider'], (ArrayDataProvider) => {
  'use strict';

  class PageModule {
    getLocationRowsDP(rows) {
      return new ArrayDataProvider(rows || [], { keyAttributes: '@index' });
    }
  }

  return PageModule;
});
