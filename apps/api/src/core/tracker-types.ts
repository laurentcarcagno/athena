import type { PoolClient } from 'pg';

export const CATEGORIES = ['engineering', 'development', 'verification', 'management'] as const;
export type TrackerCategory = (typeof CATEGORIES)[number];
export const VIEWS = ['tableau', 'board', 'arbre', 'matrice', 'document', 'timeline', 'calendrier'] as const;
export type TrackerViewKind = (typeof VIEWS)[number];

export interface BaseField { key: string; label: string; type: string; required?: boolean; config?: Record<string, unknown>; semanticRole?: string }
export interface TrackerTypeView {
  key: string; name: string; description: string; category: TrackerCategory;
  defaultViews: TrackerViewKind[]; baseFields: BaseField[]; builtin: boolean; modified: boolean;
}

const title: BaseField = { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' };
const description: BaseField = { key: 'description', label: 'Description', type: 'richtext', semanticRole: 'description' };
const assignee: BaseField = { key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee' };
const probability: BaseField = { key: 'probability', label: 'Probabilité (1 à 5)', type: 'number', config: { min: 1, max: 5 }, semanticRole: 'probability' };
const impact: BaseField = { key: 'impact', label: 'Impact (1 à 5)', type: 'number', config: { min: 1, max: 5 }, semanticRole: 'impact' };
const due: BaseField = { key: 'due', label: 'Échéance', type: 'date', semanticRole: 'due_date' };

const t = (key: string, name: string, desc: string, category: TrackerCategory, defaultViews: TrackerViewKind[], baseFields: BaseField[]): TrackerTypeView =>
  ({ key, name, description: desc, category, defaultViews, baseFields, builtin: true, modified: false });

/** Types livrés avec Athena (spécification : Exigence, Anomalie, Tâche, Test, Risque, Interface…). Ce ne sont que des données. */
export function builtinTrackerTypes(): TrackerTypeView[] {
  return [
    t('requirement', 'Exigence', 'Exigence système ou logicielle, avec niveau et méthode de vérification.', 'engineering', ['tableau', 'arbre', 'matrice', 'document'], [title, description]),
    t('interface', 'Interface', 'Interface entre éléments ou avec l’extérieur.', 'engineering', ['tableau', 'arbre', 'matrice', 'document'], [title, description]),
    t('design', 'Conception', 'Élément de conception (composant, module, décision de conception).', 'engineering', ['tableau', 'arbre', 'matrice'], [title, description]),
    t('task', 'Tâche', 'Travail planifié, estimé et assigné.', 'development', ['tableau', 'board', 'timeline'], [title, description, assignee, due]),
    t('bug', 'Anomalie', 'Défaut constaté, avec sévérité et cause.', 'development', ['tableau', 'board'], [title, description, assignee]),
    t('change', 'Évolution', 'Demande de modification ou d’évolution.', 'development', ['tableau', 'board'], [title, description, assignee]),
    t('test', 'Cas de test', 'Cas de test lié aux exigences vérifiées.', 'verification', ['tableau', 'matrice', 'document'], [title, description]),
    t('campaign', 'Campagne', 'Campagne de vérification ou de validation.', 'verification', ['tableau'], [title, description, assignee]),
    t('nonconformity', 'Non-conformité', 'Écart constaté, à traiter jusqu’à clôture.', 'verification', ['tableau', 'board'], [title, description, assignee]),
    t('risk', 'Risque', 'Risque projet, probabilité et criticité.', 'management', ['tableau', 'matrice'], [title, description, assignee, probability, impact]),
    t('request', 'Demande', 'Demande de projet ou d’évolution à instruire, scorer, puis convertir en projet ou refuser.', 'management', ['tableau', 'board'], [title, description, assignee]),
    t('action', 'Action', 'Action décidée en réunion ou en revue.', 'management', ['tableau', 'board', 'calendrier'], [title, description, assignee, due]),
    t('decision', 'Décision', 'Décision tracée avec son contexte.', 'management', ['tableau'], [title, description]),
    t('review', 'Revue', 'Revue de jalon ou revue technique.', 'management', ['tableau', 'calendrier'], [title, description, due]),
  ];
}

export const TYPE_KEY = /^[a-z][a-z0-9-]{1,39}$/;

/** Vrai si le type existe : livré ou défini par l'organisation (la RLS limite la lecture à l'organisation courante). */
export async function typeExists(c: PoolClient, key: string): Promise<boolean> {
  if (builtinTrackerTypes().some((x) => x.key === key)) return true;
  return ((await c.query('select 1 from tracker_type where key = $1', [key])).rowCount ?? 0) > 0;
}
