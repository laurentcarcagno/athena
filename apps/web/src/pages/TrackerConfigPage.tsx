import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Btn, Card, Checkbox, Field as TextField, PageHeader, Select, StatusPill, Table, Td, Th, useToast } from '@athena/ui';
import { ApiError, api, type Session, type TrackerDefinition, type TrackerTypeEntry } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { useBusy, useFailure } from '../hooks';
import { WorkflowEditor } from '../components/WorkflowEditor';
import { HueSelect } from '../components/HueSelect';
import { statusPill } from '../lib/status';
import { ApprovalFlowEditor } from '../components/ApprovalFlowEditor';
import { LayoutEditor } from '../components/LayoutEditor';
import { fr } from '../i18n';
import { useProjectManager } from '../lib/project-role';
import { forSave, type Layout } from '../lib/layout';

/** Éditeur de tracker : ajout de champs, de statuts et de transitions (évolutions non destructrices). */
export function TrackerConfigPage({ session }: { session: Session }) {
  const { project, tracker } = useParams();
  const toast = useToast();
  const fail = useFailure();
  const confirm = useConfirm();
  // Configuration du tracker : administrateur ou chef de projet (le serveur vérifie qu'il est responsable de ce projet).
  const admin = useProjectManager(project, session);
  const [def, setDef] = useState<TrackerDefinition | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [trackerTypes, setTrackerTypes] = useState<TrackerTypeEntry[]>([]);
  const { busy, guard } = useBusy();
  const [field, setField] = useState({ key: '', label: '', type: 'text', required: false, isContent: true, readRoles: '', writeRoles: '' });
  const [status, setStatus] = useState({ key: '', name: '', category: 'todo' });
  const [transition, setTransition] = useState({ name: '', from: '', to: '', roles: '' });
  const base = `/v1/projects/${project}/trackers/${tracker}`;

  const reload = useCallback(async () => {
    const loaded = await api<TrackerDefinition>('GET', base);
    setDef(loaded);
    setLayout(loaded.layout ?? null);
    setTypes(await api<string[]>('GET', '/v1/field-types'));
  }, [base]);
  /** Teinte d'un statut (T-0138) : enregistrée aussitôt, puis la définition est relue. */
  const recolor = async (key: string, color: string | null) => {
    try {
      await api('PATCH', `${base}/statuses/${encodeURIComponent(key)}`, { color });
      await reload();
      toast('success', fr.hues.saved);
    } catch (error) { fail(error); }
  };
  useEffect(() => { reload().catch(fail); }, [reload, fail]);
  useEffect(() => { if (admin) api<TrackerTypeEntry[]>('GET', '/v1/tracker-types').then((t) => setTrackerTypes(Array.isArray(t) ? t : [])).catch(() => undefined); }, [admin]);
  const saveType = async (typeKey: string) => {
    try { await api('PATCH', `${base}/type`, { typeKey: typeKey || null }); toast('success', fr.types.typeSaved); await reload(); } catch (error) { fail(error); }
  };

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
    key: field.key, label: field.label, type: field.type, required: field.required, ...(field.isContent ? {} : { isContent: false }),
    ...(roleList(field.readRoles).length ? { readRoles: roleList(field.readRoles) } : {}),
    ...(roleList(field.writeRoles).length ? { writeRoles: roleList(field.writeRoles) } : {}),
  });
  const setContent = async (key: string, isContent: boolean) => {
    try { await api('PATCH', `${base}/fields/${key}`, { isContent }); toast('success', fr.suspicion.contentSaved); await reload(); } catch (error) { fail(error); }
  };
  const removeField = async (key: string) => {
    try {
      try {
        await api('DELETE', `${base}/fields/${key}`); // sans confirmation : le serveur refuse (409) s'il y a des valeurs
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        const impact = await api<{ withValue: number }>('GET', `${base}/fields/${key}/impact`).catch(() => ({ withValue: 0 }));
        if (!(await confirm.ask({ title: fr.confirm.purgeTitle(key), body: fr.config.confirmPurge(key, impact.withValue), confirm: fr.confirm.delete }))) throw error;
        await api('DELETE', `${base}/fields/${key}?purge=true`);
      }
      toast('success', fr.config.removed);
      await reload();
    } catch (error) { fail(error); }
  };

  const saveLayout = () => guard(async () => {
    try {
      await api('PATCH', `${base}/layout`, { layout: layout ? forSave(layout, def!.fields) : null });
      toast('success', fr.layout.saved);
      await reload();
    } catch (error) { fail(error); }
  });
  if (!def) return <p role="status">{fr.loading}</p>;
  const layoutChanged = JSON.stringify(layout ? forSave(layout, def.fields) : null) !== JSON.stringify(def.layout ?? null);
  const statusName = (id: string | null) => (id === null ? fr.config.anyState : def.statuses.find((s) => s.id === id)?.key ?? '?');
  return (
    <>
      {confirm.dialog}
      <PageHeader eyebrow={fr.config.eyebrow} title={`${fr.config.title} · ${def.key}`} sub={fr.config.schemaNote} />
      {!admin && <p className="ath-field__error">{fr.config.adminOnly}</p>}
      {admin && (
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="cfg-history">{fr.config.historyMode}</label>
          <Select id="cfg-history" value={def.historyMode ?? 'direct'} onChange={async (e) => {
            try { await api('PATCH', `${base}/history-mode`, { mode: e.target.value }); toast('success', fr.config.added); await reload(); } catch (error) { fail(error); }
          }}>
            <option value="direct">{fr.config.historyDirect}</option>
            <option value="merge_request">{fr.config.historyMr}</option>
          </Select>
        </div>
      )}
      <div className="ath-stack">
        <Card title={fr.config.fields} meta={String(def.fields.length)}>
          <Table>
            <thead><tr><Th>{fr.config.key}</Th><Th>{fr.config.label}</Th><Th>{fr.config.type}</Th><Th>{fr.config.required}</Th><Th>{fr.suspicion.column}</Th><Th>{fr.config.roles}</Th>{admin && <Th>{fr.config.remove}</Th>}</tr></thead>
            <tbody>{def.fields.map((f) => (
              <tr key={f.key}><Td mono>{f.key}</Td><Td>{f.label}</Td><Td mono>{f.type}</Td><Td>{f.required ? '✓' : ''}</Td>
                <Td>{admin ? <Checkbox aria-label={`${fr.suspicion.toggle} ${f.key}`} checked={f.isContent !== false} onChange={(e) => void setContent(f.key, e.target.checked)} /> : (f.isContent === false ? '' : '✓')}</Td>
                <Td mono>{f.readRoles || f.writeRoles ? `R: ${f.readRoles?.join(', ') ?? fr.config.everyone} · W: ${f.writeRoles?.join(', ') ?? fr.config.everyone}` : fr.config.everyone}</Td>
                {admin && <Td>{f.semanticRole !== 'title' && <Btn icon="trash" size="sm" variant="ghost" aria-label={`${fr.config.remove} ${f.key}`} onClick={() => removeField(f.key)}>{fr.config.remove}</Btn>}</Td>}</tr>
            ))}</tbody>
          </Table>
          {admin && (
            <form className="ath-toolbar" onSubmit={submit('fields', fieldBody(), () => setField({ key: '', label: '', type: 'text', required: false, isContent: true, readRoles: '', writeRoles: '' }))}>
              <TextField label={fr.config.key} value={field.key} onChange={(e) => setField({ ...field, key: e.target.value })} mono />
              <TextField label={fr.config.label} value={field.label} onChange={(e) => setField({ ...field, label: e.target.value })} />
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="cfg-type">{fr.config.type}</label>
                <Select id="cfg-type" value={field.type} onChange={(e) => setField({ ...field, type: e.target.value })}>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <label className="ath-row" title={fr.suspicion.contentHelp}><Checkbox checked={field.isContent} onChange={(e) => setField({ ...field, isContent: e.target.checked })} />{fr.suspicion.content}</label>
              <TextField label={fr.config.readRoles} value={field.readRoles} onChange={(e) => setField({ ...field, readRoles: e.target.value })} />
              <TextField label={fr.config.writeRoles} value={field.writeRoles} onChange={(e) => setField({ ...field, writeRoles: e.target.value })} />
              <Btn type="submit" icon="plus" disabled={!field.key || !field.label}>{fr.config.add}</Btn>
            </form>
          )}
        </Card>
        {admin && trackerTypes.length > 0 && (
          <Card title={fr.types.trackerType}>
            <div className="ath-field">
              <label className="ath-field__label" htmlFor="cfg-tracker-type">{fr.types.trackerType}</label>
              <Select id="cfg-tracker-type" value={def.typeKey ?? ''} onChange={(e) => void saveType(e.target.value)}>
                <option value="">{fr.types.noType}</option>
                {trackerTypes.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </Select>
            </div>
          </Card>
        )}
        {admin && (
          <Card title={fr.itemApproval.flowTitle}>
            <ApprovalFlowEditor project={String(project)} tracker={String(tracker)} />
          </Card>
        )}
        {admin && (
          <Card title={fr.layout.title}>
            <div className="ath-stack">
              <p className="ath-eyebrow">{fr.layout.help}</p>
              <LayoutEditor fields={def.fields} value={layout} onChange={setLayout} />
              <div><Btn icon="save" loading={busy} disabled={!layoutChanged} onClick={() => void saveLayout()}>{fr.layout.save}</Btn></div>
            </div>
          </Card>
        )}
        <Card title={fr.config.statuses} meta={String(def.statuses.length)}>
          {admin ? (
            <ul className="ath-stack ath-brand-list" aria-label={fr.hues.title}>
              {def.statuses.map((s) => <li key={s.id}><HueSelect status={s} onChange={(hue) => void recolor(s.key, hue)} /></li>)}
            </ul>
          ) : <div className="ath-row">{def.statuses.map((s) => <StatusPill key={s.id} {...statusPill(s.category, s.color)}>{s.name}</StatusPill>)}</div>}
          {admin && (
            <form className="ath-toolbar" onSubmit={submit('statuses', status, () => setStatus({ key: '', name: '', category: 'todo' }))}>
              <TextField label={fr.config.key} value={status.key} onChange={(e) => setStatus({ ...status, key: e.target.value })} mono />
              <TextField label={fr.config.name} value={status.name} onChange={(e) => setStatus({ ...status, name: e.target.value })} />
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="cfg-cat">{fr.config.category}</label>
                <Select id="cfg-cat" value={status.category} onChange={(e) => setStatus({ ...status, category: e.target.value })}>
                  {['todo', 'in_progress', 'done'].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <Btn type="submit" icon="plus" disabled={!status.key || !status.name}>{fr.config.add}</Btn>
            </form>
          )}
        </Card>
        <Card title={fr.config.workflow} meta={`${def.statuses.length} / ${def.transitions.length}`}>
          <WorkflowEditor statuses={def.statuses} transitions={def.transitions} editable={admin}
            onCreate={async ({ name, from, to, roles }) => {
              try {
                await api('POST', `${base}/transitions`, { name, from, to, ...(roles.length ? { conditions: [{ type: 'role', roles }] } : {}) });
                toast('success', fr.config.added);
                await reload();
              } catch (error) { fail(error); }
            }} />
        </Card>
        <Card title={fr.config.transitions} meta={String(def.transitions.length)}>
          <Table>
            <thead><tr><Th>{fr.config.name}</Th><Th>{fr.config.from}</Th><Th>{fr.config.to}</Th></tr></thead>
            <tbody>{def.transitions.map((t) => <tr key={t.id}><Td>{t.name}</Td><Td mono>{statusName(t.fromStatusId)}</Td><Td mono>{statusName(t.toStatusId)}</Td></tr>)}</tbody>
          </Table>
          {admin && (
            <form className="ath-toolbar" onSubmit={submit('transitions', { name: transition.name, from: transition.from === '' ? null : transition.from, to: transition.to, ...(roleList(transition.roles).length ? { conditions: [{ type: 'role', roles: roleList(transition.roles) }] } : {}) }, () => setTransition({ name: '', from: '', to: '', roles: '' }))}>
              <TextField label={fr.config.name} value={transition.name} onChange={(e) => setTransition({ ...transition, name: e.target.value })} />
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="cfg-from">{fr.config.from}</label>
                <Select id="cfg-from" value={transition.from} onChange={(e) => setTransition({ ...transition, from: e.target.value })}>
                  <option value="">{fr.config.anyState}</option>
                  {def.statuses.map((s) => <option key={s.id} value={s.key}>{s.key}</option>)}
                </Select>
              </div>
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="cfg-to">{fr.config.to}</label>
                <Select id="cfg-to" value={transition.to} onChange={(e) => setTransition({ ...transition, to: e.target.value })}>
                  <option value="" />
                  {def.statuses.map((s) => <option key={s.id} value={s.key}>{s.key}</option>)}
                </Select>
              </div>
              <TextField label={fr.config.allowedRoles} value={transition.roles} onChange={(e) => setTransition({ ...transition, roles: e.target.value })} />
              <Btn type="submit" icon="plus" disabled={!transition.name || !transition.to}>{fr.config.add}</Btn>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
