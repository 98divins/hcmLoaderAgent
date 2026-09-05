define([], () => {
  'use strict';

  /**
   * Module de la page du dossier. Les fonctions d'affichage sont dans le
   * module du flux ; ici ne reste que le dialogue Redwood "modifications non
   * enregistrees", qui suspend la navigation jusqu'a la reponse.
   */
  class PageModule {

    /** Attend la reponse de l'utilisateur au dialogue. */
    checkWithUser() {
      return new Promise((resolve) => { this.pendingAnswer = resolve; });
    }

    /** Reponse du dialogue : YES pour quitter, NO pour rester. */
    userResponse(response) {
      if (this.pendingAnswer) {
        this.pendingAnswer(response);
        this.pendingAnswer = null;
      }
    }
  }

  return PageModule;
});
