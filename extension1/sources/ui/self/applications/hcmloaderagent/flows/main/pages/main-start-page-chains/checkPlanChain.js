define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Les regles viennent du catalogue de metadonnees, releve sur l'ecran
  // View Business Objects. Ajouter un objet metier revient donc a completer une
  // donnee, pas a modifier ce fichier.

  const DATE_OK = /^\d{4}[/-]\d{2}[/-]\d{2}$/;
  // Format francais : 01/03/2026 se lit 1er mars. L'ambiguite avec le format
  // americain est reelle, la proposition l'annonce donc explicitement.
  const DATE_FR = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;

  // Ou lire le tenant pour savoir si un enregistrement existe deja. Seules les
  // ressources reellement declarees dans les connexions de service figurent ici :
  // un objet absent de cette table est annonce "non verifie", jamais suppose
  // absent. Presumer l'absence ferait passer une mise a jour pour une creation.
  //
  // keyIndex designe la colonne de cle utilisateur qui porte la valeur cherchee,
  // telle que la feuille courante la nomme : LocationCode sur le site comme sur
  // ses adresses, mais Name sur l'organisation et OrganizationName sur ses
  // classifications.
  const TENANT = {
    Location: {
      endpoint: 'site_hcm_extension:hcmRestLocations/getall_locationsV2',
      field: 'LocationCode',
      keyIndex: 0
    },
    Organization: {
      endpoint: 'site_hcm_extension:hcmRestOrganizations/getall_organizations',
      field: 'Name',
      keyIndex: 0,
      // Deux organisations peuvent porter le meme nom sous deux classifications :
      // la classification departage quand la feuille et la ressource la portent.
      extra: { field: 'ClassificationCode', column: 'ClassificationCode' }
    }
  };
  const BATCH = 20;

  const LABEL_IN_DOSSIER = 'parent cree dans ce dossier';

  /** Un identifiant interne ne se fournit jamais depuis un fichier. */
  function isSystemKey(attribute) {
    return attribute.keyType === 'surrogateId'
      || attribute.keyType === 'parentSurrogateId'
      || attribute.keyType === 'guid';
  }

  function attributeMap(spec) {
    const map = {};
    (spec.attributes || []).forEach((attribute) => { map[attribute.name] = attribute; });
    return map;
  }

  function isDateAttribute(attribute) {
    return attribute && attribute.type === 'date';
  }

  function value(row, name) {
    return String((row && row[name]) || '').trim();
  }

  /**
   * Signature d'une ligne pour un jeu de colonnes : sert de cle de jointure.
   * Sensible a la casse : Oracle compare les codes tels quels, deux codes qui
   * ne different que par la casse sont deux enregistrements.
   */
  function signature(row, columns) {
    return columns.map((name) => value(row, name)).join('');
  }

  /**
   * Une colonne flexfield se reconnait a sa forme : FLEX:<code>, EFF_CATEGORY_CODE,
   * ou segment(<code>=<contexte>). Le segment lui-meme n'est pas confronte a la
   * liste des segments du pod, trop volumineuse pour la page : il est accepte et
   * signale non verifie, plutot que rejete comme colonne inconnue.
   */
  function isFlexColumn(spec, name) {
    const flex = spec.flexfield;
    if (!flex || !flex.code) { return false; }
    if (name === `FLEX:${flex.code}`) { return true; }
    if (flex.support === 'EFF' && name === 'EFF_CATEGORY_CODE') { return true; }
    return new RegExp(`^[A-Za-z0-9_]+\\(${flex.code}=[^)]+\\)$`).test(name);
  }

  /**
   * Une colonne obligatoire peut etre satisfaite autrement qu'en etant presente :
   * une reference vers un autre objet se fournit par la cle utilisateur de cet
   * objet. SetId est obligatoire, mais SetCode le renseigne.
   */
  function requiredMissing(spec, columns, row, operation) {
    const missing = [];
    (spec.attributes || []).forEach((attribute) => {
      if (attribute.required === 'no' || isSystemKey(attribute)) { return; }
      // Une suppression n'a besoin que de quoi identifier l'enregistrement :
      // exiger les attributs d'une creation signalerait de fausses anomalies.
      if (operation === 'DELETE' && attribute.required !== 'always') { return; }

      const substitutes = attribute.foreignUserKey || [];
      const candidates = [attribute.name].concat(substitutes);
      const satisfied = candidates.some((name) => columns.indexOf(name) !== -1
        && value(row, name) !== '');

      if (!satisfied) {
        missing.push({
          name: attribute.name,
          level: attribute.softRequired ? 'forNewRecords' : attribute.required,
          label: substitutes.length
            ? `${attribute.name} (ou ${substitutes.join(', ')})`
            : attribute.name
        });
      }
    });
    return missing;
  }

  /**
   * Regles qu'aucune colonne ne porte : l'obligation depend de la valeur d'une
   * autre colonne. SetCode est obligatoire pour une classification DEPARTMENT,
   * et interdit pour les autres types. Le catalogue cite la phrase d'Oracle dont
   * chaque regle est tiree.
   */
  function conditionalIssues(spec, columns, row) {
    const errors = [];
    const warnings = [];

    (spec.conditionalRules || []).forEach((rule) => {
      if (columns.indexOf(rule.column) === -1) { return; }
      const present = value(row, rule.column) !== '';

      const matches = (clause) => {
        if (!clause || columns.indexOf(clause.column) === -1) { return false; }
        const actual = value(row, clause.column).toUpperCase();
        if (clause.equals !== undefined) {
          return actual === String(clause.equals).toUpperCase();
        }
        if (clause.notEquals !== undefined) {
          return actual !== '' && actual !== String(clause.notEquals).toUpperCase();
        }
        return false;
      };

      if (!present && matches(rule.requiredWhen)) {
        (rule.severity === 'error' ? errors : warnings).push(
          `${rule.column} est obligatoire quand ${rule.requiredWhen.column} `
          + `vaut ${rule.requiredWhen.equals}`);
      }
      if (present && matches(rule.forbiddenWhen)) {
        (rule.severity === 'error' ? errors : warnings).push(
          `${rule.column} ne doit pas etre fourni quand `
          + `${rule.forbiddenWhen.column} ne vaut pas ${rule.forbiddenWhen.notEquals}`);
      }
      // Les regles dependant du pays sont signalees sans etre tranchees : le
      // catalogue dit qu'elles existent, pas pour quels pays elles s'appliquent.
      if (rule.dependsOnCountry && !present && value(row, 'Country') !== '') {
        warnings.push(`${rule.column} peut etre obligatoire pour le pays `
          + `${value(row, 'Country')}`);
      }
    });

    return { errors, warnings };
  }

  /**
   * Une valeur soumise a un lookup doit appartenir au referentiel du pod, lu a
   * l'ouverture du dossier. Referentiel illisible : la valeur n'est ni validee
   * ni invalidee, et la feuille le dit.
   */
  function lookupIssues(columns, row, byName, lookups, unverified) {
    const errors = [];
    columns.forEach((name) => {
      const attribute = byName[name];
      if (!attribute || !attribute.lookup) { return; }
      const raw = value(row, name);
      if (!raw) { return; }
      const entry = lookups[attribute.lookup];
      if (!entry || !entry.ok) {
        unverified[attribute.lookup] = true;
        return;
      }
      if (entry.codes.indexOf(raw) === -1) {
        const sample = entry.codes.slice(0, 6).join(', ');
        errors.push(`${name} : "${raw}" n'est pas une valeur du referentiel `
          + `${attribute.lookup}${sample ? ` (${sample}${entry.codes.length > 6 ? ', ...' : ''})` : ''}`);
      }
    });
    return errors;
  }

  /**
   * Deux severites, et la distinction n'est pas cosmetique.
   *
   * Oracle declare ActiveStatus obligatoire pour un nouvel enregistrement, et a
   * pourtant accepte nos chargements sans lui : la metadonnee est plus stricte
   * que le moteur, qui applique des valeurs par defaut. Bloquer sur cette base
   * refuserait des fichiers que le pod accepte.
   */
  function checkRow(spec, columns, row, byName, operation, lookups, unverified) {
    const errors = [];
    const warnings = [];

    (spec.userKey || []).forEach((key) => {
      if (columns.indexOf(key) === -1) { return; }
      if (!value(row, key)) {
        errors.push(`${key} vide : sans lui la ligne n'a pas de reference unique`);
      }
    });

    requiredMissing(spec, columns, row, operation).forEach((entry) => {
      if ((spec.userKey || []).indexOf(entry.name) !== -1) { return; }
      const text = `${entry.label} absent ou vide`;
      if (entry.level === 'always') { errors.push(text); } else { warnings.push(text); }
    });

    columns.forEach((name) => {
      if (!isDateAttribute(byName[name])) { return; }
      const raw = value(row, name);
      if (raw && !DATE_OK.test(raw)) {
        errors.push(`${name} : "${raw}" n'est pas une date aaaa/mm/jj`);
      }
    });

    errors.push.apply(errors, lookupIssues(columns, row, byName, lookups, unverified));

    // Les regles conditionnelles decrivent ce qu'une creation doit porter.
    const conditional = operation === 'DELETE'
      ? { errors: [], warnings: [] }
      : conditionalIssues(spec, columns, row);
    return {
      errors: errors.concat(conditional.errors),
      warnings: warnings.concat(conditional.warnings)
    };
  }

  /**
   * Deux lignes portant la meme cle utilisateur dans une feuille : la seconde
   * ecrase silencieusement la premiere cote Oracle. Le SequenceNumber des EFF
   * existe precisement pour eviter ce cas, encore faut-il le signaler.
   */
  function duplicateKeys(spec, columns, rows) {
    const keyColumns = (spec.userKey || []).filter((name) => columns.indexOf(name) !== -1);
    if (!keyColumns.length) { return { keyColumns: [], duplicated: {} }; }
    const seen = {};
    const duplicated = {};
    rows.forEach((row) => {
      const key = signature(row, keyColumns);
      if (seen[key]) { duplicated[key] = true; }
      seen[key] = true;
    });
    return { keyColumns, duplicated };
  }

  /**
   * Corrections que le code etablit lui-meme : une date a remettre au format
   * attendu, ou une valeur absente que toutes les autres lignes portent a
   * l'identique. Deterministe, immediat, et disponible meme si l'assistant ne
   * propose rien.
   */
  function deriveFixes(spec, sheetIndex, rows, columns, byName) {
    const fixes = [];

    const single = {};
    (spec.attributes || []).forEach((attribute) => {
      const name = attribute.name;
      const isKey = (spec.userKey || []).indexOf(name) !== -1;
      if ((attribute.required === 'no' && !isKey) || isSystemKey(attribute)) { return; }
      if (columns.indexOf(name) === -1 || single[name] !== undefined) { return; }
      const seen = [];
      rows.forEach((row) => {
        const raw = value(row, name);
        if (raw && seen.indexOf(raw) === -1) { seen.push(raw); }
      });
      single[name] = (seen.length === 1) ? seen[0] : null;
    });

    rows.forEach((row) => {
      columns.forEach((name) => {
        const raw = value(row, name);

        if (!raw && single[name]) {
          fixes.push({
            sheet: sheetIndex,
            object: spec.uiName,
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
              sheet: sheetIndex,
              object: spec.uiName,
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

  /**
   * Interroge le tenant par lots : une requete IN par vingtaine de valeurs, au
   * lieu d'un appel par ligne. La reponse est confrontee a chaque valeur : un
   * enregistrement qui ne la porte pas ne compte jamais comme trouve.
   *
   * @returns {Object} valeur -> true (present), false (absent), null (non verifie)
   */
  async function askTenant(context, lookup, wanted, extraWanted) {
    const found = {};
    const distinct = [];
    wanted.forEach((v) => { if (v && distinct.indexOf(v) === -1) { distinct.push(v); } });

    for (let start = 0; start < distinct.length; start += BATCH) {
      const batch = distinct.slice(start, start + BATCH);
      const quoted = batch.map((v) => `'${v.replace(/'/g, '')}'`).join(',');
      try {
        // uriParams : la seule forme de parametrage verifiee en execution
        // reelle sur ce backend. Un filtre place ailleurs est ignore, et la
        // ressource repond alors ses premiers enregistrements, quels qu'ils soient.
        // eslint-disable-next-line no-await-in-loop
        const answer = await Actions.callRest(context, {
          endpoint: lookup.endpoint,
          uriParams: {
            q: `${lookup.field} IN (${quoted})`,
            onlyData: true,
            limit: 500
          }
        });
        const body = (answer && answer.body) || {};
        const items = Array.isArray(body.items) ? body.items : [];
        batch.forEach((v) => {
          const hits = items.filter((item) => String(item[lookup.field] || '').trim() === v);
          if (!hits.length) { found[v] = false; return; }
          if (!lookup.extra || !extraWanted[v]) { found[v] = true; return; }
          const carries = hits.some((item) => item[lookup.extra.field] !== undefined);
          if (!carries) { found[v] = true; return; }
          found[v] = hits.some((item) => String(item[lookup.extra.field] || '').trim()
            === extraWanted[v]);
        });
      } catch (err) {
        // Ni valide ni invalide : on ne sait pas, et on le dit.
        batch.forEach((v) => { found[v] = null; });
      }
    }
    return found;
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
      const catalog = $variables.objectCatalog || {};
      const operation = $variables.operation || 'MERGE';
      const lookups = $variables.lookupValues || {};
      const all = $variables.sheets || [];
      if (!all.some((sheet) => (sheet.rows || []).length)) { return; }
      if ($variables.isChecking) { return; }

      $variables.isChecking = true;
      $variables.armedAction = '';
      try {
        await this.check(context, { catalog, operation, lookups, all, ask });
      } finally {
        $variables.isChecking = false;
      }
    }

    async check(context, { catalog, operation, lookups, all, ask }) {
      const { $variables } = context;
      const structural = [];
      const fixes = [];
      const summarySheets = [];

      const checkedSheets = all.map((sheet, sheetIndex) => {
        const spec = (catalog.objects || {})[sheet.object];
        const columns = sheet.columns || [];
        const rows = sheet.rows || [];
        if (!spec || !rows.length) { return sheet; }

        const byName = attributeMap(spec);
        const flexColumns = columns.filter((name) => !byName[name] && isFlexColumn(spec, name));
        const unknown = columns.filter((name) => !byName[name] && !isFlexColumn(spec, name));
        const missingKeys = (spec.userKey || []).filter((key) => columns.indexOf(key) === -1);
        const dup = duplicateKeys(spec, columns, rows);
        const unverifiedLookups = {};
        const notes = [];

        if (missingKeys.length) {
          structural.push(`${sheet.label} : colonnes de cle absentes `
            + `(${missingKeys.join(', ')}). Sans elles, aucune ligne n'est identifiable.`);
        }
        if (unknown.length) {
          structural.push(`${sheet.label} : colonnes inconnues de l'objet `
            + `(${unknown.join(', ')}).`);
        }
        if (flexColumns.length) {
          notes.push(`${flexColumns.length} colonne${flexColumns.length > 1 ? 's' : ''} `
            + 'flexfield reconnue'
            + `${flexColumns.length > 1 ? 's' : ''} par sa forme, segments non verifies`);
        }

        let issues = 0;
        let warns = 0;
        const items = [];
        const checked = rows.map((row) => {
          const { errors, warnings } = checkRow(spec, columns, row, byName, operation,
            lookups, unverifiedLookups);
          if (dup.keyColumns.length && dup.duplicated[signature(row, dup.keyColumns)]) {
            errors.push('cle utilisateur en double : une autre ligne porte la meme '
              + `${dup.keyColumns.join(' + ')} et l'ecraserait`);
          }
          const next = Object.assign({}, row);
          const blocking = missingKeys.length || errors.length;
          if (blocking) { issues += 1; } else if (warnings.length) { warns += 1; }
          next.statusLabel = errors.length ? 'erreur' : (warnings.length ? 'a verifier' : 'ok');
          next.statusDetail = errors.concat(warnings).join(' ; ');
          next.matchLabel = '';
          if (errors.length || warnings.length) {
            items.push({ rowKey: row.rowKey, state: next.statusLabel, text: next.statusDetail });
          }
          return next;
        });

        Object.keys(unverifiedLookups).forEach((type) => {
          notes.push(`referentiel ${type} non lisible : valeurs non verifiees`);
        });

        fixes.push.apply(fixes, deriveFixes(spec, sheetIndex, checked, columns, byName));
        summarySheets.push({ index: sheetIndex, label: sheet.label, notes, items });

        return Object.assign({}, sheet, {
          rows: checked,
          countIssues: issues,
          countWarnings: warns
        });
      });

      // Rapprochement : chaque ligne enfant doit pouvoir designer son parent,
      // dans le dossier ou dans le tenant. C'est le seul controle qu'un fichier
      // seul ne peut pas faire, et celui qui evite le rejet le plus courant.
      const byObject = {};
      checkedSheets.forEach((sheet) => { byObject[sheet.object] = sheet; });
      const match = { dossier: 0, tenant: 0, missing: 0, unverified: 0, create: 0, update: 0 };

      for (let i = 0; i < checkedSheets.length; i += 1) {
        const sheet = checkedSheets[i];
        const spec = (catalog.objects || {})[sheet.object];
        if (!spec || !(sheet.rows || []).length) { continue; }

        const parent = spec.parent;
        const keyColumns = parent ? parent.userKey : (spec.userKey || []);
        const usable = keyColumns.filter(
          (name) => (sheet.columns || []).indexOf(name) !== -1);

        // La feuille parent du meme dossier, indexee sur SES colonnes de cle :
        // l'enfant et le parent ne les nomment pas forcement pareil.
        const parentSheet = parent ? byObject[parent.object] : null;
        const parentSpec = parent ? (catalog.objects || {})[parent.object] : null;
        const inDossier = {};
        if (parentSheet && parentSpec && usable.length === keyColumns.length) {
          const parentColumns = (parentSpec.userKey || []).filter(
            (name) => (parentSheet.columns || []).indexOf(name) !== -1);
          if (parentColumns.length === usable.length) {
            (parentSheet.rows || []).forEach((row) => {
              inDossier[signature(row, parentColumns)] = true;
            });
          }
        }

        const lookup = TENANT[parent ? parent.object : sheet.object];
        const matchColumn = lookup ? keyColumns[lookup.keyIndex] : '';
        const canAsk = Boolean(lookup && usable.indexOf(matchColumn) !== -1);

        // Les lignes qui ne se resolvent pas dans le dossier partent au tenant,
        // en une passe groupee.
        const pending = [];
        const extraWanted = {};
        sheet.rows.forEach((row) => {
          if (!usable.length) { return; }
          if (parent && inDossier[signature(row, usable)]) { return; }
          if (!canAsk) { return; }
          const wanted = value(row, matchColumn);
          if (!wanted) { return; }
          pending.push(wanted);
          if (lookup.extra && (sheet.columns || []).indexOf(lookup.extra.column) !== -1) {
            extraWanted[wanted] = value(row, lookup.extra.column);
          }
        });
        // eslint-disable-next-line no-await-in-loop
        const found = pending.length ? await askTenant(context, lookup, pending, extraWanted) : {};

        sheet.rows.forEach((row) => {
          if (!usable.length) {
            row.matchLabel = 'non verifie : colonnes de reference absentes';
            match.unverified += 1;
            return;
          }
          if (parent && inDossier[signature(row, usable)]) {
            row.matchLabel = LABEL_IN_DOSSIER;
            match.dossier += 1;
            return;
          }
          if (!canAsk) {
            row.matchLabel = parent
              ? "non verifie : cet objet parent n'est pas interrogeable"
              : 'non verifie : creation ou mise a jour indeterminee';
            match.unverified += 1;
            return;
          }
          const state = found[value(row, matchColumn)];
          if (state === null || state === undefined) {
            row.matchLabel = "non verifie : reponse du tenant absente ou hors filtre";
            match.unverified += 1;
          } else if (state) {
            row.matchLabel = parent ? 'parent deja present dans le tenant' : 'mise a jour';
            if (parent) { match.tenant += 1; } else { match.update += 1; }
          } else if (parent) {
            row.matchLabel = 'parent introuvable : la ligne serait rejetee';
            row.statusLabel = 'erreur';
            row.statusDetail = row.statusDetail
              ? `${row.statusDetail} ; parent introuvable dans le dossier et dans le tenant`
              : 'parent introuvable dans le dossier et dans le tenant';
            sheet.countIssues += 1;
            match.missing += 1;
            const entry = summarySheets.filter((s) => s.index === i)[0];
            if (entry) {
              entry.items.push({ rowKey: row.rowKey, state: 'erreur',
                text: 'parent introuvable dans le dossier et dans le tenant' });
            }
          } else {
            row.matchLabel = 'creation';
            match.create += 1;
          }
        });
      }

      let totalIssues = 0;
      let totalWarns = 0;
      let totalRows = 0;
      checkedSheets.forEach((sheet) => {
        totalIssues += sheet.countIssues || 0;
        totalWarns += sheet.countWarnings || 0;
        const count = (sheet.rows || []).length;
        totalRows += count;
        sheet.statusLabel = count
          ? `${count} ligne${count > 1 ? 's' : ''}`
            + (sheet.countIssues ? ` - ${sheet.countIssues} a corriger` : ' - conforme')
          : 'aucune donnee';
      });

      $variables.sheets = checkedSheets;
      $variables.countIssues = totalIssues;
      $variables.countTotal = totalRows;
      // Le rail suit l'etat reel du dossier : un dossier sans anomalie est
      // arrive a l'etape de chargement, il n'y a plus rien a controler.
      $variables.step = totalIssues ? 'review' : 'submit';

      $variables.checkSummary = {
        rows: totalRows,
        clean: totalRows - totalIssues - totalWarns,
        issues: totalIssues,
        warnings: totalWarns,
        operation,
        match,
        sheets: summarySheets.map((entry) => ({
          label: entry.label,
          notes: entry.notes,
          issues: (checkedSheets[entry.index] || {}).countIssues || 0,
          warnings: (checkedSheets[entry.index] || {}).countWarnings || 0,
          items: entry.items.slice(0, 8),
          more: Math.max(0, entry.items.length - 8)
        }))
      };

      $variables.hasAutoFix = fixes.length > 0;
      $variables.autoFixJson = fixes.length
        ? JSON.stringify({ display: 'issues', rows: fixes }) : '';
      $variables.autoFixText = fixes
        .map((f) => `${f.object} - ${f.rowRef} - ${f.field} = "${f.suggestedValue}"`
          + `\n    ${f.rationale}`)
        .join('\n');

      $variables.errorText = structural.join(' ');
      $variables.question = (ask !== false && totalIssues)
        ? 'Analyse des anomalies relevees par le controle : quelles lignes posent '
          + 'probleme, et quelles corrections sont applicables ?'
        : '';

      const clean = totalRows - totalIssues;
      const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
      const state = totalIssues
        ? `${plural(clean, 'ligne')} ${clean > 1 ? 'saines' : 'saine'} - `
          + `${totalIssues} a corriger`
        : `${plural(totalRows, 'ligne')} ${totalRows > 1 ? 'saines' : 'saine'}`;
      const withWarnings = totalWarns ? `${state} - ${totalWarns} a verifier` : state;
      const note = $variables.appliedNote || '';
      $variables.appliedNote = '';
      $variables.summaryText = note ? `${note} - ${withWarnings}` : withWarnings;
    }
  }

  return checkPlanChain;
});
