define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Colonne d'anomalie ajoutee a l'export : elle permet de corriger dans Excel
  // en voyant le probleme. L'import la reconnait et l'ecarte, de sorte que
  // l'aller-retour ne pollue pas le dossier.
  const ISSUE_COLUMN = 'Anomalie';
  const SEPARATOR = ';';

  /**
   * Excel reinterprete ce qu'il croit reconnaitre : en locale francaise il
   * transforme MAR01 en date "mars-01", et reecrit les dates a son format. Un
   * code de site ainsi corrompu partirait tel quel dans Oracle, sans que rien
   * ne le signale.
   *
   * La parade est d'ecrire chaque cellule comme une formule texte ="valeur" :
   * Excel l'affiche telle quelle et ne la convertit pas. L'import reconnait
   * cette enveloppe et la retire, de sorte que l'aller-retour est neutre.
   */
  function escapeCsv(value) {
    const text = (value === null || value === undefined) ? '' : String(value);
    if (text === '') { return ''; }
    const inner = text.replace(/"/g, '""""');
    return '"=""' + inner + '"""';
  }

  function buildCsv(columns, rows) {
    const headers = columns.concat([ISSUE_COLUMN]);
    const lines = [headers.map(escapeCsv).join(SEPARATOR)];
    rows.forEach((row) => {
      const values = columns.map((name) => escapeCsv(row[name]));
      const status = row.statusDetail || '';
      values.push(escapeCsv(status));
      lines.push(values.join(SEPARATOR));
    });
    // CRLF et BOM : c'est ce qu'attend Excel, et c'est ce que l'import relit.
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  function download(fileName, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  class exportPlanChain extends ActionChain {

    /**
     * @param {Object} context
     * @param {Object} params
     * @param {Object} params.event
     */
    async run(context, { event } = {}) {
      const { $variables } = context;
      // On exporte la feuille affichee : un CSV melangeant plusieurs objets
      // n'aurait pas de jeu de colonnes commun, et ne se reimporterait pas.
      const sheet = ($variables.sheets || [])[$variables.activeSheet || 0];
      const columns = (sheet && sheet.columns) || [];
      const rows = (sheet && sheet.rows) || [];
      if (!rows.length) { return; }

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');
      try {
        download(`${sheet.object}-${stamp}.csv`, buildCsv(columns, rows));
        $variables.summaryText = `${rows.length} ligne${rows.length > 1 ? 's' : ''} exportee`
          + `${rows.length > 1 ? 's' : ''}. Corrigez le fichier, puis reimportez-le.`;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('exportPlanChain: erreur =', error);
        $variables.errorText = 'L\'export n\'a pas pu etre produit.';
      }
    }
  }

  return exportPlanChain;
});
