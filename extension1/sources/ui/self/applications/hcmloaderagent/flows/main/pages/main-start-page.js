define([], () => {
  'use strict';

  // Les fonctions partagees vivent dans le module du flux ($flow.functions) :
  // chaque page n'en montre qu'une etape.
  class PageModule {
  }

  return PageModule;
});
