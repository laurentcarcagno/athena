import { Link } from 'react-router-dom';
import { Btn, Id, StatusPill, Table, Td, Th, type PillKind, type SortState } from '@athena/ui';
import type { SearchResult } from '../api';
import { fr } from '../i18n';

/** Couleur de la pastille selon la catégorie du statut. */
export const pillKind = (category: string): PillKind => (category === 'done' ? 'success' : category === 'in_progress' ? 'warning' : 'info');

const titleOf = (hit: SearchResult['hits'][number]) => String(hit.values['title'] ?? hit.values['name'] ?? '');

/** Tableau d'artefacts triable avec pagination : partagé par la Recherche et l'écran Tracker. */
export function ArtifactTable({ project, result, offset, pageSize, sortOf, sortBy, onPage, linkFor, selected }: {
  project: string; selected?: string | null; result: SearchResult; offset: number; pageSize: number;
  sortOf: (field: string) => SortState; sortBy: (field: string) => (next: SortState) => void; onPage: (offset: number) => void;
  /** Adresse d'un item (par défaut la fiche complète) ; l'écran Tracker ouvre le panneau de détail. */
  linkFor?: (key: string) => string;
}) {
  const href = linkFor ?? ((key: string) => `/p/${project}/a/${key}`);
  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th sort={sortOf('key')} onSort={sortBy('key')}>{fr.list.key}</Th>
            <Th>{fr.list.title}</Th>
            <Th sort={sortOf('status')} onSort={sortBy('status')}>{fr.list.status}</Th>
            <Th sort={sortOf('tracker')} onSort={sortBy('tracker')}>{fr.list.tracker}</Th>
            <Th sort={sortOf('updated')} onSort={sortBy('updated')}>{fr.list.updated}</Th>
          </tr>
        </thead>
        <tbody>
          {result.hits.map((hit) => (
            <tr key={hit.key} className={selected === hit.key ? 'ath-row--selected' : undefined}>
              <Td><Link id={`row-${hit.key}`} className="ath-link ath-mono" to={href(hit.key)} aria-current={selected === hit.key ? 'true' : undefined}>{hit.key}</Link></Td>
              <Td><span className="ath-clip" title={titleOf(hit)}>{titleOf(hit)}</span></Td>
              <Td><StatusPill kind={pillKind(hit.category)}>{hit.statusName ?? hit.status}</StatusPill></Td>
              <Td mono>{hit.tracker}</Td>
              <Td mono mute>{hit.updatedAt.slice(0, 16).replace('T', ' ')}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="ath-toolbar">
        <Btn variant="ghost" size="sm" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - pageSize))}>{fr.list.previous}</Btn>
        <Id>{offset + 1}–{Math.min(offset + pageSize, result.total)} / {result.total}{result.totalCapped ? '+' : ''}</Id>
        <Btn variant="ghost" size="sm" disabled={offset + pageSize >= result.total && !result.totalCapped} onClick={() => onPage(offset + pageSize)}>{fr.list.next}</Btn>
      </div>
    </>
  );
}
