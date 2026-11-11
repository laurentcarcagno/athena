import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { StatusPill } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { pillKind } from './ArtifactTable';
import { statusPill } from '../lib/status';

export interface TreeNodeData { key: string; title: string; status: string; statusName: string; statusColor?: string | null; category: string; childCount: number; suspect: boolean }
interface Row { id: string; node: TreeNodeData; chapter: string; level: number; parentId: string | null; posinset: number; setsize: number }

/**
 * Arbre hiérarchique d'un tracker : numérotation de chapitres (1, 1.1, 1.2…), un niveau chargé au dépliage, clavier complet
 * (flèches, Début/Fin, Entrée). Un item à plusieurs parents apparaît sous chacun, avec un numéro propre à chaque place.
 */
export function TreeView({ project, tracker, selected, onOpen }: { project: string; tracker: string; selected: string | null; onOpen: (key: string) => void }) {
  const fail = useFailure();
  const [roots, setRoots] = useState<TreeNodeData[] | null>(null);
  const [children, setChildren] = useState<Record<string, TreeNodeData[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const pending = useRef<string | null>(null);
  const base = `/v1/projects/${project}/trackers/${tracker}/tree`;

  useEffect(() => {
    setRoots(null); setChildren({}); setExpanded(new Set()); setFocus(null);
    api<{ items: TreeNodeData[] }>('GET', base).then((r) => setRoots(r.items)).catch(fail);
  }, [base, fail]);

  const load = useCallback(async (key: string) => {
    if (children[key]) return;
    try { const r = await api<{ items: TreeNodeData[] }>('GET', `${base}?parent=${encodeURIComponent(key)}`); setChildren((c) => ({ ...c, [key]: r.items })); } catch (error) { fail(error); }
  }, [base, children, fail]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (nodes: TreeNodeData[], parentId: string | null, prefix: string, level: number) => {
      nodes.forEach((node, i) => {
        const id = `${parentId ?? ''}/${node.key}`;
        const chapter = prefix ? `${prefix}.${i + 1}` : String(i + 1);
        out.push({ id, node, chapter, level, parentId, posinset: i + 1, setsize: nodes.length });
        if (expanded.has(id) && children[node.key]) walk(children[node.key]!, id, chapter, level + 1);
      });
    };
    walk(roots ?? [], null, '', 1);
    return out;
  }, [roots, children, expanded]);

  // Le focus suit la ligne demandée une fois le rendu fait (déplacement par flèches, dépliage).
  useEffect(() => {
    if (pending.current) { refs.current.get(pending.current)?.focus(); pending.current = null; }
  });

  const go = (id: string) => { pending.current = id; setFocus(id); };
  const toggle = async (row: Row, open: boolean) => {
    if (row.node.childCount === 0) return;
    if (open) await load(row.node.key);
    setExpanded((set) => { const next = new Set(set); if (open) next.add(row.id); else next.delete(row.id); return next; });
  };
  const onKey = async (event: KeyboardEvent, row: Row, index: number) => {
    const open = expanded.has(row.id);
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); if (rows[index + 1]) go(rows[index + 1]!.id); break;
      case 'ArrowUp': event.preventDefault(); if (rows[index - 1]) go(rows[index - 1]!.id); break;
      case 'Home': event.preventDefault(); go(rows[0]!.id); break;
      case 'End': event.preventDefault(); go(rows.at(-1)!.id); break;
      case 'ArrowRight':
        event.preventDefault();
        if (row.node.childCount > 0 && !open) await toggle(row, true);
        else if (open && rows[index + 1]?.parentId === row.id) go(rows[index + 1]!.id);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (open) await toggle(row, false);
        else if (row.parentId) go(row.parentId);
        break;
      case 'Enter': case ' ': event.preventDefault(); onOpen(row.node.key); break;
      default:
    }
  };

  if (roots === null) return <p role="status">{fr.loading}</p>;
  if (roots.length === 0) return <p>{fr.tree.empty}</p>;
  const tabbable = focus && rows.some((r) => r.id === focus) ? focus : rows[0]?.id;
  return (
    <div role="tree" aria-label={fr.tree.label} className="ath-tree">
      {rows.map((row, index) => {
        const open = expanded.has(row.id);
        return (
          <div
            key={row.id} ref={(el) => { if (el) refs.current.set(row.id, el); else refs.current.delete(row.id); }}
            role="treeitem" aria-level={row.level} aria-posinset={row.posinset} aria-setsize={row.setsize}
            aria-expanded={row.node.childCount > 0 ? open : undefined} aria-selected={selected === row.node.key}
            tabIndex={row.id === tabbable ? 0 : -1} className="ath-tree__row" data-level={Math.min(row.level, 8)}
            onFocus={() => setFocus(row.id)} onKeyDown={(e) => void onKey(e, row, index)} onClick={() => onOpen(row.node.key)}
          >
            <span className="ath-tree__toggle" aria-hidden="true" onClick={(e) => { e.stopPropagation(); void toggle(row, !open); }}>{row.node.childCount > 0 ? (open ? '▾' : '▸') : ''}</span>
            <span className="ath-mono ath-tree__chapter">{row.chapter}</span>
            <span className="ath-mono ath-nowrap">{row.node.key}</span>
            <span className="ath-clip" title={row.node.title}>{row.node.title}</span>
            <StatusPill {...statusPill(row.node.category, row.node.statusColor)}>{row.node.statusName}</StatusPill>
            {row.node.suspect && <StatusPill kind="warning">{fr.artifact.suspect}</StatusPill>}
          </div>
        );
      })}
    </div>
  );
}
