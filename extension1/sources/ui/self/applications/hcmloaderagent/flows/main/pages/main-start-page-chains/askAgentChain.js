define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  const INVOKE = 'site_hcm_extension:aiAgentHdl/postApiFusionAiOrchestratorAgentV2AIAGENTHDLInvokeAsync';
  const STATUS = 'site_hcm_extension:aiAgentHdl/getAgentStatus';

  const POLL_MS = 1200;
  const MAX_POLLS = 50;
  // Taille de dossier couverte pour l'instant. C'est aussi la limite de
  // chargement : au-dela, la preparation reste possible mais le chargement
  // devra etre decoupe.
  const ROW_LIMIT = 50;
  // Quelques lignes saines suffisent a montrer a quoi ressemble une ligne
  // normale, et c'est ce qui permet de deduire une valeur commune.
  const CLEAN_SAMPLE = 5;

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
  function isFaulty(row) {
    return row.statusLabel && row.statusLabel !== 'ok' && row.statusLabel !== 'a controler';
  }

  /** rowKey accompagne chaque ligne : c'est la seule reference commune entre
   *  ce que l'agent designe et ce que la page sait retrouver. */
  function withValues(row, columns) {
    const copy = { rowKey: row.rowKey };
    columns.forEach((name) => { copy[name] = row[name]; });
    return copy;
  }

  function buildContext($variables) {
    const columns = $variables.columns || [];
    const rows = $variables.rows || [];

    // Toutes les lignes en anomalie partent, valeurs comprises, dans la limite
    // du dossier : n'en envoyer qu'une poignee revenait a n'autoriser des
    // corrections que sur les premieres, ce qui ne tient pas des que le fichier
    // depasse quelques lignes.
    const faulty = rows.filter(isFaulty).slice(0, ROW_LIMIT)
      .map((row) => Object.assign(withValues(row, columns), { probleme: row.statusLabel }));
    const clean = rows.filter((row) => !isFaulty(row)).slice(0, CLEAN_SAMPLE)
      .map((row) => withValues(row, columns));

    const lines = [
      'CONTEXTE DU DOSSIER (donnees reelles, ne rien inventer au-dela)',
      `Objet metier : ${$variables.businessObject}`,
      `Etape : ${$variables.step}`,
      `Colonnes du fichier : ${columns.length ? columns.join(', ') : 'aucune'}`,
      `Lignes : ${rows.length}, dont ${$variables.countIssues || 0} en anomalie`
    ];
    if (faulty.length) {
      lines.push(`Lignes en anomalie (toutes, avec leurs valeurs et le probleme releve) : `
        + JSON.stringify(faulty));
    }
    if (clean.length) {
      lines.push(`Lignes saines, pour reference (${clean.length} exemples) : `
        + JSON.stringify(clean));
    }
    if (faulty.length) {
      lines.push('Propose une correction pour chaque ligne en anomalie dont tu peux '
        + 'etablir la valeur avec certitude, pas seulement pour la premiere.');
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
  const MAX_SHOWN = 15;

  /** Au-dela d'une quinzaine de lignes, la liste devient illisible : on la
   *  tronque a l'affichage, mais Appliquer porte bien sur la totalite. */
  function truncate(entries) {
    if (entries.length <= MAX_SHOWN) { return entries.join('\n'); }
    const rest = entries.length - MAX_SHOWN;
    return `${entries.slice(0, MAX_SHOWN).join('\n')}\n... et ${rest} autre`
      + `${rest > 1 ? 's' : ''} correction${rest > 1 ? 's' : ''}`;
  }

  function describeProposal(data) {
    if (!data || !data.display) { return ''; }
    if (data.display === 'issues' && Array.isArray(data.rows)) {
      return truncate(data.rows
        .map((r) => `${r.rowRef} · ${r.field} = "${r.suggestedValue}"`
          + (r.rationale ? `\n    ${r.rationale}` : '')));
    }
    if (data.display === 'mapping' && Array.isArray(data.pairs)) {
      return data.pairs.map((p) => `${p.source} -> ${p.target}`).join('\n');
    }
    if (data.display === 'diagnosis' && Array.isArray(data.rows)) {
      return data.rows
        .filter((r) => r.suggestedFix && r.suggestedFix.field)
        .map((r) => `${r.rowRef} · ${r.suggestedFix.field} = "${r.suggestedFix.value}"`
          + (r.explanation ? `\n    ${r.explanation}` : ''))
        .join('\n');
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
      // Une proposition appartient au tour qui l'a produite. La garder ferait
      // qu'une reponse sans correction affiche celle du tour precedent, avec un
      // bouton Appliquer actif : une proposition hors sujet ressemble a une
      // preuve, c'est pire que pas de proposition du tout.
      $variables.hasProposal = false;
      $variables.proposalText = '';
      $variables.proposalJson = '';
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
