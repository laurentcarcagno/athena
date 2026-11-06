import { assignee, chain, clauseTracker, description, emptyThresholds, parseNormative, select, statuses, text, title, tracker, type BuiltinNormative, type BuiltinVersion } from './common';

const CATEGORIES = ['A', 'B', 'C', 'D'];
const REVIEWS = ['srr', 'pdr', 'cdr', 'qr', 'ar'];
const METHODS = ['T', 'A', 'R', 'I']; // essai, analyse, revue de conception, inspection
const verifMethod = () => select('verification_method', 'Méthode de vérification', METHODS, { isContent: false });

/** Trackers du gabarit Spatial : ingénierie, vérification, écarts et revues (ECSS-E-ST-40C Rev.1, ECSS-Q-ST-80C Rev.2). */
function trackers(version: '1.0' | '1.1') {
  const srsFields = [title, description('Énoncé', 'statement'), select('category', 'Catégorie logicielle', CATEGORIES, { isContent: false }), verifMethod(),
    select('intro_review', 'Revue d’introduction', REVIEWS.map((r) => r.toUpperCase()), { isContent: false }),
    ...(version === '1.1' ? [select('safety_relevant', 'Pertinente pour la sécurité', ['oui', 'non'], { isContent: false })] : [])];
  const ncrSt = version === '1.1'
    ? statuses(['open', 'Ouverte', 'todo'], ['analysed', 'Analysée', 'in_progress'], ['deferred', 'Différée', 'in_progress'], ['closed', 'Close', 'done'])
    : statuses(['open', 'Ouverte', 'todo'], ['analysed', 'Analysée', 'in_progress'], ['closed', 'Close', 'done']);
  const ncrTransitions = version === '1.1'
    ? [{ name: 'Analyser', from: 'open', to: 'analysed' }, { name: 'Différer', from: 'analysed', to: 'deferred' }, { name: 'Clore', from: 'analysed', to: 'closed' }, { name: 'Clore (différée)', from: 'deferred', to: 'closed' }, { name: 'Rouvrir', from: null, to: 'open' }]
    : chain(['open', 'analysed', 'closed'], ['Analyser', 'Clore']);
  return [
    clauseTracker(),
    tracker('SYS', 'Exigences système (RB, IRD)', 'requirement', [title, description('Énoncé', 'statement'), verifMethod(), select('priority', 'Priorité', ['basse', 'moyenne', 'haute'], { isContent: false })],
      statuses(['draft', 'Brouillon', 'todo'], ['baselined', 'Dans la baseline', 'in_progress'], ['verified', 'Vérifiée', 'done']), chain(['draft', 'baselined', 'verified'], ['Baseliner', 'Vérifier'])),
    tracker('SRS', 'Exigences logicielles (TS)', 'requirement', srsFields,
      statuses(['draft', 'Brouillon', 'todo'], ['reviewed', 'Revue', 'in_progress'], ['baselined', 'Dans la baseline', 'in_progress'], ['verified', 'Vérifiée', 'done']), chain(['draft', 'reviewed', 'baselined', 'verified'], ['Soumettre à revue', 'Baseliner', 'Vérifier'])),
    tracker('ICD', 'Interfaces (ICD)', 'interface', [title, description('Description de l’interface', 'statement'), text('counterpart', 'Élément en regard', { isContent: false })],
      statuses(['draft', 'Brouillon', 'todo'], ['agreed', 'Convenue', 'done']), chain(['draft', 'agreed'], ['Convenir'])),
    tracker('SDD', 'Conception (DDF)', 'design', [title, description('Description de la conception', 'statement'), select('level', 'Niveau', ['architecture', 'détaillée'], { isContent: false })],
      statuses(['draft', 'Brouillon', 'todo'], ['reviewed', 'Revue', 'in_progress'], ['baselined', 'Dans la baseline', 'done']), chain(['draft', 'reviewed', 'baselined'], ['Soumettre à revue', 'Baseliner'])),
    tracker('VER', 'Vérification et validation (DJF)', 'test', [title, description('Procédure', 'procedure'), select('kind', 'Nature', ['spécification', 'procédure', 'rapport', 'campagne'], { isContent: false }), verifMethod()],
      statuses(['planned', 'Planifié', 'todo'], ['executed', 'Exécuté', 'in_progress'], ['passed', 'Conforme', 'done'], ['failed', 'Non conforme', 'done']),
      [{ name: 'Exécuter', from: 'planned', to: 'executed' }, { name: 'Déclarer conforme', from: 'executed', to: 'passed' }, { name: 'Déclarer non conforme', from: 'executed', to: 'failed' }, { name: 'Rouvrir', from: null, to: 'planned' }]),
    tracker('SPR', 'Anomalies logicielles (SPR)', 'bug', [title, description('Description', 'description'), select('severity', 'Sévérité', ['mineure', 'majeure', 'critique'], { required: true }), select('detected_in', 'Détectée à la revue', REVIEWS.map((r) => r.toUpperCase()), { isContent: false }), assignee],
      statuses(['open', 'Ouverte', 'todo'], ['analysed', 'Analysée', 'in_progress'], ['fixed', 'Corrigée', 'in_progress'], ['closed', 'Close', 'done']), chain(['open', 'analysed', 'fixed', 'closed'], ['Analyser', 'Corriger', 'Clore'])),
    tracker('NCR', 'Non-conformités (NCR)', 'nonconformity', [title, description('Description', 'description'), assignee], ncrSt, ncrTransitions),
    tracker('CR', 'Demandes de modification', 'change', [title, description('Justification', 'description'), select('impact', 'Impact', ['aucun', 'coût', 'planning', 'technique'], { isContent: false }), assignee],
      statuses(['submitted', 'Soumise', 'todo'], ['approved', 'Approuvée', 'in_progress'], ['implemented', 'Mise en œuvre', 'done'], ['rejected', 'Rejetée', 'done']),
      [{ name: 'Approuver', from: 'submitted', to: 'approved' }, { name: 'Rejeter', from: 'submitted', to: 'rejected' }, { name: 'Mettre en œuvre', from: 'approved', to: 'implemented' }, { name: 'Rouvrir', from: null, to: 'submitted' }]),
    tracker('RFD', 'Dérogations et renonciations (RFD/RFW)', 'decision', [title, description('Justification', 'description'), select('kind', 'Nature', ['RFD', 'RFW'], { required: true, isContent: false }), text('requirement', 'Exigence concernée', { isContent: false })],
      statuses(['submitted', 'Soumise', 'todo'], ['granted', 'Accordée', 'done'], ['refused', 'Refusée', 'done']),
      [{ name: 'Accorder', from: 'submitted', to: 'granted' }, { name: 'Refuser', from: 'submitted', to: 'refused' }, { name: 'Rouvrir', from: null, to: 'submitted' }]),
    // RID : ouvert → réponse → décision → action → clos
    tracker('RID', 'Review Item Discrepancies (RID)', 'action', [title, description('Remarque', 'description'), select('review', 'Revue', REVIEWS, { required: true, isContent: false }), text('originator', 'Émetteur', { isContent: false }),
        { key: 'response', label: 'Réponse', type: 'richtext' }, select('decision', 'Décision', ['acceptée', 'rejetée', 'partiellement acceptée'], { isContent: false }), assignee],
      statuses(['open', 'Ouvert', 'todo'], ['answered', 'Réponse', 'in_progress'], ['decided', 'Décision', 'in_progress'], ['action', 'Action', 'in_progress'], ['closed', 'Clos', 'done']),
      chain(['open', 'answered', 'decided', 'action', 'closed'], ['Répondre', 'Décider', 'Lancer l’action', 'Clore'])),
  ];
}

const exit = (review: string) => [
  { kind: 'tracker_status' as const, tracker: 'RID', statuses: ['closed'], where: { field: 'review', value: review }, label: `Tous les RID de la revue ${review.toUpperCase()} sont clos` },
];

function normative(version: '1.0' | '1.1') {
  return parseNormative({
    standards: [
      { key: 'ecss-e-st-40c', name: 'ECSS-E-ST-40C — Ingénierie logicielle', edition: 'Rev.1', date: '2025-04-30', url: 'https://ecss.nl/standard/ecss-e-st-40c-rev-1-software-30-april-2025' },
      { key: 'ecss-q-st-80c', name: 'ECSS-Q-ST-80C — Assurance produit logiciel', edition: 'Rev.2', date: '2025-04-30', url: 'https://ecss.nl/standard/ecss-q-st-80c-rev-2-software-product-assurance-30-april-2025' },
    ],
    criticality: { label: 'Catégorie logicielle (ECSS-Q-ST-80C)', categories: CATEGORIES.map((c) => ({ key: c, name: `Catégorie ${c}` })) },
    reviews: [
      { key: 'srr', name: 'SRR — Revue des exigences système' }, { key: 'pdr', name: 'PDR — Revue de conception préliminaire' }, { key: 'cdr', name: 'CDR — Revue de conception critique' },
      { key: 'qr', name: 'QR — Revue de qualification' }, { key: 'ar', name: 'AR — Revue de recette' },
      { key: 'trr', name: 'TRR — Revue de préparation des essais' }, { key: 'trb', name: 'TRB — Comité de revue des essais' },
    ],
    deliverables: [
      { key: 'rb', name: 'RB — Requirements Baseline' }, { key: 'ts', name: 'TS — Technical Specification' }, { key: 'ddf', name: 'DDF — Design Definition File' },
      { key: 'djf', name: 'DJF — Design Justification File' }, { key: 'mgt', name: 'MGT — Management File' }, { key: 'paf', name: 'PAF — Product Assurance File' },
      { key: 'mf', name: 'MF — Maintenance File' }, { key: 'op', name: 'OP — Operational File' }, { key: 'security', name: 'Dossier Sécurité' },
    ],
    phases: [
      { key: 'requirements', name: 'Exigences', review: 'srr', deliverables: ['rb', 'mgt', 'paf'], exitCriteria: exit('srr') },
      { key: 'preliminary-design', name: 'Conception préliminaire', review: 'pdr', deliverables: ['ts', 'ddf', 'djf', 'security'], entryCriteria: [{ kind: 'manual', label: 'Baseline RB approuvée à la SRR' }], exitCriteria: exit('pdr') },
      { key: 'detailed-design', name: 'Conception détaillée et réalisation', review: 'cdr', deliverables: ['ddf', 'djf'], exitCriteria: exit('cdr') },
      { key: 'qualification', name: 'Qualification', review: 'qr', deliverables: ['djf', 'op'], entryCriteria: [{ kind: 'manual', label: 'Revue de préparation des essais (TRR) tenue' }], exitCriteria: exit('qr') },
      { key: 'acceptance', name: 'Recette', review: 'ar', deliverables: ['mf', 'op'], exitCriteria: exit('ar') },
    ],
    rules: [
      { key: 'sw-req-traced', name: 'Exigences logicielles tracées vers la RB', fromTracker: 'SRS', linkType: 'refines', direction: 'out', minCount: 1, threshold: { target: 100 } },
      { key: 'sw-req-verified', name: 'Exigences logicielles vérifiées', fromTracker: 'SRS', linkType: 'verifies', direction: 'in', minCount: 1, threshold: { target: 100 } },
      ...(version === '1.1' ? [{ key: 'sw-req-designed', name: 'Exigences logicielles satisfaites par la conception', fromTracker: 'SRS', linkType: 'satisfies', direction: 'in', minCount: 1, threshold: { target: 100 } }] : []),
    ],
    parameters: [
      { key: 'code-coverage', label: 'Couverture de code — instructions', byCategory: emptyThresholds(CATEGORIES) },
      { key: 'branch-coverage', label: 'Couverture de code — branches', byCategory: emptyThresholds(CATEGORIES) },
    ],
    mandatory: [
      ...['SYS', 'SRS', 'ICD', 'SDD', 'VER', 'SPR', 'NCR', 'CR', 'RFD', 'RID'].map((k) => `tracker:${k}`), 'field:SRS.title', 'field:RID.review', 'status:RID.open', 'status:RID.closed', 'status:NCR.closed',
      ...CATEGORIES.map((c) => `category:${c}`), ...REVIEWS.map((r) => `review:${r}`), 'phase:requirements', 'phase:preliminary-design', 'phase:detailed-design', 'phase:qualification', 'phase:acceptance',
      'rule:sw-req-traced', 'rule:sw-req-verified', 'standard:ecss-e-st-40c', 'standard:ecss-q-st-80c',
    ],
  });
}

const version = (v: '1.0' | '1.1'): BuiltinVersion => ({ version: v, trackers: trackers(v), normative: normative(v) });

export const SPATIAL: BuiltinNormative = {
  key: 'spatial', name: 'Spatial (ECSS)',
  description: 'Logiciel spatial : ECSS-E-ST-40C Rev.1 et ECSS-Q-ST-80C Rev.2, catégories A à D, revues SRR, PDR, CDR, QR et AR, RID, SPR et NCR.',
  versions: [version('1.0'), version('1.1')],
};
