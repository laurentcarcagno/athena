import { assignee, chain, clauseTracker, description, parseNormative, planningFields, select, statuses, text, title, tracker, taskTracker, type BuiltinNormative, type BuiltinVersion } from './common';

/** Gabarit « Projet spatial (ECSS-M-ST-10) » (lot 19, B30) : le cycle de vie du projet système, phases 0 à F et leurs 13 revues (annexe `docs/ppm/annexe-cycles-de-vie.md` § 1). */
const REVIEWS: Array<[string, string]> = [
  ['mdr', 'MDR — Mission Definition Review'], ['prr', 'PRR — Preliminary Requirements Review'], ['srr', 'SRR — System Requirements Review'],
  ['pdr', 'PDR — Preliminary Design Review'], ['cdr', 'CDR — Critical Design Review'], ['qr', 'QR — Qualification Review'], ['ar', 'AR — Acceptance Review'],
  ['orr', 'ORR — Operational Readiness Review'], ['frr', 'FRR — Flight Readiness Review'], ['lrr', 'LRR — Launch Readiness Review'],
  ['crr', 'CRR — Commissioning Result Review'], ['elr', 'ELR — End-of-Life Review'], ['mcr', 'MCR — Mission Close-out Review'],
];
const REVIEW_KEYS = REVIEWS.map(([k]) => k);
/** Phase, nom, revue de fin (les revues SRR, QR, ORR, FRR, LRR et CRR sont des jalons datés de leur phase, pas des fins de phase). */
const PHASES: Array<[string, string, string]> = [
  ['phase-0', 'Phase 0 — Analyse de mission', 'mdr'], ['phase-a', 'Phase A — Faisabilité', 'prr'], ['phase-b', 'Phase B — Définition préliminaire', 'pdr'],
  ['phase-c', 'Phase C — Définition détaillée', 'cdr'], ['phase-d', 'Phase D — Qualification et production', 'ar'], ['phase-e', 'Phase E — Utilisation', 'elr'], ['phase-f', 'Phase F — Retrait', 'mcr'],
];

function trackers() {
  return [
    clauseTracker(),
    // RID : une classe « majeur » (touche un objectif de la revue) ou « mineur » (ECSS-M-ST-10-01C § 5.6) ; seuls les majeurs bloquent la fin de phase.
    tracker('RID', 'Review Item Discrepancies (RID)', 'action', [title, description('Remarque', 'description'), select('review', 'Revue', REVIEW_KEYS, { required: true, isContent: false }),
        select('class', 'Classe', ['majeur', 'mineur'], { required: true, isContent: false }), text('originator', 'Émetteur', { isContent: false }),
        { key: 'response', label: 'Réponse', type: 'richtext' }, select('decision', 'Décision', ['acceptée', 'rejetée', 'partiellement acceptée'], { isContent: false }), assignee],
      statuses(['open', 'Ouvert', 'todo'], ['answered', 'Réponse', 'in_progress'], ['decided', 'Décision', 'in_progress'], ['action', 'Action', 'in_progress'], ['closed', 'Clos', 'done']),
      chain(['open', 'answered', 'decided', 'action', 'closed'], ['Répondre', 'Décider', 'Lancer l’action', 'Clore'])),
    tracker('NCR', 'Non-conformités (NCR)', 'nonconformity', [title, description('Description', 'description'), assignee],
      statuses(['open', 'Ouverte', 'todo'], ['analysed', 'Analysée', 'in_progress'], ['closed', 'Close', 'done']), chain(['open', 'analysed', 'closed'], ['Analyser', 'Clore'])),
    tracker('CR', 'Demandes de modification', 'change', [title, description('Justification', 'description'), select('impact', 'Impact', ['aucun', 'coût', 'planning', 'technique'], { isContent: false }), assignee],
      statuses(['submitted', 'Soumise', 'todo'], ['approved', 'Approuvée', 'in_progress'], ['implemented', 'Mise en œuvre', 'done'], ['rejected', 'Rejetée', 'done']),
      [{ name: 'Approuver', from: 'submitted', to: 'approved' }, { name: 'Rejeter', from: 'submitted', to: 'rejected' }, { name: 'Mettre en œuvre', from: 'approved', to: 'implemented' }, { name: 'Rouvrir', from: null, to: 'submitted' }]),
    tracker('RFD', 'Dérogations et renonciations (RFD/RFW)', 'decision', [title, description('Justification', 'description'), select('kind', 'Nature', ['RFD', 'RFW'], { required: true, isContent: false })],
      statuses(['submitted', 'Soumise', 'todo'], ['granted', 'Accordée', 'done'], ['refused', 'Refusée', 'done']),
      [{ name: 'Accorder', from: 'submitted', to: 'granted' }, { name: 'Refuser', from: 'submitted', to: 'refused' }, { name: 'Rouvrir', from: null, to: 'submitted' }]),
    tracker('RSK', 'Risques', 'risk', [title, description('Description', 'description'), select('category', 'Catégorie', ['technique', 'programmatique', 'lancement', 'exploitation'], { isContent: false }),
        { key: 'probability', label: 'Probabilité (1 à 5)', type: 'number', config: { min: 1, max: 5 }, semanticRole: 'probability', isContent: false },
        { key: 'impact', label: 'Impact (1 à 5)', type: 'number', config: { min: 1, max: 5 }, semanticRole: 'impact', isContent: false }, assignee],
      statuses(['identified', 'Identifié', 'todo'], ['mitigating', 'Mitigation en cours', 'in_progress'], ['closed', 'Clos', 'done']), chain(['identified', 'mitigating', 'closed'], ['Traiter', 'Clore'])),
    tracker('ACT', 'Actions', 'action', [title, description('Description', 'description'), ...planningFields().filter((f) => f.key === 'due'), assignee],
      statuses(['open', 'Ouverte', 'todo'], ['done', 'Faite', 'done']), chain(['open', 'done'], ['Terminer'])),
    taskTracker(),
  ];
}

const exit = (review: string) => {
  const R = review.toUpperCase();
  return [
    { kind: 'manual' as const, label: `Prérequis de la revue ${R} confirmés par le client` },
    { kind: 'manual' as const, label: `Dossier de revue ${R} complet et diffusé` },
    { kind: 'tracker_status' as const, tracker: 'RID', statuses: ['closed'], where: { field: 'review', value: review }, and: { field: 'class', value: 'majeur' }, label: `Tous les RID majeurs de la revue ${R} sont clos` },
    { kind: 'manual' as const, label: `Rapport de l’autorité de revue ${R} émis : objectifs atteints` },
  ];
};

function normative() {
  return parseNormative({
    standards: [
      { key: 'ecss-m-st-10c', name: 'ECSS-M-ST-10C — Gestion de projet', edition: 'Rev.1', date: '2009-03-06' },
      { key: 'ecss-m-st-10-01c', name: 'ECSS-M-ST-10-01C — Organisation et conduite des revues', edition: 'C', date: '2008-11-15' },
    ],
    reviews: REVIEWS.map(([key, name]) => ({ key, name })),
    deliverables: [
      { key: 'wbs', name: 'WBS et arbre produit' }, { key: 'schedule', name: 'Calendrier directeur' }, { key: 'cm-plan', name: 'Plan de gestion de configuration' },
      { key: 'risk-plan', name: 'Plan de gestion des risques' }, { key: 'review-data', name: 'Dossier de revue (data package)' },
    ],
    phases: PHASES.map(([key, name, review], i) => ({
      key, name, review, deliverables: i === 0 ? ['wbs'] : ['wbs', 'schedule', 'review-data'],
      entryCriteria: i === 0 ? [] : [{ kind: 'manual', label: `Baseline de configuration établie à la revue ${PHASES[i - 1]![2].toUpperCase()}` }],
      exitCriteria: exit(review),
    })),
    rules: [],
    mandatory: [...['RID', 'NCR', 'CR', 'RFD', 'RSK', 'ACT'].map((k) => `tracker:${k}`), 'field:RID.review', 'field:RID.class', ...REVIEW_KEYS.map((r) => `review:${r}`), ...PHASES.map(([k]) => `phase:${k}`),
      'status:RID.open', 'status:RID.closed', 'standard:ecss-m-st-10c', 'standard:ecss-m-st-10-01c'],
  });
}

const version = (v: '1.0'): BuiltinVersion => ({ version: v, trackers: trackers(), normative: normative() });

export const ECSS_M_ST_10: BuiltinNormative = {
  key: 'spatial-project', name: 'Projet spatial (ECSS-M-ST-10)',
  description: 'Cycle de vie d’un projet spatial : phases 0 à F, 13 revues de MDR à MCR, RID majeurs et mineurs, risques et actions (ECSS-M-ST-10C Rev.1 et ECSS-M-ST-10-01C).',
  versions: [version('1.0')],
};
