/**
 * Panneaux de gestion de projet réutilisés par Paramètres (T-0120) : acteurs du projet et boards. Les sprints et les versions
 * se planifient dans Backlog et Roadmap.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Btn, Card, EmptyState, Field, PageHeader, Select, StatusPill, Table, Tabs, Td, Textarea, Th, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import type { MemberEntry, UserEntry } from './OrgAdminPage';


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
              <Td><Select aria-label={`${fr.manage.role} ${m.username}`} value={m.role} onChange={(e) => set(m.subject, e.target.value)}>
                <option value="manager">{fr.manage.manager}</option><option value="member">{fr.manage.member}</option></Select></Td>
              <Td><Btn icon="trash" size="sm" variant="ghost" aria-label={`${fr.manage.removeActor} ${m.username}`} onClick={() => remove(m.subject)}>{fr.manage.removeActor}</Btn></Td></tr>
          ))}</tbody>
        </Table>
      )}
      <form className="ath-toolbar" onSubmit={(e) => { e.preventDefault(); void set(pick.subject, pick.role).then(() => setPick({ subject: '', role: 'member' })); }}>
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="actor-user">{fr.org.chooseUser}</label>
          <Select id="actor-user" value={pick.subject} onChange={(e) => setPick({ ...pick, subject: e.target.value })}>
            <option value="" />{candidates.map((u) => <option key={u.subject} value={u.subject}>{u.displayName} ({u.username})</option>)}
          </Select>
        </div>
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="actor-role">{fr.manage.role}</label>
          <Select id="actor-role" value={pick.role} onChange={(e) => setPick({ ...pick, role: e.target.value })}>
            <option value="member">{fr.manage.member}</option><option value="manager">{fr.manage.manager}</option>
          </Select>
        </div>
        <Btn type="submit" icon="plus" disabled={!pick.subject}>{fr.manage.addActor}</Btn>
      </form>
    </div>
  );
}

export function BoardsTab({ project }: { project: string }) {
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
            <Select id="board-tracker" value={form.tracker} onChange={(e) => setForm({ ...form, tracker: e.target.value })}>{trackers.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          </div>
        </div>
        <label className="ath-field__label" htmlFor="board-columns">{fr.manage.boardColumns}</label>
        <Textarea id="board-columns" className="ath-mono" rows={4} value={form.columns} onChange={(e) => setForm({ ...form, columns: e.target.value })} />
        <div><Btn type="submit" disabled={!form.key || !form.name.trim() || parseColumns(form.columns).length === 0}>{fr.manage.createBoard}</Btn></div>
      </form>
    </div>
  );
}
