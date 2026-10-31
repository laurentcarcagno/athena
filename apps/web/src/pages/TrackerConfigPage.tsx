import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Btn, Card, Field as TextField, PageHeader, StatusPill, Table, Td, Th, useToast } from '@athena/ui';
import { ApiError, api, type Session, type TrackerDefinition } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

/** Éditeur de tracker : ajout de champs, de statuts et de transitions (évolutions non destructrices). */
export function TrackerConfigPage({ session }: { session: Session }) {
  const { project, tracker } = useParams();
  const toast = useToast();
  const fail = useFailure();
  const admin = session.user?.roles.includes('athena-admin') ?? false;
  const [def, setDef] = useState<TrackerDefinition | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [field, setField] = useState({ key: '', label: '', type: 'text', required: false, readRoles: '', writeRoles: '' });
  const [status, setStatus] = useState({ key: '', name: '', category: 'todo' });
  const [transition, setTransition] = useState({ name: '', from: '', to: '' });
  const base = `/v1/projects/${project}/trackers/${tracker}`;

  const reload = useCallback(async () => {
    setDef(await api<TrackerDefinition>('GET', base));
    setTypes(await api<string[]>('GET', '/v1/field-types'));
  }, [base]);
  useEffect(() => { reload().catch(fail); }, [reload, fail]);

  const submit = (path: string, body: unknown, reset: () => void) => async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', `${base}/${path}`, body);
      toast('success', fr.config.added);
      reset();
      await reload();
    } catch (error) {
      fail(error);
    }
  };

  const roleList = (raw: string) => raw.split(',').map((r) => r.trim()).filter(Boolean);
  const fieldBody = () => ({
    key: field.key, label: field.label, type: field.type, required: field.required,
    ...(roleList(field.readRoles).length ? { readRoles: roleList(field.readRoles) } : {}),
    ...(roleList(field.writeRoles).length ? { writeRoles: roleList(field.writeRoles) } : {}),
  });
  const removeField = async (key: string) => {
    try {
      try {
        await api('DELETE', `${base}/fields/${key}`);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409 || !window.confirm(fr.config.confirmPurge(key))) throw error;
        await api('DELETE', `${base}/fields/${key}?purge=true`);
      }
      toast('success', fr.config.removed);
      await reload();
    } catch (error) { fail(error); }
  };

  if (!def) return <p role="status">{fr.loading}</p>;
  const statusName = (id: string | null) => (id === null ? fr.config.anyState : def.statuses.find((s) => s.id === id)?.key ?? '?');
  return (
    <>
      <PageHeader eyebrow={fr.config.eyebrow} title={`${fr.config.title} · ${def.key}`} sub={fr.config.schemaNote} />
      {!admin && <p className="ath-field__error">{fr.config.adminOnly}</p>}
      <div className="ath-stack">
        <Card title={fr.config.fields} meta={String(def.fields.length)}>
          <Table>
            <thead><tr><Th>{fr.config.key}</Th><Th>{fr.config.label}</Th><Th>{fr.config.type}</Th><Th>{fr.config.required}</Th><Th>{fr.config.roles}</Th>{admin && <Th>{fr.config.remove}</Th>}</tr></thead>
            <tbody>{def.fields.map((f) => (
              <tr key={f.key}><Td mono>{f.key}</Td><Td>{f.label}</Td><Td mono>{f.type}</Td><Td>{f.required ? '✓' : ''}</Td>
                <Td mono>{f.readRoles || f.writeRoles ? `R: ${f.readRoles?.join(', ') ?? fr.config.everyone} · W: ${f.writeRoles?.join(', ') ?? fr.config.everyone}` : fr.config.everyone}</Td>
                {admin && <Td>{f.semanticRole !== 'title' && <Btn size="sm" variant="ghost" aria-label={`${fr.config.remove} ${f.key}`} onClick={() => removeField(f.key)}>{fr.config.remove}</Btn>}</Td>}</tr>
            ))}</tbody>
          </Table>
          {admin && (
            <form className="ath-toolbar" onSubmit={submit('fields', fieldBody(), () => setField({ key: '', label: '', type: 'text', required: false, readRoles: '', writeRoles: '' }))}>
              <TextField label={fr.config.key} value={field.key} onChange={(e) => setField({ ...field, key: e.target.value })} mono />
              <TextField label={fr.config.label} value={field.label} onChange={(e) => setField({ ...field, label: e.target.value })} />
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="cfg-type">{fr.config.type}</label>
                <select id="cfg-type" className="ath-select" value={field.type} onChange={(e) => setField({ ...field, type: e.target.value })}>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <TextField label={fr.config.readRoles} value={field.readRoles} onChange={(e) => setField({ ...field, readRoles: e.target.value })} />
              <TextField label={fr.config.writeRoles} value={field.writeRoles} onChange={(e) => setField({ ...field, writeRoles: e.target.value })} />
              <Btn type="submit" disabled={!field.key || !field.label}>{fr.config.add}</Btn>
            </form>
          )}
        </Card>
        <Card title={fr.config.statuses} meta={String(def.statuses.length)}>
          <div className="ath-row">{def.statuses.map((s) => <StatusPill key={s.id} kind={s.category === 'done' ? 'success' : s.category === 'in_progress' ? 'warning' : 'info'}>{s.name}</StatusPill>)}</div>
          {admin && (
            <form className="ath-toolbar" onSubmit={submit('statuses', status, () => setStatus({ key: '', name: '', category: 'todo' }))}>
              <TextField label={fr.config.key} value={status.key} onChange={(e) => setStatus({ ...status, key: e.target.value })} mono />
              <TextField label={fr.config.name} value={status.name} onChange={(e) => setStatus({ ...status, name: e.target.value })} />
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="cfg-cat">{fr.config.category}</label>
                <select id="cfg-cat" className="ath-select" value={status.category} onChange={(e) => setStatus({ ...status, category: e.target.value })}>
                  {['todo', 'in_progress', 'done'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <Btn type="submit" disabled={!status.key || !status.name}>{fr.config.add}</Btn>
            </form>
          )}
        </Card>
        <Card title={fr.config.transitions} meta={String(def.transitions.length)}>
          <Table>
            <thead><tr><Th>{fr.config.name}</Th><Th>{fr.config.from}</Th><Th>{fr.config.to}</Th></tr></thead>
            <tbody>{def.transitions.map((t) => <tr key={t.id}><Td>{t.name}</Td><Td mono>{statusName(t.fromStatusId)}</Td><Td mono>{statusName(t.toStatusId)}</Td></tr>)}</tbody>
          </Table>
          {admin && (
            <form className="ath-toolbar" onSubmit={submit('transitions', { name: transition.name, from: transition.from === '' ? null : transition.from, to: transition.to }, () => setTransition({ name: '', from: '', to: '' }))}>
              <TextField label={fr.config.name} value={transition.name} onChange={(e) => setTransition({ ...transition, name: e.target.value })} />
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="cfg-from">{fr.config.from}</label>
                <select id="cfg-from" className="ath-select" value={transition.from} onChange={(e) => setTransition({ ...transition, from: e.target.value })}>
                  <option value="">{fr.config.anyState}</option>
                  {def.statuses.map((s) => <option key={s.id} value={s.key}>{s.key}</option>)}
                </select>
              </div>
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="cfg-to">{fr.config.to}</label>
                <select id="cfg-to" className="ath-select" value={transition.to} onChange={(e) => setTransition({ ...transition, to: e.target.value })}>
                  <option value="" />
                  {def.statuses.map((s) => <option key={s.id} value={s.key}>{s.key}</option>)}
                </select>
              </div>
              <Btn type="submit" disabled={!transition.name || !transition.to}>{fr.config.add}</Btn>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
