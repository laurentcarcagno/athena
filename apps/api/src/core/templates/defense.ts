import { assignee, chain, clauseTracker, description, emptyThresholds, parseNormative, select, statuses, text, title, tracker, type BuiltinNormative } from './common';

const LEVELS = ['A', 'B', 'C', 'D', 'E']; // niveaux de criticité par défaut (ex. DAL de la DO-178C) : à adapter au programme
const MENTIONS = ['non protégé', 'diffusion restreinte'];
const EXPORT = ['aucun', 'ITAR', 'EAR', 'double usage'];
/** Champs de marquage : présents sur chaque tracker, sans effet avant l'instance Défense (Lot 4). */
const marking = () => [select('mention', 'Mention de protection', MENTIONS, { isContent: false }), select('export_control', 'Contrôle export', EXPORT, { isContent: false })];
const reqFields = () => [title, description('Énoncé', 'statement'), select('criticality', 'Niveau de criticité', LEVELS, { isContent: false }), select('verification_method', 'Méthode de vérification', ['essai', 'analyse', 'revue', 'inspection'], { isContent: false }), ...marking()];

/** Gabarit Défense : AQAP-2110 complétée par AQAP-2210 éd. B (supplément logiciel orienté projet). */
function trackers() {
  return [
    clauseTracker(),
    tracker('STB', 'Exigences client (STB)', 'requirement', reqFields(), statuses(['draft', 'Brouillon', 'todo'], ['accepted', 'Acceptée', 'in_progress'], ['verified', 'Vérifiée', 'done']), chain(['draft', 'accepted', 'verified'], ['Accepter', 'Vérifier'])),
    tracker('SWR', 'Exigences logicielles', 'requirement', reqFields(), statuses(['draft', 'Brouillon', 'todo'], ['reviewed', 'Revue', 'in_progress'], ['verified', 'Vérifiée', 'done']), chain(['draft', 'reviewed', 'verified'], ['Soumettre à revue', 'Vérifier'])),
    tracker('ICD', 'Interfaces', 'interface', [title, description('Description', 'statement'), text('counterpart', 'Élément en regard', { isContent: false }), ...marking()], statuses(['draft', 'Brouillon', 'todo'], ['agreed', 'Convenue', 'done']), chain(['draft', 'agreed'], ['Convenir'])),
    tracker('SDD', 'Conception', 'design', [title, description('Description', 'statement'), ...marking()], statuses(['draft', 'Brouillon', 'todo'], ['reviewed', 'Revue', 'done']), chain(['draft', 'reviewed'], ['Soumettre à revue'])),
    tracker('TC', 'Cas de test et procédures', 'test', [title, description('Procédure', 'procedure'), ...marking()], statuses(['draft', 'Brouillon', 'todo'], ['ready', 'Prêt', 'in_progress'], ['executed', 'Exécuté', 'done']), chain(['draft', 'ready', 'executed'], ['Valider', 'Exécuter'])),
    tracker('PV', 'PV de recette', 'campaign', [title, description('Résultats', 'description'), select('outcome', 'Résultat', ['conforme', 'non conforme', 'réserves'], { isContent: false }), ...marking()], statuses(['draft', 'Brouillon', 'todo'], ['signed', 'Signé', 'done']), chain(['draft', 'signed'], ['Signer'])),
    tracker('ACI', 'Articles de configuration', 'design', [title, description('Description', 'description'), text('baseline', 'Référence de configuration', { isContent: false }), ...marking()], statuses(['active', 'Actif', 'todo'], ['retired', 'Retiré', 'done']), chain(['active', 'retired'], ['Retirer'])),
    tracker('TF', 'Faits techniques', 'nonconformity', [title, description('Description du fait', 'description'), select('severity', 'Gravité', ['mineure', 'majeure', 'critique'], { required: true }), assignee, ...marking()],
      statuses(['open', 'Ouvert', 'todo'], ['analysed', 'Analysé', 'in_progress'], ['corrected', 'Corrigé', 'in_progress'], ['closed', 'Clos', 'done']), chain(['open', 'analysed', 'corrected', 'closed'], ['Analyser', 'Corriger', 'Clore'])),
    tracker('CR', 'Demandes de modification', 'change', [title, description('Justification', 'description'), assignee, ...marking()],
      statuses(['submitted', 'Soumise', 'todo'], ['approved', 'Approuvée', 'in_progress'], ['implemented', 'Mise en œuvre', 'done'], ['rejected', 'Rejetée', 'done']),
      [{ name: 'Approuver', from: 'submitted', to: 'approved' }, { name: 'Rejeter', from: 'submitted', to: 'rejected' }, { name: 'Mettre en œuvre', from: 'approved', to: 'implemented' }, { name: 'Rouvrir', from: null, to: 'submitted' }]),
    tracker('DRC', 'Dérogations et concessions', 'decision', [title, description('Justification', 'description'), select('kind', 'Nature', ['dérogation', 'concession'], { required: true, isContent: false }), text('requirement', 'Exigence concernée', { isContent: false }), ...marking()],
      statuses(['submitted', 'Soumise', 'todo'], ['granted', 'Accordée', 'done'], ['refused', 'Refusée', 'done']),
      [{ name: 'Accorder', from: 'submitted', to: 'granted' }, { name: 'Refuser', from: 'submitted', to: 'refused' }, { name: 'Rouvrir', from: null, to: 'submitted' }]),
    tracker('RRV', 'Remarques de revue et actions', 'action', [title, description('Remarque', 'description'), text('review', 'Revue', { isContent: false }), assignee, ...marking()],
      statuses(['open', 'Ouverte', 'todo'], ['answered', 'Réponse', 'in_progress'], ['closed', 'Close', 'done']), chain(['open', 'answered', 'closed'], ['Répondre', 'Clore'])),
  ];
}

const normative = () => parseNormative({
  standards: [
    { key: 'aqap-2110', name: 'AQAP-2110 — Exigences OTAN d’assurance de la qualité pour la conception, le développement et la production', edition: 'Éd. D', url: 'https://www.bundeswehr.de/en/organization/equipment/contract-award/quality-management/aqap-quality-assurance-requirements-nato' },
    { key: 'aqap-2210', name: 'AQAP-2210 — Supplément logiciel orienté projet', edition: 'Éd. B, v1', date: '2022-08', url: 'https://www.bundeswehr.de/resource/blob/133168/6302e491fe817463fda210d35dba5570/aqap-2210-2022-eng-data.pdf' },
  ],
  criticality: { label: 'Niveau de criticité (paramétrable par programme)', categories: LEVELS.map((c) => ({ key: c, name: `Niveau ${c}` })) },
  // Revues contractuelles : paramétrables par le programme (non obligatoires).
  reviews: [{ key: 'srr', name: 'SRR — Revue des exigences' }, { key: 'pdr', name: 'PDR — Revue de conception préliminaire' }, { key: 'cdr', name: 'CDR — Revue de conception critique' }, { key: 'qualification', name: 'Revue de qualification' }, { key: 'recette', name: 'Revue de recette' }],
  deliverables: [
    { key: 'quality-plan', name: 'Plan qualité (AQAP-2105)' }, { key: 'software-dev-plan', name: 'Plan de développement logiciel' }, { key: 'config-plan', name: 'Plan de gestion de configuration' },
    { key: 'design-file', name: 'Dossier de conception' }, { key: 'test-file', name: 'Dossier de test' },
  ],
  phases: [
    { key: 'requirements', name: 'Exigences', review: 'srr', deliverables: ['quality-plan', 'software-dev-plan', 'config-plan'] },
    { key: 'design', name: 'Conception', review: 'pdr', deliverables: ['design-file'] },
    { key: 'build', name: 'Réalisation', review: 'cdr', deliverables: ['design-file', 'test-file'] },
    { key: 'qualification', name: 'Qualification', review: 'qualification', deliverables: ['test-file'] },
    { key: 'acceptance', name: 'Recette', review: 'recette', deliverables: ['test-file'] },
  ],
  rules: [
    { key: 'customer-req-traced', name: 'Exigences client tracées vers le logiciel', fromTracker: 'STB', linkType: 'refines', direction: 'in', minCount: 1, threshold: { target: 100 } },
    { key: 'customer-req-verified', name: 'Exigences client vérifiées', fromTracker: 'STB', linkType: 'verifies', direction: 'in', minCount: 1, threshold: { target: 100 } },
    { key: 'fact-has-ci', name: 'Faits techniques rattachés à un article de configuration', fromTracker: 'TF', linkType: 'concerns', direction: 'out', minCount: 1, threshold: { target: 100 } },
  ],
  parameters: [{ key: 'code-coverage', label: 'Couverture de code — instructions', byCategory: emptyThresholds(LEVELS) }, { key: 'branch-coverage', label: 'Couverture de code — branches', byCategory: emptyThresholds(LEVELS) }],
  marking: { fields: ['mention', 'export_control'] },
  mandatory: [...['STB', 'SWR', 'TF', 'DRC', 'ACI', 'CR'].map((k) => `tracker:${k}`), 'field:STB.mention', 'field:STB.export_control', 'field:TF.mention', 'field:TF.export_control', 'status:TF.closed',
    'rule:customer-req-traced', 'rule:customer-req-verified', 'rule:fact-has-ci', 'standard:aqap-2110', 'standard:aqap-2210'],
});

export const DEFENSE: BuiltinNormative = {
  key: 'defense', name: 'Défense (AQAP)',
  description: 'Logiciel de défense : AQAP-2110 et AQAP-2210 éd. B, criticité et revues paramétrables par programme, faits techniques, dérogations et concessions, champs de marquage.',
  versions: [{ version: '1.0', trackers: trackers(), normative: normative() }],
};
