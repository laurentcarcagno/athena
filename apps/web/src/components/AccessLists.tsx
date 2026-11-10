import { useCallback, useEffect, useState } from 'react';
import { Btn, EmptyState, Table, Tag, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { useConfirm } from './ConfirmDialog';

interface ListMember { subject: string; username: string; displayName: string }
interface AccessList { scope: 'project' | 'tracker'; tracker: string | null; members: ListMember[] }
interface UserEntry { subject: string; username: string; displayName: string }

/**
 * Listes d'ayants droit (besoin d'en connaître) d'un projet et de ses trackers. Une portée dotée d'une liste n'est lisible que de ses
 * membres, administrateurs d'organisation compris : créer une liste est confirmé, et la liste ne peut jamais être vidée (on la supprime).
 */
export function AccessLists({ project, me }: { project: string; me: string | undefined }) {
  const t = fr.access;
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [lists, setLists] = useState<AccessList[] | null>(null);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [trackers, setTrackers] = useState<string[]>([]);
  const [scope, setScope] = useState('');
  const [pick, setPick] = useState('');
  const load = useCallback(() => { api<AccessList[]>('GET', `/v1/projects/${project}/access-lists`).then(setLists).catch(fail); }, [project, fail]);
  useEffect(() => {
    load();
    api<UserEntry[]>('GET', '/v1/users').then(setUsers).catch(() => setUsers([]));
    api<Array<{ key: string }>>('GET', `/v1/projects/${project}/trackers`).then((r) => setTrackers(r.map((x) => x.key))).catch(() => setTrackers([]));
  }, [project, load]);

  const find = (s: string) => lists?.find((l) => (l.tracker ?? '') === s);
  const label = (s: string) => (s === '' ? t.wholeProject : t.trackerScope(s));
  const save = async (s: string, members: string[], created: boolean) => {
    try {
      await api('PUT', `/v1/projects/${project}/access-lists`, { tracker: s || null, members });
      toast('success', created ? t.created : t.saved);
      load();
    } catch (error) { fail(error); }
  };
  const scopes = ['', ...trackers];
  const without = scopes.filter((s) => !find(s));
  const target = without.includes(scope) ? scope : (without[0] ?? '');
  const create = async () => {
    const mine = users.find((u) => u.username === me)?.subject;
    const first = pick || mine;
    if (!first) return;
    const members = [...new Set([first, ...(mine ? [mine] : [])])];
    const hidesFromMe = !mine;
    if (!(await confirm.ask({ title: t.createTitle(label(target)), body: hidesFromMe ? t.createBodyHidden : t.createBody, confirm: t.create }))) return;
    await save(target, members, true);
    setPick('');
  };
  const add = async (s: string) => { const l = find(s); if (!l || !pick) return; await save(s, [...l.members.map((m) => m.subject), pick], false); setPick(''); };
  const removeMember = async (s: string, subject: string) => { const l = find(s); if (l) await save(s, l.members.map((m) => m.subject).filter((x) => x !== subject), false); };
  const removeList = async (s: string) => {
    if (!(await confirm.ask({ title: t.deleteTitle(label(s)), body: t.deleteBody, confirm: fr.confirm.delete }))) return;
    try { await api('DELETE', `/v1/projects/${project}/access-lists${s ? `?tracker=${s}` : ''}`); toast('success', t.deleted); load(); } catch (error) { fail(error); }
  };

  return (
    <section className="ath-stack" aria-labelledby="access-title">
      {confirm.dialog}
      <h2 id="access-title" className="ath-section-title">{t.title}</h2>
      <p className="ath-eyebrow">{t.help}</p>
      {lists === null ? <p role="status">{fr.loading}</p> : lists.length === 0 ? <EmptyState eyebrow={t.title} title={t.empty} /> : lists.map((l) => (
        <div key={l.tracker ?? ''} className="ath-card ath-stack" role="group" aria-label={t.listOf(label(l.tracker ?? ''))}>
          <h3 className="ath-subsection-title">{label(l.tracker ?? '')} <Tag variant="ghost">{t.restricted}</Tag></h3>
          <Table>
            <caption className="ath-table__caption">{t.listOf(label(l.tracker ?? ''))}</caption>
            <thead><tr><Th>{fr.org.displayName}</Th><Th>{fr.org.username}</Th><Th>{t.remove}</Th></tr></thead>
            <tbody>
              {l.members.map((m) => (
                <tr key={m.subject}><Td>{m.displayName}</Td><Td mono>{m.username}</Td>
                  <Td><Btn icon="trash" size="sm" variant="ghost" disabled={l.members.length === 1} title={l.members.length === 1 ? t.lastMember : undefined} aria-label={`${t.remove} ${m.username}`} onClick={() => void removeMember(l.tracker ?? '', m.subject)}>{t.remove}</Btn></Td></tr>
              ))}
            </tbody>
          </Table>
          <div className="ath-toolbar">
            <div className="ath-field">
              <label className="ath-field__label" htmlFor={`al-add-${l.tracker ?? 'project'}`}>{t.addMember}</label>
              <select id={`al-add-${l.tracker ?? 'project'}`} className="ath-select" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="" />{users.filter((u) => !l.members.some((m) => m.subject === u.subject)).map((u) => <option key={u.subject} value={u.subject}>{u.displayName} ({u.username})</option>)}
              </select>
            </div>
            <Btn disabled={!pick} onClick={() => void add(l.tracker ?? '')}>{t.add}</Btn>
            <Btn variant="danger" onClick={() => void removeList(l.tracker ?? '')}>{t.deleteList}</Btn>
          </div>
        </div>
      ))}
      {without.length > 0 && (
        <div className="ath-toolbar">
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="al-scope">{t.scope}</label>
            <select id="al-scope" className="ath-select" value={target} onChange={(e) => setScope(e.target.value)}>
              {without.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </div>
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="al-first">{t.firstMember}</label>
            <select id="al-first" className="ath-select" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="" />{users.map((u) => <option key={u.subject} value={u.subject}>{u.displayName} ({u.username})</option>)}
            </select>
          </div>
          <Btn icon="plus" onClick={() => void create()}>{t.create}</Btn>
        </div>
      )}
    </section>
  );
}
