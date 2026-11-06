import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Btn, Card, EmptyState, Field, PageHeader, StatusPill, Table, Tabs, Td, Th, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import type { MemberEntry, UserEntry } from './OrgAdminPage';

interface Sprint { id: string; name: string; goal: string; state: string; startsOn: string | null; endsOn: string | null }
interface Release { id: string; name: string; state: string; startsOn: string; endsOn: string; items: number; doneItems: number }

/** Colonnes saisies une par ligne : « nom=statut1,statut2|limite ». */
export function parseColumns(raw: string): Array<{ name: string; statuses: string[]; wipLimit?: number }> {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [head = '', wip] = line.split('|');
    const [name = '', statuses = ''] = head.split('=');
    const limit = wip ? Number(wip.trim()) : undefined;
    return { name: name.trim(), statuses: statuses.split(',').map((s) => s.trim()).filter(Boolean), ...(limit && Number.isInteger(limit) && limit > 0 ? { wipLimit: limit } : {}) };
  });
}

/** Acteurs du projet (onglet Membres). */
export function ActorsTab({ project }: { project: string }) {
  const toast = useToast();
  const fail = useFailure();
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [pick, setPick] = useState({ subject: '', role: 'member' });
  const load = useCallback(async () => setMembers(await api<MemberEntry[]>('GET', `/v1/projects/${project}/members`)), [project]);
  useEffect(() => { load().catch(fail); api<UserEntry[]>('GET', '/v1/users').then(setUsers).catch(fail); }, [load, fail]);
  const set = async (subject: string, role: string) => {
    try { await api('PUT', `/v1/projects/${project}/members/${encodeURIComponent(subject)}`, { role }); toast('success', fr.manage.actorSet); await load(); } catch (e) { fail(e); }
  };
  const remove = async (subject: string) => {
    try { await api('DELETE', `/v1/projects/${project}/members/${encodeURIComponent(subject)}`); // sans confirmation : réversible (le rôle se redonne)
      toast('success', fr.manage.actorRemoved); await load(); } catch (e) { fail(e); }
  };
  const candidates = users.filter((u) => !members.some((m) => m.subject === u.subject));
  return (
    <div className="ath-stack">
      {members.length === 0 ? <EmptyState eyebrow={fr.manage.actors} title={fr.admin.empty} /> : (
        <Table>
          <thead><tr><Th>{fr.org.displayName}</Th><Th>{fr.org.username}</Th><Th>{fr.manage.role}</Th><Th>{fr.manage.removeActor}</Th></tr></thead>
          <tbody>{members.map((m) => (
            <tr key={m.subject}><Td>{m.displayName}</Td><Td mono>{m.username}</Td>
              <Td><select className="ath-select" aria-label={`${fr.manage.role} ${m.username}`} value={m.role} onChange={(e) => set(m.subject, e.target.value)}>
                <option value="manager">{fr.manage.manager}</option><option value="member">{fr.manage.member}</option></select></Td>
              <Td><Btn size="sm" variant="ghost" aria-label={`${fr.manage.removeActor} ${m.username}`} onClick={() => remove(m.subject)}>{fr.manage.removeActor}</Btn></Td></tr>
          ))}</tbody>
        </Table>
      )}
      <form className="ath-toolbar" onSubmit={(e) => { e.preventDefault(); void set(pick.subject, pick.role).then(() => setPick({ subject: '', role: 'member' })); }}>
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="actor-user">{fr.org.chooseUser}</label>
          <select id="actor-user" className="ath-select" value={pick.subject} onChange={(e) => setPick({ ...pick, subject: e.target.value })}>
            <option value="" />{candidates.map((u) => <option key={u.subject} value={u.subject}>{u.displayName} ({u.username})</option>)}
          </select>
        </div>
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="actor-role">{fr.manage.role}</label>
          <select id="actor-role" className="ath-select" value={pick.role} onChange={(e) => setPick({ ...pick, role: e.target.value })}>
            <option value="member">{fr.manage.member}</option><option value="manager">{fr.manage.manager}</option>
          </select>
        </div>
        <Btn type="submit" disabled={!pick.subject}>{fr.manage.addActor}</Btn>
      </form>
    </div>
  );
}

function SprintsTab({ project }: { project: string }) {
  const toast = useToast();
  const fail = useFailure();
  const [items, setItems] = useState<Sprint[]>([]);
  const [form, setForm] = useState({ name: '', goal: '', startsOn: '', endsOn: '' });
  const load = useCallback(async () => setItems(await api<Sprint[]>('GET', `/v1/projects/${project}/sprints`)), [project]);
  useEffect(() => { load().catch(fail); }, [load, fail]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try { await api('POST', `/v1/projects/${project}/sprints`, { name: form.name, startsOn: form.startsOn, endsOn: form.endsOn, ...(form.goal ? { goal: form.goal } : {}) }); toast('success', fr.manage.saved); setForm({ name: '', goal: '', startsOn: '', endsOn: '' }); await load(); } catch (e) { fail(e); }
  };
  const act = async (id: string, action: 'start' | 'close') => {
    try { await api('POST', `/v1/projects/${project}/sprints/${id}/${action}`); toast('success', fr.manage.saved); await load(); } catch (e) { fail(e); }
  };
  return (
    <div className="ath-stack">
      {items.length === 0 ? <EmptyState eyebrow={fr.manage.sprints} title={fr.admin.empty} /> : (
        <Table>
          <thead><tr><Th>{fr.config.name}</Th><Th>{fr.manage.goal}</Th><Th>{fr.manage.starts}</Th><Th>{fr.manage.ends}</Th><Th>{fr.manage.state}</Th><Th>{fr.board.moveTo}</Th></tr></thead>
          <tbody>{items.map((s) => (
            <tr key={s.id}><Td>{s.name}</Td><Td>{s.goal || '—'}</Td><Td mono>{s.startsOn ?? '—'}</Td><Td mono>{s.endsOn ?? '—'}</Td>
              <Td><StatusPill kind={s.state === 'closed' ? 'success' : s.state === 'active' ? 'warning' : 'info'}>{s.state}</StatusPill></Td>
              <Td>{s.state === 'planned' && <Btn size="sm" variant="ghost" onClick={() => act(s.id, 'start')}>{fr.manage.start}</Btn>}
                {s.state === 'active' && <Btn size="sm" variant="ghost" onClick={() => act(s.id, 'close')}>{fr.manage.close}</Btn>}</Td></tr>
          ))}</tbody>
        </Table>
      )}
      <form className="ath-toolbar" onSubmit={create}>
        <Field label={fr.manage.sprintName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label={fr.manage.goal} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
        <Field label={fr.manage.starts} type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} mono />
        <Field label={fr.manage.ends} type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} mono />
        <Btn type="submit" disabled={!form.name.trim() || !form.startsOn || !form.endsOn}>{fr.manage.createSprint}</Btn>
      </form>
    </div>
  );
}

function ReleasesTab({ project }: { project: string }) {
  const toast = useToast();
  const fail = useFailure();
  const [items, setItems] = useState<Release[]>([]);
  const [form, setForm] = useState({ name: '', startsOn: '', endsOn: '' });
  const load = useCallback(async () => setItems(await api<Release[]>('GET', `/v1/projects/${project}/roadmap`)), [project]);
  useEffect(() => { load().catch(fail); }, [load, fail]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try { await api('POST', `/v1/projects/${project}/releases`, form); toast('success', fr.manage.saved); setForm({ name: '', startsOn: '', endsOn: '' }); await load(); } catch (e) { fail(e); }
  };
  const publish = async (id: string) => {
    try { await api('POST', `/v1/projects/${project}/releases/${id}/publish`); toast('success', fr.manage.saved); await load(); } catch (e) { fail(e); }
  };
  return (
    <div className="ath-stack">
      {items.length === 0 ? <EmptyState eyebrow={fr.manage.releases} title={fr.dashboard.noRelease} /> : (
        <Table>
          <thead><tr><Th>{fr.config.name}</Th><Th>{fr.manage.starts}</Th><Th>{fr.manage.ends}</Th><Th>{fr.manage.state}</Th><Th>{fr.manage.publish}</Th></tr></thead>
          <tbody>{items.map((r) => (
            <tr key={r.id}><Td>{r.name}</Td><Td mono>{r.startsOn}</Td><Td mono>{r.endsOn}</Td><Td><StatusPill kind={r.state === 'released' ? 'success' : 'info'}>{r.state}</StatusPill></Td>
              <Td>{r.state !== 'released' && <Btn size="sm" variant="ghost" onClick={() => publish(r.id)}>{fr.manage.publish}</Btn>}</Td></tr>
          ))}</tbody>
        </Table>
      )}
      <form className="ath-toolbar" onSubmit={create}>
        <Field label={fr.manage.releaseName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label={fr.manage.starts} type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} mono />
        <Field label={fr.manage.ends} type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} mono />
        <Btn type="submit" disabled={!form.name.trim() || !form.startsOn || !form.endsOn}>{fr.manage.createRelease}</Btn>
      </form>
    </div>
  );
}

function BoardsTab({ project }: { project: string }) {
  const toast = useToast();
  const fail = useFailure();
  const [boards, setBoards] = useState<Array<{ key: string; name: string }>>([]);
  const [trackers, setTrackers] = useState<string[]>([]);
  const [form, setForm] = useState({ key: '', name: '', tracker: '', columns: '' });
  const load = useCallback(async () => setBoards(await api<Array<{ key: string; name: string }>>('GET', `/v1/projects/${project}/boards`)), [project]);
  useEffect(() => {
    load().catch(fail);
    api<Array<{ key: string }>>('GET', `/v1/projects/${project}/trackers`).then((t) => { setTrackers(t.map((x) => x.key)); setForm((f) => ({ ...f, tracker: f.tracker || (t[0]?.key ?? '') })); }).catch(fail);
  }, [load, fail, project]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', `/v1/projects/${project}/boards`, { key: form.key, name: form.name, trackerKeys: [form.tracker], columns: parseColumns(form.columns) });
      toast('success', fr.manage.saved);
      setForm({ ...form, key: '', name: '', columns: '' });
      await load();
    } catch (e) { fail(e); }
  };
  return (
    <div className="ath-stack">
      {boards.length === 0 ? <EmptyState eyebrow={fr.manage.boards} title={fr.admin.empty} /> : (
        <Table>
          <thead><tr><Th>{fr.config.key}</Th><Th>{fr.config.name}</Th></tr></thead>
          <tbody>{boards.map((b) => <tr key={b.key}><Td mono>{b.key}</Td><Td>{b.name}</Td></tr>)}</tbody>
        </Table>
      )}
      <form className="ath-stack" onSubmit={create}>
        <div className="ath-toolbar">
          <Field label={fr.manage.boardKey} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} mono />
          <Field label={fr.manage.boardName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="board-tracker">{fr.manage.boardTracker}</label>
            <select id="board-tracker" className="ath-select" value={form.tracker} onChange={(e) => setForm({ ...form, tracker: e.target.value })}>{trackers.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
        </div>
        <label className="ath-field__label" htmlFor="board-columns">{fr.manage.boardColumns}</label>
        <textarea id="board-columns" className="ath-input ath-mono" rows={4} value={form.columns} onChange={(e) => setForm({ ...form, columns: e.target.value })} />
        <div><Btn type="submit" disabled={!form.key || !form.name.trim() || parseColumns(form.columns).length === 0}>{fr.manage.createBoard}</Btn></div>
      </form>
    </div>
  );
}

/** Fenêtre du chef de projet : acteurs du projet, sprints, versions, boards. */
export function ProjectManagePage({ session }: { session: Session }) {
  const { project } = useParams();
  const [tab, setTab] = useState('sprints');
  const roles = session.user?.roles ?? [];
  if (!roles.includes('athena-admin') && !roles.includes('athena-pm')) {
    return <><PageHeader eyebrow={fr.manage.eyebrow} title={`${fr.manage.title} · ${project}`} /><p className="ath-field__error">{fr.manage.restricted}</p></>;
  }
  return (
    <>
      <PageHeader eyebrow={fr.manage.eyebrow} title={`${fr.manage.title} · ${project}`} />
      <Tabs tabs={[{ id: 'sprints', label: fr.manage.sprints }, { id: 'releases', label: fr.manage.releases }, { id: 'boards', label: fr.manage.boards }]} active={tab} onChange={setTab} />
      <div role="tabpanel" className="ath-stack">
        {tab === 'sprints' && <SprintsTab project={project!} />}
        {tab === 'releases' && <ReleasesTab project={project!} />}
        {tab === 'boards' && <BoardsTab project={project!} />}
      </div>
    </>
  );
}
