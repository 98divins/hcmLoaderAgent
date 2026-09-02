define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Les regles ne sont plus ecrites ici : elles viennent du catalogue de
  // metadonnees, releve sur l'ecran View Business Objects du pod. Ajouter un
  // objet metier revient donc a completer une donnee, pas a modifier du code.

  const DATE_OK = /^\d{4}[/-]\d{2}[/-]\d{2}$/;
  // Format francais : 01/03/2026 se lit 1er mars. L'ambiguite avec le format
  // americain est reelle, la proposition l'annonce donc explicitement.
  const DATE_FR = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;

  /** Un identifiant interne ne se fournit jamais depuis un fichier. */
  function isSystemKey(attribute) {
    return attribute.keyType === 'surrogateId' || attribute.keyType === 'guid';
  }

  function attributeMap(spec) {
    const map = {};
    (spec.attributes || []).forEach((attribute) => { map[attribute.name] = attribute; });
    return map;
  }

  function isDateAttribute(attribute) {
    return attribute && attribute.type === 'Date';
  }

  /**
   * Une colonne obligatoire peut etre satisfaite autrement qu'en etant presente :
   * une reference vers un autre objet se fournit par la cle utilisateur de cet
   * objet. SetId est obligatoire, mais SetCode le renseigne.
   */
  function requiredMissing(spec, columns, row) {
    const missing = [];
    (spec.attributes || []).forEach((attribute) => {
      if (attribute.required === 'no' || isSystemKey(attribute)) { return; }

      const substitutes = attribute.keyType === 'foreignObjectReference'
        ? (attribute.referenceUserKey || [])
        : [];
      const candidates = [attribute.name].concat(substitutes);
      const satisfied = candidates.some((name) => columns.indexOf(name) !== -1
        && String(row[name] || '').trim() !== '');

      if (!satisfied) {
        missing.push({
          name: attribute.name,
          level: attribute.required,
          label: substitutes.length
            ? `${attribute.name} (ou ${substitutes.join(', ')})`
            : attribute.name
        });
      }
    });
    return missing;
  }

  /**
   * Deux severites, et la distinction n'est pas cosmetique.
   *
   * Oracle declare ActiveStatus obligatoire pour un nouvel enregistrement, et a
   * pourtant accepte nos chargements sans lui : la metadonnee est plus stricte
   * que le moteur, qui applique des valeurs par defaut. Bloquer sur cette base
   * refuserait des fichiers que le pod accepte.
   *
   * Bloquent donc : une cle utilisateur vide, un attribut toujours obligatoire,
   * une date au mauvais format. Signalent sans bloquer : les attributs
   * obligatoires seulement pour un nouvel enregistrement, tant qu'on ne sait
   * pas si la ligne cree ou met a jour.
   */
  function checkRow(spec, columns, row, byName) {
    const errors = [];
    const warnings = [];

    (spec.userKey || []).forEach((key) => {
      if (columns.indexOf(key) === -1) { return; }
      if (!String(row[key] || '').trim()) {
        errors.push(`${key} vide : sans lui la ligne n'a pas de reference unique`);
      }
    });

    requiredMissing(spec, columns, row).forEach((entry) => {
      if ((spec.userKey || []).indexOf(entry.name) !== -1) { return; }
      const text = `${entry.label} absent ou vide`;
      if (entry.level === 'always') { errors.push(text); } else { warnings.push(text); }
    });

    columns.forEach((name) => {
      if (!isDateAttribute(byName[name])) { return; }
      const value = String(row[name] || '').trim();
      if (value && !DATE_OK.test(value)) {
        errors.push(`${name} : "${value}" n'est pas une date aaaa/mm/jj`);
      }
    });

    return { errors, warnings };
  }

  /**
   * Corrections que le code etablit lui-meme : une date a remettre au format
   * attendu, ou une valeur absente que toutes les autres lignes portent a
   * l'identique. Deterministe, immediat, et disponible meme si l'assistant ne
   * propose rien. Les colonnes concernees viennent du catalogue.
   */
  function deriveFixes(spec, rows, columns, byName) {
    const fixes = [];

    const single = {};
    (spec.attributes || []).forEach((attribute) => {
      const name = attribute.name;
      const isKey = (spec.userKey || []).indexOf(name) !== -1;
      if ((attribute.required === 'no' && !isKey) || isSystemKey(attribute)) { return; }
      if (columns.indexOf(name) === -1 || single[name] !== undefined) { return; }
      const seen = [];
      rows.forEach((row) => {
        const value = String(row[name] || '').trim();
        if (value && seen.indexOf(value) === -1) { seen.push(value); }
      });
      single[name] = (seen.length === 1) ? seen[0] : null;
    });

    rows.forEach((row) => {
      columns.forEach((name) => {
        const raw = String(row[name] || '').trim();

        if (!raw && single[name]) {
          fixes.push({
            rowRef: row.rowKey,
            field: name,
            suggestedValue: single[name],
            rationale: `toutes les autres lignes portent "${single[name]}"`
          });
          return;
        }

        if (raw && isDateAttribute(byName[name]) && !DATE_OK.test(raw)) {
          const parts = DATE_FR.exec(raw);
          if (parts) {
            fixes.push({
              rowRef: row.rowKey,
              field: name,
              suggestedValue: `${parts[3]}/${parts[2]}/${parts[1]}`,
              rationale: `"${raw}" lu comme jj/mm/aaaa`
            });
          }
        }
      });
    });

    return fixes;
  }

  class checkPlanChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     * @param {boolean} params.ask  solliciter l'assistant apres le controle
     */
    async run(context, { event, ask } = {}) {
      const { $variables } = context;
      const columns = $variables.columns || [];
      const rows = $variables.rows || [];
      if (!rows.length) { return; }

      const catalog = $variables.objectCatalog || {};
      const spec = (catalog.objects || {})[$variables.businessObject];

      // Sans metadonnees, on ne devine pas : mieux vaut le dire que controler
      // avec des regles inventees qui laisseraient passer un fichier faux.
      if (!spec) {
        $variables.errorText = `Les metadonnees de l'objet ${$variables.businessObject} ne `
          + 'sont pas dans le catalogue. Ajoutez-les depuis View Business Objects avant '
          + 'de controler ce dossier.';
        $variables.hasAutoFix = false;
        $variables.autoFixText = '';
        $variables.autoFixJson = '';
        return;
      }

      const byName = attributeMap(spec);
      const unknown = columns.filter((name) => !byName[name]);
      const missingKeys = (spec.userKey || []).filter((key) => columns.indexOf(key) === -1);

      let issueCount = 0;
      let warnCount = 0;
      const checked = rows.map((row) => {
        const { errors, warnings } = checkRow(spec, columns, row, byName);
        const next = Object.assign({}, row);
        const blocking = missingKeys.length || errors.length;
        if (blocking) { issueCount += 1; }
        if (!blocking && warnings.length) { warnCount += 1; }
        next.statusLabel = errors.length
          ? errors.join(' · ')
          : (warnings.length ? `a verifier : ${warnings.join(' · ')}` : 'ok');
        return next;
      });

      $variables.rows = checked;
      $variables.countIssues = issueCount;
      // Le rail suit l'etat reel du dossier : un plan sans anomalie est arrive
      // a l'etape de chargement, il n'y a plus rien a controler.
      $variables.step = issueCount ? 'review' : 'submit';

      const fixes = deriveFixes(spec, checked, columns, byName);
      $variables.hasAutoFix = fixes.length > 0;
      $variables.autoFixJson = fixes.length
        ? JSON.stringify({ display: 'issues', rows: fixes }) : '';
      $variables.autoFixText = fixes
        .map((f) => `${f.rowRef} · ${f.field} = "${f.suggestedValue}"\n    ${f.rationale}`)
        .join('\n');

      // Une colonne inconnue de l'objet fait rejeter le chargement plusieurs
      // minutes plus tard, avec un message obscur : autant le dire tout de suite.
      const structural = [];
      if (missingKeys.length) {
        structural.push(`Colonnes de cle absentes : ${missingKeys.join(', ')}. `
          + 'Sans elles, aucune ligne ne peut etre identifiee.');
      }
      if (unknown.length) {
        structural.push(`Colonnes inconnues de l'objet ${spec.name} : ${unknown.join(', ')}.`);
      }
      $variables.errorText = structural.join(' ');

      $variables.question = (ask !== false && issueCount)
        ? 'Analyse des anomalies relevees par le controle : quelles lignes posent '
          + 'probleme, et quelles corrections sont applicables ?'
        : '';

      const clean = rows.length - issueCount;
      const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
      const state = issueCount
        ? `${plural(clean, 'ligne')} ${clean > 1 ? 'saines' : 'saine'} · ${issueCount} a corriger`
        : `${plural(rows.length, 'ligne')} ${rows.length > 1 ? 'saines' : 'saine'}`;
      const withWarnings = warnCount
        ? `${state} · ${warnCount} a verifier` : state;
      const note = $variables.appliedNote || '';
      $variables.appliedNote = '';
      $variables.summaryText = note ? `${note} · ${withWarnings}` : withWarnings;
    }
  }

  return checkPlanChain;
});
