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
  const TENANT = {
    Location: {
      endpoint: 'site_hcm_extension:hcmRestLocations/getall_locationsV2',
      matchOn: 'LocationCode'
    }
  };

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

  /** Signature d'une ligne pour un jeu de colonnes : sert de cle de jointure. */
  function signature(row, columns) {
    return columns.map((name) => value(row, name).toUpperCase()).join('');
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
   * Deux severites, et la distinction n'est pas cosmetique.
   *
   * Oracle declare ActiveStatus obligatoire pour un nouvel enregistrement, et a
   * pourtant accepte nos chargements sans lui : la metadonnee est plus stricte
   * que le moteur, qui applique des valeurs par defaut. Bloquer sur cette base
   * refuserait des fichiers que le pod accepte.
   */
  function checkRow(spec, columns, row, byName) {
    const errors = [];
    const warnings = [];

    (spec.userKey || []).forEach((key) => {
      if (columns.indexOf(key) === -1) { return; }
      if (!value(row, key)) {
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
      const raw = value(row, name);
      if (raw && !DATE_OK.test(raw)) {
        errors.push(`${name} : "${raw}" n'est pas une date aaaa/mm/jj`);
      }
    });

    const conditional = conditionalIssues(spec, columns, row);
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
      const all = $variables.sheets || [];
      if (!all.some((sheet) => (sheet.rows || []).length)) { return; }

      const structural = [];
      const fixes = [];

      const checkedSheets = all.map((sheet, sheetIndex) => {
        const spec = (catalog.objects || {})[sheet.object];
        const columns = sheet.columns || [];
        const rows = sheet.rows || [];
        if (!spec || !rows.length) { return sheet; }

        const byName = attributeMap(spec);
        const unknown = columns.filter((name) => !byName[name]);
        const missingKeys = (spec.userKey || []).filter((key) => columns.indexOf(key) === -1);
        const dup = duplicateKeys(spec, columns, rows);

        if (missingKeys.length) {
          structural.push(`${sheet.label} : colonnes de cle absentes `
            + `(${missingKeys.join(', ')}). Sans elles, aucune ligne n'est identifiable.`);
        }
        if (unknown.length) {
          structural.push(`${sheet.label} : colonnes inconnues de l'objet `
            + `(${unknown.join(', ')}).`);
        }

        let issues = 0;
        let warns = 0;
        const checked = rows.map((row) => {
          const { errors, warnings } = checkRow(spec, columns, row, byName);
          if (dup.keyColumns.length && dup.duplicated[signature(row, dup.keyColumns)]) {
            errors.push('cle utilisateur en double : une autre ligne porte la meme '
              + `${dup.keyColumns.join(' + ')} et l'ecraserait`);
          }
          const next = Object.assign({}, row);
          const blocking = missingKeys.length || errors.length;
          if (blocking) { issues += 1; } else if (warnings.length) { warns += 1; }
          next.statusLabel = errors.length
            ? errors.join(' - ')
            : (warnings.length ? `a verifier : ${warnings.join(' - ')}` : 'ok');
          next.matchLabel = '';
          return next;
        });

        fixes.push.apply(fixes, deriveFixes(spec, sheetIndex, checked, columns, byName));

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
      const tenantCache = {};

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
        const matchOn = lookup && usable.indexOf(lookup.matchOn) !== -1 ? lookup.matchOn : '';

        for (let r = 0; r < sheet.rows.length; r += 1) {
          const row = sheet.rows[r];

          if (!usable.length) {
            row.matchLabel = 'non verifie : colonnes de reference absentes';
            continue;
          }
          if (parent && inDossier[signature(row, usable)]) {
            row.matchLabel = 'parent cree dans ce dossier';
            continue;
          }
          if (!matchOn) {
            row.matchLabel = parent
              ? "non verifie : cet objet parent n'est pas interrogeable"
              : 'non verifie : creation ou mise a jour indeterminee';
            continue;
          }

          const wanted = value(row, matchOn);
          if (!wanted) { continue; }

          if (tenantCache[wanted] === undefined) {
            try {
              const answer = await Actions.callRest(context, {
                endpoint: lookup.endpoint,
                requestTransformOptions: {
                  query: { q: `${matchOn}='${wanted.replace(/'/g, '')}'`, limit: 1 }
                }
              });
              const body = (answer && answer.body) || {};
              tenantCache[wanted] = Array.isArray(body.items) && body.items.length > 0;
            } catch (err) {
              // Ni valide ni invalide : on ne sait pas, et on le dit.
              tenantCache[wanted] = null;
            }
          }

          const found = tenantCache[wanted];
          if (found === null) {
            row.matchLabel = "non verifie : le tenant n'a pas repondu";
          } else if (found) {
            row.matchLabel = parent ? 'parent deja present dans le tenant' : 'mise a jour';
          } else if (parent) {
            row.matchLabel = 'parent introuvable : la ligne serait rejetee';
            row.statusLabel = row.statusLabel === 'ok'
              ? 'parent introuvable : la ligne serait rejetee'
              : `${row.statusLabel} - parent introuvable`;
            sheet.countIssues += 1;
          } else {
            row.matchLabel = 'creation';
          }
        }
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
      // Le rail suit l'etat reel du dossier : un plan sans anomalie est arrive
      // a l'etape de chargement, il n'y a plus rien a controler.
      $variables.step = totalIssues ? 'review' : 'submit';

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
