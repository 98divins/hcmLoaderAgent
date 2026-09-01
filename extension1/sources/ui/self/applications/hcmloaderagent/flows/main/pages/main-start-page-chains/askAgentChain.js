define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // L'identifiant est préfixé par l'id de l'extension (extension.json), pas par
  // son nom d'affichage.
  const INVOKE = 'site_hcm_extension:aiAgentHdl/postApiFusionAiOrchestratorAgentV2AIAGENTHDLInvokeAsync';
  const STATUS = 'site_hcm_extension:aiAgentHdl/getAgentStatus';

  const POLL_MS = 1200;
  const MAX_POLLS = 50; // ~60 s avant d'abandonner

  function unwrap(response) {
    return (response && response.body !== undefined) ? response.body : response;
  }

  function wait(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
  }

  function scrollThread() {
    setTimeout(() => {
      const el = document.querySelector('.hdl-thread');
      if (el) { el.scrollTop = el.scrollHeight; }
    }, 60);
  }

  /**
   * L'agent joint son bloc de données structuré en fin de réponse (contrat
   * décrit dans docs/ARCHITECTURE-AGENT-HDL.md § 5). On le retire de la prose.
   * Un bloc absent ou malformé ne doit jamais effacer une réponse rédigée
   * correcte : on rend la prose telle quelle et `data` reste nul.
   */
  function extractData(text) {
    const raw = String(text || '');
    const match = /```agentdata\s*([\s\S]*?)```/.exec(raw);
    if (!match) { return { prose: raw.trim(), data: null }; }
    let data = null;
    try { data = JSON.parse(match[1]); } catch (e) { data = null; }
    return { prose: raw.replace(match[0], '').trim(), data };
  }

  function humanError(error) {
    const message = String((error && error.message) || error || '');
    if (/401|403|unauthor|forbidden/i.test(message)) {
      return 'Vous ne semblez pas autorisé à utiliser cet assistant. '
        + 'Vérifiez que votre rôle donne accès à l’équipe d’agents, et que la connexion '
        + 'de service pointe bien sur le backend fusionAi.';
    }
    if (/404|not found/i.test(message)) {
      return 'L’équipe d’agents est introuvable. Vérifiez qu’elle existe sous le code '
        + 'AIAGENTHDL dans AI Agent Studio et qu’elle est bien publiée.';
    }
    if (/network|failed to fetch|timeout/i.test(message)) {
      return 'La connexion à l’assistant a échoué. Réessayez dans un instant.';
    }
    return 'L’assistant n’a pas pu traiter votre demande. Réessayez, et si le problème '
      + 'persiste, signalez-le à votre administrateur.';
  }

  class askAgentChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;

      // Le même listener sert au bouton et à la touche Entrée du champ.
      if (event && event.type && event.type.indexOf('key') === 0 && event.key !== 'Enter') {
        return;
      }
      if ($variables.isThinking) { return; }

      const question = String($variables.question || '').trim();
      if (!question) { return; }

      $variables.errorText = '';
      $variables.agentSteps = [];
      $variables.currentStep = '';
      $variables.aborted = false;
      $variables.pendingQuestion = question;
      $variables.question = '';
      $variables.isThinking = true;
      scrollThread();

      const startedAt = Date.now();
      const steps = [];
      const pushStep = (label) => {
        if (label && steps[steps.length - 1] !== label) {
          steps.push(label);
          $variables.agentSteps = steps.slice();
          $variables.currentStep = label;
          scrollThread();
        }
      };

      try {
        pushStep('Analyse de votre demande…');

        // `progressMessage` et `conversationId` ne figurent pas dans le schéma
        // engendré et passent quand même : VB ne valide pas le corps strictement.
        // C'est `conversationId` qui rend la conversation multi-tours.
        const body = {
          message: question,
          conversational: true,
          streamOutput: false,
          progressMessage: true
        };
        if ($variables.conversationId) { body.conversationId = $variables.conversationId; }

        const invoked = unwrap(await Actions.callRest(context, { endpoint: INVOKE, body }));
        const jobId = invoked && invoked.jobId;
        if (invoked && invoked.conversationId) {
          $variables.conversationId = invoked.conversationId;
        }
        if (!jobId) {
          throw new Error(`Réponse inattendue du service : ${JSON.stringify(invoked)}`);
        }

        pushStep('L’agent travaille…');

        let last = invoked;
        let done = false;
        for (let i = 0; i < MAX_POLLS && !done; i += 1) {
          if ($variables.aborted) { break; }
          // eslint-disable-next-line no-await-in-loop
          await wait(POLL_MS);
          if ($variables.aborted) { break; }
          // eslint-disable-next-line no-await-in-loop
          last = unwrap(await Actions.callRest(context, {
            endpoint: STATUS, uriParams: { jobId }
          }));
          if (last && last.progressMessage) { pushStep(String(last.progressMessage)); }
          const status = last && last.status;
          done = status && status !== 'RUNNING' && status !== 'PENDING' && status !== 'IN_PROGRESS';
        }

        if ($variables.aborted) {
          $variables.errorText = 'Demande interrompue.';
          return;
        }
        if (!done) {
          $variables.errorText = 'L’assistant met trop de temps à répondre. '
            + 'Reformulez votre demande ou réessayez.';
          return;
        }
        if (last && last.error) {
          $variables.errorText = humanError(new Error(JSON.stringify(last.error)));
          return;
        }

        const parsed = extractData(last && last.output);
        const seconds = ((Date.now() - startedAt) / 1000).toFixed(1).replace('.', ',');
        const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        const turn = {
          question,
          answer: parsed.prose || 'Je n’ai pas de réponse à fournir sur ce point.',
          meta: `Répondu à ${now} · ${seconds} s`,
          // Étape de mise au point : tant que le format du plan de chargement
          // n'est pas figé, on montre le bloc brut plutôt que d'en deviner le
          // rendu. Il disparaîtra quand le tableau de prévisualisation existera.
          rawData: parsed.data ? JSON.stringify(parsed.data, null, 2) : ''
        };

        $variables.turns = ($variables.turns || []).concat([turn]);
        scrollThread();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('askAgentChain: erreur =', error);
        $variables.errorText = humanError(error);
      } finally {
        $variables.isThinking = false;
        $variables.pendingQuestion = '';
        $variables.currentStep = '';
        scrollThread();
      }
    }
  }

  return askAgentChain;
});
