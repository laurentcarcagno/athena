import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Btn, Id, StatusPill, Table, Td, Th, type PillKind, type SortState } from '@athena/ui';
import type { SearchResult, TrackerDefinition } from '../api';
import { fr } from '../i18n';
import { fromHere } from '../lib/origin';
import { formatDateTime } from '../lib/dates';

/** Couleur de la pastille selon la catégorie du statut. */
export const pillKind = (category: string): PillKind => (category === 'done' ? 'success' : category === 'in_progress' ? 'warning' : 'info');

type Hit = SearchResult['hits'][number];
const titleOf = (hit: Hit) => String(hit.values['title'] ?? hit.values['name'] ?? '');
const asText = (value: unknown): string => (value === undefined || value === null ? '' : Array.isArray(value) ? value.join(', ') : String(value));

/** Colonne du tableau (la clé de l'item, toujours en tête, n'en fait pas partie). */
export interface TableColumn { id: string; label: string; sortField?: string; mono?: boolean; mute?: boolean; render: (hit: Hit) => ReactNode }

const STANDARD: Record<string, TableColumn> = {
  title: { id: 'title', label: '', render: (hit) => <span className="ath-clip" title={titleOf(hit)}>{titleOf(hit)}</span> },
  status: { id: 'status', label: '', sortField: 'status', render: (hit) => <StatusPill kind={pillKind(hit.category)}>{hit.statusName ?? hit.status}</StatusPill> },
  tracker: { id: 'tracker', label: '', sortField: 'tracker', mono: true, render: (hit) => hit.tracker },
  updated: { id: 'updated', label: '', sortField: 'updated', mono: true, mute: true, render: (hit) => formatDateTime(hit.updatedAt) },
};

/** Colonnes de la Recherche : titre, état, tracker, date. */
export const searchColumns = (): TableColumn[] => ['title', 'status', 'tracker', 'updated'].map((id) => columnFor(id, null)!);

/** Colonne désignée par un identifiant (`title`, `status`, `tracker`, `updated`, `f:<champ>`) ; `null` si inconnue. */
export function columnFor(id: string, def: TrackerDefinition | null): TableColumn | null {
  const labels: Record<string, string> = { title: fr.list.title, status: fr.list.status, tracker: fr.list.tracker, updated: fr.list.updated };
  const standard = STANDARD[id];
  if (standard) return { ...standard, label: labels[id]! };
  if (!id.startsWith('f:')) return null;
  const field = def?.fields.find((f) => f.key === id.slice(2));
  if (!field) return null;
  const mono = field.type === 'number' || field.type === 'date';
  return { id, label: field.label, sortField: field.key, mono, render: (hit) => <span className="ath-clip" title={asText(hit.values[field.key])}>{asText(hit.values[field.key])}</span> };
}

/** Tableau d'artefacts triable avec pagination : partagé par la Recherche et l'écran Tracker. */
export function ArtifactTable({ project, result, offset, pageSize, sortOf, sortBy, onPage, linkFor, selected, columns, groupByTracker = false, origin }: {
  project: string; selected?: string | null; columns?: TableColumn[];
  /** Libellé de la liste : la fiche ouverte depuis le tableau propose « Retour », précédent et suivant (T-0113). */
  origin?: string;
  result: SearchResult; offset: number; pageSize: number;
  sortOf: (field: string) => SortState; sortBy: (field: string) => (next: SortState) => void; onPage: (offset: number) => void;
  /** Adresse d'un item (par défaut la fiche complète) ; l'écran Tracker ouvre le panneau de détail. */
  linkFor?: (key: string) => string;
  /** Regroupe les résultats par tracker (un tableau par tracker, sous son titre) quand la page en mélange plusieurs. */
  groupByTracker?: boolean;
}) {
  const href = linkFor ?? ((key: string) => `/p/${project}/a/${key}`);
  const cols = columns ?? searchColumns();
  const location = useLocation();
  const state = origin ? fromHere(location, origin, result.hits.map((h) => h.key)) : undefined;
  const renderTable = (hits: SearchResult['hits']) => (
    <Table>
      <thead>
        <tr>
          <Th sort={sortOf('key')} onSort={sortBy('key')}>{fr.list.key}</Th>
          {cols.map((c) => (c.sortField ? <Th key={c.id} sort={sortOf(c.sortField)} onSort={sortBy(c.sortField)}>{c.label}</Th> : <Th key={c.id}>{c.label}</Th>))}
        </tr>
      </thead>
      <tbody>
        {hits.map((hit) => (
          <tr key={hit.key} className={selected === hit.key ? 'ath-row--selected' : undefined}>
            <Td><Link id={`row-${hit.key}`} className="ath-link ath-mono" to={href(hit.key)} state={state} aria-current={selected === hit.key ? 'true' : undefined}>{hit.key}</Link></Td>
            {cols.map((c) => <Td key={c.id} mono={c.mono} mute={c.mute}>{c.render(hit)}</Td>)}
          </tr>
        ))}
      </tbody>
    </Table>
  );
  const trackers = [...new Set(result.hits.map((h) => h.tracker))];
  return (
    <>
      {groupByTracker && trackers.length > 1
        ? trackers.map((t) => {
          const hits = result.hits.filter((h) => h.tracker === t);
          return <section key={t} aria-label={t}><h2 className="ath-section-title">{t} <Id>{hits.length}</Id></h2>{renderTable(hits)}</section>;
        })
        : renderTable(result.hits)}
      <div className="ath-toolbar">
        <Btn variant="ghost" size="sm" disabled={offset === 0} icon="previous" onClick={() => onPage(Math.max(0, offset - pageSize))}>{fr.list.previous}</Btn>
        <Id>{offset + 1}–{Math.min(offset + pageSize, result.total)} / {result.total}{result.totalCapped ? '+' : ''}</Id>
        <Btn variant="ghost" size="sm" disabled={offset + pageSize >= result.total && !result.totalCapped} icon="next" onClick={() => onPage(offset + pageSize)}>{fr.list.next}</Btn>
      </div>
    </>
  );
}
