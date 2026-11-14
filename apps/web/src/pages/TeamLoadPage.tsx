import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Btn, Card, EmptyState, Field, Id, PageHeader, Select, StatusPill, Table, Td, Th, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { useFailure } from '../hooks';
import { useConfirm } from '../components/ConfirmDialog';
import { fr } from '../i18n';

interface TeamRow { key: string; name: string; description: string; members: number; managers: string[] }
interface MemberLoad { subject: string; name: string; role: 'manager' | 'member'; open: number; late: number; remaining: number; byProject: Array<{ project: string; open: number }> }
interface TeamLoad { team: { key: string; name: string }; members: MemberLoad[]; totals: { open: number; late: number; remaining: number }; average: number }
interface UserRow { subject: string; username: string; displayName: string }

/** Niveau de charge d'une personne par rapport à la moyenne de l'équipe (au moins 1,5 fois la moyenne et 3 tickets : élevée). */
export const loadLevel = (open: number, average: number): 'high' | 'normal' | 'none' => (open === 0 ? 'none' : open >= 3 && open >= average * 1.5 ? 'high' : 'normal');

/**
 * Charge des équipes `/charge` (ADR-0008) : le manager voit les équipes qu'il dirige, le directeur et le chef de projet toutes ;
 * l'administrateur crée les équipes et en gère les membres.
 */
export function TeamLoadPage({ session }: { session: Session }) {
  const t = fr.steer;
  const admin = session.user?.roles.includes('athena-admin') ?? false;
  const [params, setParams] = useSearchParams();
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [load, setLoad] = useState<TeamLoad | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [draft, setDraft] = useState({ key: '', name: '' });
  const [pick, setPick] = useState('');
  const [role, setRole] = useState<'member' | 'manager'>('member');
  const toast = useToast();
  const confirm = useConfirm();
  const fail = useFailure();
  const selected = params.get('equipe') ?? teams?.[0]?.key ?? null;

  const loadTeams = useCallback(async () => {
    const list = await api<TeamRow[]>('GET', '/v1/teams');
    setTeams(Array.isArray(list) ? list : []);
  }, []);
  useEffect(() => { loadTeams().catch(fail); }, [loadTeams, fail]);
  useEffect(() => { if (admin) api<UserRow[]>('GET', '/v1/users').then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => setUsers([])); }, [admin]);
  const loadSelected = useCallback(async () => {
    if (!selected) { setLoad(null); return; }
    setLoad(await api<TeamLoad>('GET', `/v1/teams/${selected}/load`));
  }, [selected]);
  useEffect(() => { loadSelected().catch(fail); }, [loadSelected, fail]);

  const act = async (run: () => Promise<unknown>, message?: string) => {
    try { await run(); if (message) toast('success', message); await loadTeams(); await loadSelected(); } catch (error) { fail(error); }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => { await api('POST', '/v1/teams', { key: draft.key, name: draft.name }); setParams({ equipe: draft.key }); setDraft({ key: '', name: '' }); }, t.teamCreated);
  };

  const inTeam = new Set(load?.members.map((m) => m.subject));
  return (
    <>
      <PageHeader title={t.teamsTitle} sub={t.teamsSub} />
      {teams === null ? <p role="status">{fr.loading}</p> : (
        <div className="ath-stack">
          {teams.length === 0 ? <EmptyState eyebrow={t.team} title={admin ? t.noTeamAdmin : t.noTeam} /> : (
            <div className="ath-toolbar">
              <label className="ath-field__label" htmlFor="team-pick">{t.team}</label>
              <Select id="team-pick" value={selected ?? ''} onChange={(e) => setParams({ equipe: e.target.value })}>
                {teams.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
              </Select>
            </div>
          )}
          {load && (
            <Card title={load.team.name} meta={<Id>{load.team.key}</Id>}>
              {load.members.length === 0 ? <p>{t.empty}</p> : (
                <Table caption={t.average(load.average)}>
                  <thead><tr><Th>{t.person}</Th><Th>{t.open}</Th><Th>{t.late}</Th><Th>{t.remaining}</Th><Th>{t.projects}</Th><Th>{t.team}</Th>{admin && <Th>{t.remove}</Th>}</tr></thead>
                  <tbody>
                    {load.members.map((m) => {
                      const level = loadLevel(m.open, load.average);
                      return (
                        <tr key={m.subject}>
                          <Td>{m.name} {m.role === 'manager' && <StatusPill kind="info">{t.manager}</StatusPill>}</Td>
                          <Td mono>{m.open} <StatusPill kind={level === 'high' ? 'danger' : level === 'none' ? 'default' : 'success'}>{t.loadLevel[level]}</StatusPill></Td>
                          <Td mono>{m.late > 0 ? <StatusPill kind="warning">{m.late}</StatusPill> : 0}</Td>
                          <Td mono>{m.remaining}</Td>
                          <Td>{m.byProject.length === 0 ? '—' : m.byProject.map((p) => `${p.project} (${p.open})`).join(', ')}</Td>
                          <Td>{m.role === 'manager' ? t.manager : t.member}</Td>
                          {admin && <Td><Btn size="sm" variant="ghost" aria-label={t.removeNamed(m.name)} onClick={() => void act(() => api('DELETE', `/v1/teams/${load.team.key}/members/${m.subject}`))}> {/* sans confirmation : réversible (un membre se rajoute) */}{t.remove}</Btn></Td>}
                        </tr>
                      );
                    })}
                    <tr><Td>{t.total}</Td><Td mono>{load.totals.open}</Td><Td mono>{load.totals.late}</Td><Td mono>{load.totals.remaining}</Td><Td colSpan={admin ? 3 : 2}>{''}</Td></tr>
                  </tbody>
                </Table>
              )}
              {admin && (
                <form className="ath-toolbar" onSubmit={(e) => { e.preventDefault(); if (pick) void act(() => api('PUT', `/v1/teams/${load.team.key}/members/${pick}`, { role }), t.saved); }}>
                  <label className="ath-field__label" htmlFor="member-pick">{t.memberPick}</label>
                  <Select id="member-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">{t.pick}</option>
                    {users.filter((u) => !inTeam.has(u.subject)).map((u) => <option key={u.subject} value={u.subject}>{u.displayName || u.username}</option>)}
                  </Select>
                  <Select aria-label={t.team} value={role} onChange={(e) => setRole(e.target.value as 'member' | 'manager')}>
                    <option value="member">{t.member}</option><option value="manager">{t.manager}</option>
                  </Select>
                  <Btn size="sm" type="submit" disabled={!pick}>{t.addMember}</Btn>
                  <Btn size="sm" variant="danger" type="button" onClick={() => void (async () => {
                    if (!(await confirm.ask({ title: t.deleteTeamTitle(load.team.name), body: t.deleteTeamBody, confirm: fr.confirm.delete }))) return;
                    await act(async () => { await api('DELETE', `/v1/teams/${load.team.key}`); setParams({}); }, t.teamDeleted);
                  })()}>{t.deleteTeam}</Btn>
                </form>
              )}
            </Card>
          )}
          {admin && (
            <Card title={t.newTeam}>
              <form className="ath-toolbar" onSubmit={create}>
                <Field label={t.teamKey} mono value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase() })} pattern="[a-z0-9][a-z0-9\-]{1,29}" required />
                <Field label={t.teamName} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
                <Btn size="sm" type="submit">{t.create}</Btn>
              </form>
            </Card>
          )}
        </div>
      )}
      {confirm.dialog}
    </>
  );
}
