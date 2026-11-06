import type { TrackerDefinition } from '../api';
import { fr } from '../i18n';

export interface ColumnOption { id: string; label: string }

/** Colonnes affichées par défaut dans le tableau d'un tracker. */
export const DEFAULT_COLUMNS = ['title', 'status', 'updated'];

/** Colonnes proposées : celles du tableau puis un champ du tracker chacun (`f:<clé>`), hors le champ de titre déjà couvert. */
export function columnOptions(def: TrackerDefinition | null): ColumnOption[] {
  return [
    { id: 'title', label: fr.list.title }, { id: 'status', label: fr.list.status }, { id: 'tracker', label: fr.list.tracker }, { id: 'updated', label: fr.list.updated },
    ...(def?.fields ?? []).filter((f) => f.semanticRole !== 'title').map((f) => ({ id: `f:${f.key}`, label: f.label })),
  ];
}

/** Colonnes demandées par l'adresse (`cols=title,status,f:severity`) : les identifiants inconnus sont ignorés, l'ordre est celui des options. */
export function selectedColumns(raw: string | null, def: TrackerDefinition | null): string[] {
  const options = columnOptions(def).map((o) => o.id);
  if (raw === null) return DEFAULT_COLUMNS.filter((id) => options.includes(id));
  const wanted = new Set(raw.split(',').filter(Boolean));
  return options.filter((id) => wanted.has(id));
}

/** Valeur d'adresse pour des colonnes choisies ; `null` quand c'est le choix par défaut (adresse plus courte). */
export function columnsParam(ids: string[], def: TrackerDefinition | null): string | null {
  const standard = selectedColumns(null, def);
  return ids.length === standard.length && ids.every((id, i) => id === standard[i]) ? null : ids.join(',');
}
