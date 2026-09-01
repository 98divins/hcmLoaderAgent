define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Colonne d'anomalie ajoutee a l'export : elle permet de corriger dans Excel
  // en voyant le probleme. L'import la reconnait et l'ecarte, de sorte que
  // l'aller-retour ne pollue pas le plan.
  const ISSUE_COLUMN = 'Anomalie';
  const SEPARATOR = ';';

  /**
   * Un champ contenant le separateur, un guillemet ou un saut de ligne doit
   * etre cite, et ses guillemets doubles. Sans cela, une adresse avec virgule
   * ou point-virgule casse le fichier a la relecture.
   */
  function escapeCsv(value) {
    const text = (value === null || value === undefined) ? '' : String(value);
    if (text.indexOf(SEPARATOR) === -1 && text.indexOf('"') === -1
        && text.indexOf('\n') === -1 && text.indexOf('\r') === -1) {
      return text;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }

  function buildCsv(columns, rows) {
    const headers = columns.concat([ISSUE_COLUMN]);
    const lines = [headers.map(escapeCsv).join(SEPARATOR)];
    rows.forEach((row) => {
      const values = columns.map((name) => escapeCsv(row[name]));
      const status = row.statusLabel === 'ok' ? '' : (row.statusLabel || '');
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
      const columns = $variables.columns || [];
      const rows = $variables.rows || [];
      if (!rows.length) { return; }

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');
      try {
        download(`${$variables.businessObject}-${stamp}.csv`, buildCsv(columns, rows));
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
