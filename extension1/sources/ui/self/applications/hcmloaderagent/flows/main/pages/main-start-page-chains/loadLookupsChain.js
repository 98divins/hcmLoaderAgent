define(['vb/action/actionChain', 'vb/action/actions'], (ActionChain, Actions) => {
  'use strict';

  // Ressource confirmee dans la documentation REST HCM ; le vocabulaire de la
  // reponse (LookupCode, Meaning) est celui des lookups communs.
  const LOOKUPS = 'site_hcm_extension:hcmRestLookups/getall_commonLookupsLOV';

  /**
   * Lit dans le tenant les referentiels dont le dossier aura besoin : les
   * types de lookup declares sur les attributs des objets de la hierarchie.
   *
   * Les valeurs ne sont jamais codees ici, elles evoluent dans le pod. Un
   * referentiel illisible (droits, ressource absente) est marque comme tel :
   * le controle dira alors que les valeurs ne sont pas verifiees, plutot que
   * de les declarer valides ou fausses.
   */
  class loadLookupsChain extends ActionChain {

    async run(context) {
      const { $variables } = context;
      const catalog = $variables.objectCatalog || {};
      const tree = (catalog.hierarchies || {})[$variables.hierarchy];
      if (!tree) { return; }

      const types = [];
      [tree.top].concat(tree.children || []).forEach((name) => {
        const spec = (catalog.objects || {})[name] || {};
        (spec.attributes || []).forEach((attribute) => {
          if (attribute.lookup && types.indexOf(attribute.lookup) === -1) {
            types.push(attribute.lookup);
          }
        });
      });

      // Les cles source ne s'ecrivent que si le proprietaire de source est
      // enregistre dans le tenant : HDL rejette toute valeur absente du lookup
      // HRC_SOURCE_SYSTEM_OWNER. Une lecture impossible vaut absence.
      if (types.indexOf('HRC_SOURCE_SYSTEM_OWNER') === -1) { types.push('HRC_SOURCE_SYSTEM_OWNER'); }

      const values = {};
      for (let i = 0; i < types.length; i += 1) {
        const type = types[i];
        try {
          // eslint-disable-next-line no-await-in-loop
          const answer = await Actions.callRest(context, {
            endpoint: LOOKUPS,
            uriParams: { q: `LookupType='${type}'`, onlyData: true, limit: 500 }
          });
          const body = (answer && answer.body) || {};
          const items = Array.isArray(body.items) ? body.items : [];
          const codes = items
            .filter((item) => String(item.LookupType || type) === type)
            .map((item) => String(item.LookupCode || '').trim())
            .filter((code) => code !== '');
          // Une reponse vide n'est pas un referentiel vide : c'est plus
          // probablement un lookup protege, qui ne sort pas de cette ressource.
          values[type] = codes.length
            ? { ok: true, codes, meanings: items.map((item) => item.Meaning || '') }
            : { ok: false, reason: 'aucune valeur rendue' };
        } catch (err) {
          values[type] = { ok: false, reason: 'lecture refusee' };
        }
      }

      const owners = values.HRC_SOURCE_SYSTEM_OWNER || {};
      values._sourceOwner = Boolean(owners.ok && owners.codes.indexOf('HDLAGENT') !== -1);
      $variables.lookupValues = values;
      const readable = Object.keys(values).filter((type) => values[type].ok).length;
      if (types.length) {
        $variables.summaryText = `${readable} referentiel${readable > 1 ? 's' : ''} `
          + `sur ${types.length} lu${readable > 1 ? 's' : ''} dans le tenant`;
      }
    }
  }

  return loadLookupsChain;
});
