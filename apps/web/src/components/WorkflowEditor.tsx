import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Btn, Field } from '@athena/ui';
import { fr } from '../i18n';

export interface WfStatus { id: string; key: string; name: string; category: string }
export interface WfTransition { id: string; name: string; fromStatusId: string | null; toStatusId: string }

export const NODE = { w: 148, h: 46, gapX: 150, gapY: 60, pad: 24 };
const ANY = '__any__';
const COLUMNS = ['todo', 'in_progress', 'done'];

export interface LaidNode { id: string; key: string | null; label: string; category: string; x: number; y: number }
export interface LaidEdge { id: string; name: string; from: string; to: string; path: string; labelX: number; labelY: number; dashed: boolean }
export interface Layout { width: number; height: number; nodes: LaidNode[]; edges: LaidEdge[] }

/** Point où le segment centre → `toward` quitte le rectangle du nœud. */
function boundary(node: LaidNode, toward: { x: number; y: number }): { x: number; y: number } {
  const cx = node.x + NODE.w / 2;
  const cy = node.y + NODE.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min((NODE.w / 2) / Math.abs(dx || 1e-9), (NODE.h / 2) / Math.abs(dy || 1e-9));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Disposition d'une machine à états : une colonne par catégorie (à faire, en cours, terminé), plus une colonne
 * « Tout état » pour les transitions sans statut de départ. Les transitions parallèles sont courbées pour rester lisibles.
 */
export function layoutWorkflow(statuses: WfStatus[], transitions: WfTransition[], withAny: boolean): Layout {
  const needAny = withAny || transitions.some((t) => t.fromStatusId === null);
  const offset = needAny ? 1 : 0;
  const rows = new Map<string, number>();
  const nodes: LaidNode[] = [];
  for (const s of statuses) {
    const col = Math.max(COLUMNS.indexOf(s.category), 0) + offset;
    const row = rows.get(s.category) ?? 0;
    rows.set(s.category, row + 1);
    nodes.push({ id: s.id, key: s.key, label: s.name, category: s.category, x: NODE.pad + col * (NODE.w + NODE.gapX), y: NODE.pad + row * (NODE.h + NODE.gapY) });
  }
  const maxRows = Math.max(1, ...rows.values());
  const height = NODE.pad * 2 + maxRows * NODE.h + (maxRows - 1) * NODE.gapY;
  if (needAny) nodes.unshift({ id: ANY, key: null, label: fr.config.anyStateNode, category: 'any', x: NODE.pad, y: (height - NODE.h) / 2 });
  const width = NODE.pad * 2 + (COLUMNS.length + offset) * NODE.w + (COLUMNS.length + offset - 1) * NODE.gapX;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pairKey = (a: string, b: string) => [a, b].sort().join('|');
  const pairTotal = new Map<string, number>();
  for (const t of transitions) { const k = pairKey(t.fromStatusId ?? ANY, t.toStatusId); pairTotal.set(k, (pairTotal.get(k) ?? 0) + 1); }
  const seen = new Map<string, number>();
  const edges: LaidEdge[] = [];
  for (const t of transitions) {
    const a = byId.get(t.fromStatusId ?? ANY);
    const b = byId.get(t.toStatusId);
    if (!a || !b || a.id === b.id) continue;
    const k = pairKey(a.id, b.id);
    const index = seen.get(`${k}|${a.id}`) ?? 0;
    seen.set(`${k}|${a.id}`, index + 1);
    const ca = { x: a.x + NODE.w / 2, y: a.y + NODE.h / 2 };
    const cb = { x: b.x + NODE.w / 2, y: b.y + NODE.h / 2 };
    const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
    const nx = -(cb.y - ca.y) / len;
    const ny = (cb.x - ca.x) / len;
    const bend = (pairTotal.get(k) ?? 1) > 1 || Math.abs(ca.y - cb.y) < 1 ? 34 + index * 26 : index * 26;
    const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
    const c = { x: mid.x + nx * bend, y: mid.y + ny * bend };
    const p0 = boundary(a, c);
    const p1 = boundary(b, c);
    edges.push({
      id: t.id, name: t.name, from: a.id, to: b.id, dashed: t.fromStatusId === null,
      path: `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`,
      labelX: 0.25 * p0.x + 0.5 * c.x + 0.25 * p1.x, labelY: 0.25 * p0.y + 0.5 * c.y + 0.25 * p1.y,
    });
  }
  return { width, height, nodes, edges };
}

const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Éditeur graphique de workflow : statuts en nœuds, transitions en flèches. Cliquer départ puis arrivée crée une transition. */
export function WorkflowEditor({ statuses, transitions, editable, onCreate }: {
  statuses: WfStatus[]; transitions: WfTransition[]; editable: boolean;
  onCreate: (input: { name: string; from: string | null; to: string; roles: string[] }) => Promise<void>;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const [name, setName] = useState('');
  const [roles, setRoles] = useState('');
  const layout = layoutWorkflow(statuses, transitions, editable);
  const label = (id: string) => layout.nodes.find((n) => n.id === id)?.label ?? id;

  const pick = (node: LaidNode) => {
    if (!editable) return;
    if (source === null) { setSource(node.id); return; }
    if (source === node.id) { setSource(null); return; }
    setDraft({ from: source, to: node.id });
    setName(`${label(source) === fr.config.anyStateNode ? '' : label(source)} → ${node.label}`.replace(/^ → /, ''));
    setRoles('');
    setSource(null);
  };
  const onKey = (node: LaidNode) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(node); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const keyOf = (id: string) => layout.nodes.find((n) => n.id === id)?.key ?? null;
    await onCreate({ name: name.trim(), from: keyOf(draft.from), to: keyOf(draft.to)!, roles: roles.split(',').map((r) => r.trim()).filter(Boolean) });
    setDraft(null);
  };

  return (
    <div className="ath-stack">
      <svg className="ath-wf" role="group" aria-label={fr.config.workflow} viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" height={layout.height} preserveAspectRatio="xMidYMin meet">
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="ath-wf__arrow" /></marker>
        </defs>
        {layout.edges.map((e) => (
          <g key={e.id} className="ath-wf__edge">
            <path d={e.path} className={`ath-wf__path${e.dashed ? ' ath-wf__path--any' : ''}`} markerEnd="url(#wf-arrow)" fill="none"><title>{`${e.name} : ${label(e.from)} → ${label(e.to)}`}</title></path>
            <rect className="ath-wf__labelbg" x={e.labelX - Math.min(e.name.length, 18) * 3.4 - 4} y={e.labelY - 9} width={Math.min(e.name.length, 18) * 6.8 + 8} height={16} />
            <text className="ath-wf__label" x={e.labelX} y={e.labelY + 3} textAnchor="middle">{short(e.name, 18)}</text>
          </g>
        ))}
        {layout.nodes.map((n) => (
          <g key={n.id} className={`ath-wf__node ath-wf__node--${n.category}${source === n.id ? ' ath-wf__node--selected' : ''}${editable ? ' ath-wf__node--editable' : ''}`}
            transform={`translate(${n.x} ${n.y})`} role={editable ? 'button' : 'img'} tabIndex={editable ? 0 : undefined}
            aria-label={editable ? `${n.label}${source === n.id ? ' (départ)' : ''}` : n.label} aria-pressed={editable ? source === n.id : undefined}
            onClick={() => pick(n)} onKeyDown={onKey(n)}>
            <rect width={NODE.w} height={NODE.h} />
            <text x={NODE.w / 2} y={NODE.h / 2 + 4} textAnchor="middle">{short(n.label, 20)}</text>
          </g>
        ))}
      </svg>
      {editable && <p className="ath-eyebrow" role="status">{source ? fr.config.pickTarget(label(source)) : fr.config.workflowHelp}</p>}
      {draft && (
        <form className="ath-toolbar" onSubmit={submit} aria-label={fr.config.newTransition(label(draft.from), label(draft.to))}>
          <Field label={fr.config.name} value={name} onChange={(e) => setName(e.target.value)} />
          <Field label={fr.config.allowedRoles} value={roles} onChange={(e) => setRoles(e.target.value)} />
          <Btn type="submit" icon="plus" disabled={!name.trim()}>{fr.config.add}</Btn>
          <Btn type="button" variant="ghost" onClick={() => setDraft(null)}>{fr.config.cancel}</Btn>
        </form>
      )}
    </div>
  );
}
