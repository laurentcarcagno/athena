import { useEffect, useId, useState } from 'react';
import { Btn, Card, Field, StatusPill, Table, Td, Th } from '@athena/ui';
import { api } from '../api';
import { fr } from '../i18n';
import type { Layout } from '../lib/layout';
import { LayoutEditor } from './LayoutEditor';
import { WorkflowEditor } from './WorkflowEditor';

export interface DraftField { key: string; label: string; type: string; required?: boolean; config?: Record<string, unknown>; semanticRole?: string; readRoles?: string[]; writeRoles?: string[] }
export interface DraftStatus { key: string; name: string; category: 'todo' | 'in_progress' | 'done' }
export interface DraftTransition { name: string; from: string | null; to: string; conditions?: unknown[]; validators?: unknown[]; postActions?: unknown[] }
export interface DraftTracker { layout?: Layout | null; key: string; name: string; description?: string; fields: DraftField[]; statuses: DraftStatus[]; transitions: DraftTransition[] }

export const emptyTracker = (): DraftTracker => ({
  key: '', name: '',
  fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }],
  statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }, { key: 'done', name: 'Terminé', category: 'done' }],
  transitions: [{ name: 'Terminer', from: 'todo', to: 'done' }],
});

const ROLES = ['', 'title', 'description', 'assignee', 'due_date', 'estimate'];
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const sameKey = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

/** Éditeur d'un tracker complet (champs, statuts, workflow graphique), sans accès au serveur : il modifie un brouillon. */
export function TrackerBuilder({ value, onChange }: { value: DraftTracker; onChange: (next: DraftTracker) => void }) {
  const id = useId();
  const [types, setTypes] = useState<string[]>(['text']);
  const [field, setField] = useState({ key: '', label: '', type: 'text', required: false, options: '', role: '' });
  const [status, setStatus] = useState({ key: '', name: '', category: 'todo' as DraftStatus['category'] });
  useEffect(() => { api<string[]>('GET', '/v1/field-types').then(setTypes).catch(() => undefined); }, []);

  const addField = () => {
    const key = sameKey(field.key);
    const options = field.options.split(',').map((o) => o.trim()).filter(Boolean);
    onChange({ ...value, fields: [...value.fields, {
      key, label: field.label.trim(), type: field.type, ...(field.required ? { required: true } : {}),
      ...(field.type === 'select' || field.type === 'multiselect' ? { config: { options } } : {}),
      ...(field.role ? { semanticRole: field.role } : {}),
    }] });
    setField({ key: '', label: '', type: 'text', required: false, options: '', role: '' });
  };
  const fieldInvalid = !KEY.test(sameKey(field.key)) || !field.label.trim() || value.fields.some((f) => f.key === sameKey(field.key))
    || ((field.type === 'select' || field.type === 'multiselect') && field.options.trim() === '')
    || (field.role !== '' && value.fields.some((f) => f.semanticRole === field.role));
  const addStatus = () => {
    onChange({ ...value, statuses: [...value.statuses, { key: sameKey(status.key), name: status.name.trim(), category: status.category }] });
    setStatus({ key: '', name: '', category: 'todo' });
  };
  const statusInvalid = !KEY.test(sameKey(status.key)) || !status.name.trim() || value.statuses.some((s) => s.key === sameKey(status.key));
  const removeStatus = (key: string) => onChange({ ...value, statuses: value.statuses.filter((s) => s.key !== key), transitions: value.transitions.filter((t) => t.from !== key && t.to !== key) });
  const nameOf = (key: string | null) => (key === null ? fr.config.anyState : value.statuses.find((s) => s.key === key)?.name ?? key);

  return (
    <div className="ath-stack">
      <div className="ath-toolbar">
        <Field label={fr.builder.trackerKey} value={value.key} onChange={(e) => onChange({ ...value, key: e.target.value.toUpperCase() })} mono />
        <Field label={fr.builder.trackerName} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </div>

      <Card title={fr.config.fields} meta={String(value.fields.length)}>
        <div className="ath-stack">
          <Table>
            <thead><tr><Th>{fr.config.key}</Th><Th>{fr.config.label}</Th><Th>{fr.config.type}</Th><Th>{fr.config.required}</Th><Th>{fr.builder.options}</Th><Th>{fr.builder.role}</Th><Th>{fr.config.remove}</Th></tr></thead>
            <tbody>{value.fields.map((f) => (
              <tr key={f.key}>
                <Td mono>{f.key}</Td><Td>{f.label}</Td><Td mono>{f.type}</Td><Td>{f.required ? '✓' : ''}</Td>
                <Td>{((f.config?.['options'] as string[] | undefined) ?? []).join(', ')}</Td><Td mono>{f.semanticRole ?? ''}</Td>
                <Td><Btn size="sm" variant="ghost" aria-label={`${fr.config.remove} ${f.key}`} onClick={() => onChange({ ...value, fields: value.fields.filter((x) => x.key !== f.key) })}>{fr.config.remove}</Btn></Td>
              </tr>
            ))}</tbody>
          </Table>
          <div className="ath-toolbar">
            <Field label={fr.config.key} value={field.key} onChange={(e) => setField({ ...field, key: e.target.value })} mono />
            <Field label={fr.config.label} value={field.label} onChange={(e) => setField({ ...field, label: e.target.value })} />
            <div className="ath-field">
              <label className="ath-field__label" htmlFor={`${id}-type`}>{fr.config.type}</label>
              <select id={`${id}-type`} className="ath-select" value={field.type} onChange={(e) => setField({ ...field, type: e.target.value })}>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            {(field.type === 'select' || field.type === 'multiselect') && <Field label={fr.builder.optionsHelp} value={field.options} onChange={(e) => setField({ ...field, options: e.target.value })} />}
            <div className="ath-field">
              <label className="ath-field__label" htmlFor={`${id}-role`}>{fr.builder.role}</label>
              <select id={`${id}-role`} className="ath-select" value={field.role} onChange={(e) => setField({ ...field, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{r || '—'}</option>)}</select>
            </div>
            <label className="ath-row"><input type="checkbox" checked={field.required} onChange={(e) => setField({ ...field, required: e.target.checked })} />{fr.config.required}</label>
            <Btn type="button" disabled={fieldInvalid} onClick={addField}>{fr.builder.addField}</Btn>
          </div>
        </div>
      </Card>

      <Card title={fr.layout.title}>
        <div className="ath-stack">
          <p className="ath-eyebrow">{fr.layout.help}</p>
          <LayoutEditor fields={value.fields} value={value.layout ?? null} onChange={(layout) => onChange({ ...value, layout })} />
        </div>
      </Card>

      <Card title={fr.config.statuses} meta={String(value.statuses.length)}>
        <div className="ath-stack">
          <div className="ath-row">{value.statuses.map((s) => (
            <span key={s.key} className="ath-row">
              <StatusPill kind={s.category === 'done' ? 'success' : s.category === 'in_progress' ? 'warning' : 'info'}>{s.name}</StatusPill>
              <Btn size="sm" variant="ghost" aria-label={`${fr.config.remove} ${s.name}`} onClick={() => removeStatus(s.key)}>{fr.config.remove}</Btn>
            </span>
          ))}</div>
          <div className="ath-toolbar">
            <Field label={`${fr.config.key} (${fr.config.statuses})`} value={status.key} onChange={(e) => setStatus({ ...status, key: e.target.value })} mono />
            <Field label={`${fr.config.name} (${fr.config.statuses})`} value={status.name} onChange={(e) => setStatus({ ...status, name: e.target.value })} />
            <div className="ath-field">
              <label className="ath-field__label" htmlFor={`${id}-cat`}>{fr.config.category}</label>
              <select id={`${id}-cat`} className="ath-select" value={status.category} onChange={(e) => setStatus({ ...status, category: e.target.value as DraftStatus['category'] })}>
                {['todo', 'in_progress', 'done'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Btn type="button" disabled={statusInvalid} onClick={addStatus}>{fr.builder.addStatus}</Btn>
          </div>
        </div>
      </Card>

      <Card title={fr.config.workflow} meta={`${value.statuses.length} / ${value.transitions.length}`}>
        <div className="ath-stack">
          <WorkflowEditor
            statuses={value.statuses.map((s) => ({ id: s.key, key: s.key, name: s.name, category: s.category }))}
            transitions={value.transitions.map((t, i) => ({ id: `t${i}`, name: t.name, fromStatusId: t.from, toStatusId: t.to }))}
            editable
            onCreate={async ({ name, from, to, roles }) => onChange({ ...value, transitions: [...value.transitions, { name, from, to, ...(roles.length ? { conditions: [{ type: 'role', roles }] } : {}) }] })} />
          {value.transitions.length > 0 && (
            <Table>
              <thead><tr><Th>{fr.config.name}</Th><Th>{fr.config.from}</Th><Th>{fr.config.to}</Th><Th>{fr.config.remove}</Th></tr></thead>
              <tbody>{value.transitions.map((t, i) => (
                <tr key={`${t.name}-${i}`}><Td>{t.name}</Td><Td>{nameOf(t.from)}</Td><Td>{nameOf(t.to)}</Td>
                  <Td><Btn size="sm" variant="ghost" aria-label={`${fr.config.remove} ${t.name}`} onClick={() => onChange({ ...value, transitions: value.transitions.filter((_, j) => j !== i) })}>{fr.config.remove}</Btn></Td></tr>
              ))}</tbody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Contrôles minimaux avant envoi : le serveur revalide tout. */
export function trackerProblems(t: DraftTracker): string[] {
  const out: string[] = [];
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(t.key)) out.push(fr.builder.badKey);
  if (!t.name.trim()) out.push(fr.builder.badName);
  if (!t.fields.some((f) => f.semanticRole === 'title')) out.push(fr.builder.noTitle);
  if (!t.statuses.some((s) => s.category === 'todo')) out.push(fr.builder.noTodo);
  return out;
}
