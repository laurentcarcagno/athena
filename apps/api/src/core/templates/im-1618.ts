import { parseNormative, type BuiltinNormative } from './common';
import { DEFENSE } from './defense';

/**
 * Gabarit « Opération d'armement (IM 1618), vue industrielle » (lot 19, B31) : quatre phases et neuf revues typées, bâti sur le gabarit Défense
 * (trackers, règles, marquage, catégories). Les revues contractuelles du fournisseur s'ajoutent par un gabarit dérivé par marché (héritage).
 * Hypothèse (annexe § 2.2) : le rattachement des revues aux phases est déduit de l'ordre des planches du support.
 */
const base = DEFENSE.versions[0]!;

/** Revue, nature (étatique majeure, programme ou équipe) : seules les deux premières sont des jalons de décision. */
const REVIEWS: Array<[string, string, 'etatique' | 'programme' | 'equipe']> = [
  ['rev-cadrage', 'Revue d’ingénierie de cadrage (équipe)', 'equipe'],
  ['rev-dimensionnement', 'Revue de dimensionnement technique (équipe)', 'equipe'],
  ['comite-devis', 'Comité des devis (programme)', 'programme'],
  ['rev-hierarchisation', 'Revue de hiérarchisation des solutions (programme)', 'programme'],
  ['consultation', 'Consultation des industriels (programme)', 'programme'],
  ['rev-synchro', 'Revue de synchronisation et de lancement (équipe)', 'equipe'],
  ['rev-aptitude-essais', 'Revue d’aptitude aux essais (équipe)', 'equipe'],
  ['rev-qualification', 'Revue de qualification, prononcé de qualification (étatique majeure)', 'etatique'],
  ['rev-mso', 'Revue de mise en service opérationnelle, prononcé de MSO (étatique majeure)', 'etatique'],
];

/** Les trackers sont ceux du gabarit Défense, dont RRV (champ `review`, texte libre : la clé de la revue). */
const trackers = () => [...base.trackers];

const closed = (tracker_: string, label: string, where?: { field: string; value: string }) =>
  ({ kind: 'tracker_status' as const, tracker: tracker_, statuses: ['closed'], label, ...(where ? { where } : {}) });

const normative = () => parseNormative({
  ...base.normative,
  reviews: REVIEWS.map(([key, name]) => ({ key, name })),
  phases: [
    { key: 'preparation', name: 'Préparation (orientation comprise)', review: 'consultation', deliverables: [],
      exitCriteria: [{ kind: 'manual', label: 'Devis validé au comité des devis' }, closed('RRV', 'Remarques de la revue de hiérarchisation closes', { field: 'review', value: 'rev-hierarchisation' })] },
    { key: 'realisation', name: 'Réalisation', review: 'rev-qualification', deliverables: ['design-file', 'test-file'],
      entryCriteria: [{ kind: 'manual', label: 'Revue de synchronisation et de lancement tenue' }],
      exitCriteria: [{ kind: 'manual', label: 'Prononcé de qualification obtenu' }, { ...closed('TF', 'Faits techniques majeurs clos', { field: 'severity', value: 'majeure' }) }, closed('RRV', 'Remarques de la revue de qualification closes', { field: 'review', value: 'rev-qualification' })] },
    { key: 'utilisation', name: 'Utilisation', review: 'rev-mso', deliverables: [],
      entryCriteria: [{ kind: 'manual', label: 'Prononcé de MSO' }], exitCriteria: [{ kind: 'manual', label: 'Condition de retrait du service constatée' }] },
    { key: 'retrait', name: 'Retrait', review: 'rev-mso', deliverables: [], entryCriteria: [{ kind: 'manual', label: 'Décision de retrait du service' }], exitCriteria: [] },
  ],
  mandatory: [...base.normative.mandatory, ...REVIEWS.map(([k]) => `review:${k}`), 'phase:preparation', 'phase:realisation', 'phase:utilisation', 'phase:retrait'],
});

export const IM_1618: BuiltinNormative = {
  key: 'armement-1618', name: 'Opération d’armement (IM 1618)',
  description: 'Vue industrielle d’une opération d’armement : préparation, réalisation, utilisation, retrait ; neuf revues typées (étatique, programme, équipe). Bâti sur le gabarit Défense.',
  versions: [{ version: '1.0', trackers: trackers(), normative: normative() }],
};
