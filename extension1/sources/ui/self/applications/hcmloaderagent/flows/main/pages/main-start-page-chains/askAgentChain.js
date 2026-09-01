define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  const INVOKE = 'site_hcm_extension:aiAgentHdl/postApiFusionAiOrchestratorAgentV2AIAGENTHDLInvokeAsync';
  const STATUS = 'site_hcm_extension:aiAgentHdl/getAgentStatus';

  const POLL_MS = 1200;
  const MAX_POLLS = 50;
  // L'agent raisonne sur un echantillon : envoyer 100 lignes couterait cher
  // sans rien apprendre de plus qu'une dizaine.
  const SAMPLE_SIZE = 8;

  function unwrap(response) {
    return (response && response.body !== undefined) ? response.body : response;
  }

  function wait(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
  }

  function scrollThread() {
    setTimeout(() => {
      const el = document.querySelector('.hdl-assist-thread');
      if (el) { el.scrollTop = el.scrollHeight; }
    }, 60);
  }

  /**
   * L'agent ne recoit jamais une question nue : on lui joint l'etat reel du
   * dossier. C'est ce qui lui evite d'inventer un nom de colonne, et ce qui
   * rend ses propositions applicables telles quelles.
   */
  function buildContext($variables) {
    const columns = $variables.columns || [];
    const rows = $variables.rows || [];
    const sample = rows.slice(0, SAMPLE_SIZE).map((row) => {
      const copy = {};
      columns.forEach((name) => { copy[name] = row[name]; });
      return copy;
    });
    const faulty = rows
      .filter((row) => row.statusLabel && row.statusLabel !== 'ok' && row.statusLabel !== 'a controler')
      .slice(0, SAMPLE_SIZE)
      .map((row) => ({ rowRef: row.rowKey, probleme: row.statusLabel }));

    const lines = [
      'CONTEXTE DU DOSSIER (donnees reelles, ne rien inventer au-dela)',
      `Objet metier : ${$variables.businessObject}`,
      `Etape : ${$variables.step}`,
      `Colonnes du fichier : ${columns.length ? columns.join(', ') : 'aucune'}`,
      `Lignes : ${rows.length}, dont ${$variables.countIssues || 0} en anomalie`
    ];
    if (sample.length) {
      lines.push(`Echantillon (${sample.length} premieres lignes) : ${JSON.stringify(sample)}`);
    }
    if (faulty.length) {
      lines.push(`Anomalies detectees par les controles : ${JSON.stringify(faulty)}`);
    }
    return lines.join('\n');
  }

  function extractData(text) {
    const raw = String(text || '');
    const match = /```agentdata\s*([\s\S]*?)```/.exec(raw);
    if (!match) { return { prose: raw.trim(), data: null }; }
    let data = null;
    try { data = JSON.parse(match[1]); } catch (e) { data = null; }
    return { prose: raw.replace(match[0], '').trim(), data };
  }

  /** Resume lisible d'une proposition, pour que l'utilisateur sache ce qu'il applique. */
  function describeProposal(data) {
    if (!data || !data.display) { return ''; }
    if (data.display === 'issues' && Array.isArray(data.rows)) {
      return data.rows
        .map((r) => `${r.rowRef} · ${r.field} = "${r.suggestedValue}"`
          + (r.rationale ? `\n    ${r.rationale}` : ''))
        .join('\n');
    }
    if (data.display === 'mapping' && Array.isArray(data.pairs)) {
      return data.pairs.map((p) => `${p.source} -> ${p.target}`).join('\n');
    }
    return '';
  }

  function humanError(error) {
    const message = String((error && error.message) || error || '');
    if (/401|403|unauthor|forbidden/i.test(message)) {
      return 'Vous ne semblez pas autorise a utiliser cet assistant. Verifiez que votre '
        + 'role donne acces a l\'equipe d\'agents.';
    }
    if (/404|not found/i.test(message)) {
      return 'Equipe d\'agents introuvable. Verifiez qu\'elle existe sous le code '
        + 'AIAGENTHDL et qu\'elle est publiee.';
    }
    return 'L\'assistant n\'a pas pu traiter la demande. Reessayez, et signalez-le si le '
      + 'probleme persiste.';
  }

  class askAgentChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;

      if (event && event.type && event.type.indexOf('key') === 0 && event.key !== 'Enter') {
        return;
      }
      if ($variables.isThinking) { return; }

      const question = String($variables.question || '').trim();
      if (!question) { return; }

      $variables.errorText = '';
      $variables.agentSteps = [];
      $variables.currentStep = 'Analyse de la demande...';
      $variables.aborted = false;
      $variables.pendingQuestion = question;
      $variables.question = '';
      $variables.isThinking = true;
      scrollThread();

      const startedAt = Date.now();

      try {
        const body = {
          message: `${buildContext($variables)}\n\nDEMANDE\n${question}`,
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
          throw new Error(`Reponse inattendue du service : ${JSON.stringify(invoked)}`);
        }

        $variables.currentStep = 'L\'assistant travaille...';

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
          if (last && last.progressMessage) {
            $variables.currentStep = String(last.progressMessage);
            scrollThread();
          }
          const status = last && last.status;
          done = status && status !== 'RUNNING' && status !== 'PENDING' && status !== 'IN_PROGRESS';
        }

        if ($variables.aborted) { $variables.errorText = 'Demande interrompue.'; return; }
        if (!done) {
          $variables.errorText = 'L\'assistant met trop de temps a repondre. Reessayez.';
          return;
        }
        if (last && last.error) {
          $variables.errorText = humanError(new Error(JSON.stringify(last.error)));
          return;
        }

        const parsed = extractData(last && last.output);
        const seconds = ((Date.now() - startedAt) / 1000).toFixed(1).replace('.', ',');
        const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        $variables.turns = ($variables.turns || []).concat([{
          question,
          answer: parsed.prose || 'Pas de reponse exploitable.',
          meta: `${now} · ${seconds} s`
        }]);

        // Une proposition mal formee ne doit jamais effacer une reponse par
        // ailleurs correcte : son exploitation est isolee.
        try {
          const summary = describeProposal(parsed.data);
          if (summary) {
            $variables.proposalText = summary;
            $variables.proposalJson = JSON.stringify(parsed.data);
            $variables.hasProposal = true;
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.log('askAgentChain: proposition illisible', e);
        }

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
