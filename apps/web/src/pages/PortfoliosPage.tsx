import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Btn, Card, EmptyState, Field, Id, PageHeader, Select, StatusPill, Table, Td, Th, useToast, type PillKind } from '@athena/ui';
import { api, type Session } from '../api';
import { useFailure } from '../hooks';
import { useConfirm } from '../components/ConfirmDialog';
import { Dashboard } from '../components/Dashboard';
import { PortfolioHealthTable } from '../components/PortfolioHealthTable';
import { fr } from '../i18n';

type Health = 'ok' | 'attention' | 'critical';
interface PortfolioProject {
  key: string; name: string; health: Health; computedHealth: Health; overridden: boolean; reasons: string[]; note: string;
  progress: number; open: number; late: number; blocked: number; dueSoon: number; managers: string[]; members: number;
  sprint: { name: string; percent: number; daysLeft: number | null } | null;
}
interface Summary {
  portfolio: { key: string; name: string; description: string; owner: string | null; projects: number };
  projects: PortfolioProject[];
  totals: { projects: number; byHealth: Record<Health, number>; progress: number; open: number; late: number; blocked: number };
}

const KIND: Record<Health, PillKind> = { ok: 'success', attention: 'warning', critical: 'danger' };
const HEALTHS: Health[] = ['critical', 'attention', 'ok'];

/** Pastille de santé : texte et couleur (jamais la couleur seule). */
const HealthPill = ({ health }: { health: Health }) => <StatusPill kind={KIND[health]}>{fr.steer.health[health]}</StatusPill>;

/** Répartition des projets par santé d'un portefeuille. */
const Distribution = ({ totals }: { totals: Summary['totals'] }) => (
  <p>{HEALTHS.map((h) => <span key={h}><HealthPill health={h} /> <strong className="ath-mono">{totals.byHealth[h]}</strong>{' '}</span>)}</p>
);

/**
 * Portefeuilles `/portefeuilles` et `/portefeuilles/:clé` (ADR-0008) : le directeur lit la santé, l'avancement et les retards de
 * chaque portefeuille ; l'administrateur les crée et y rattache des projets ; le chef de projet force la santé et annote.
 */
export function PortfoliosPage({ session }: { session: Session }) {
  const { key } = useParams();
  const t = fr.steer;
  const roles = session.user?.roles ?? [];
  // Gestion des portefeuilles : administrateur et PMO ; rattachement, santé forcée et note : aussi le chef de projet.
  const admin = roles.includes('athena-admin') || roles.includes('athena-pmo');
  const editor = admin || roles.includes('athena-pm');
  const [list, setList] = useState<Summary[] | null>(null);
  const [one, setOne] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([]);
  const [draft, setDraft] = useState({ key: '', name: '' });
  const [pick, setPick] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const fail = useFailure();

  const reload = useCallback(async () => {
    if (key) { setOne(await api<Summary>('GET', `/v1/portfolios/${key}`)); return; }
    const all = await api<Summary[]>('GET', '/v1/portfolios/summary');
    setList(Array.isArray(all) ? all : []);
  }, [key]);
  useEffect(() => { setOne(null); setList(null); reload().catch(fail); }, [reload, fail]);
  useEffect(() => { if (editor) api<Array<{ key: string; name: string }>>('GET', '/v1/projects').then((p) => setProjects(Array.isArray(p) ? p : [])).catch(() => setProjects([])); }, [editor]);

  const act = async (run: () => Promise<unknown>, message?: string) => {
    try { await run(); if (message) toast('success', message); await reload(); } catch (error) { fail(error); }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => { await api('POST', '/v1/portfolios', { key: draft.key, name: draft.name }); setDraft({ key: '', name: '' }); }, t.portfolioCreated);
  };

  if (key) {
    if (!one) return <p role="status">{fr.loading}</p>;
    const attached = new Set(one.projects.map((p) => p.key));
    return (
      <>
        <PageHeader title={one.portfolio.name} actions={<Link className="ath-link" to="/portefeuilles">{t.back}</Link>}
          sub={[one.portfolio.description, one.portfolio.owner ? `${t.owner} : ${one.portfolio.owner}` : ''].filter(Boolean).join(' · ')} />
        <div className="ath-stack">
          <Card title={t.totals}>
            <Distribution totals={one.totals} />
            <p>{t.progress} : <strong className="ath-mono">{one.totals.progress} %</strong> · {t.open} : <strong className="ath-mono">{one.totals.open}</strong> · {t.late} : <strong className="ath-mono">{one.totals.late}</strong> · {t.blocked} : <strong className="ath-mono">{one.totals.blocked}</strong></p>
          </Card>
          {roles.some((r) => r === 'athena-admin' || r === 'athena-pmo' || r === 'athena-director') ? <Dashboard portfolio={one.portfolio.key} /> : <PortfolioHealthTable portfolio={one.portfolio.key} />}
          {one.projects.length === 0 ? <EmptyState eyebrow={t.project} title={t.noProject} /> : (
            <Table caption={t.projectsCount(one.projects.length)}>
              <thead><tr><Th>{t.project}</Th><Th>{t.healthCol}</Th><Th>{t.progress}</Th><Th>{t.late}</Th><Th>{t.blocked}</Th><Th>{t.dueSoon}</Th><Th>{t.sprint}</Th><Th>{t.managers}</Th><Th>{t.note}</Th>{editor && <Th>{t.saveRow}</Th>}</tr></thead>
              <tbody>
                {one.projects.map((p) => (
                  <ProjectRow key={p.key} p={p} editor={editor} onSave={(patch) => act(() => api('PUT', `/v1/portfolios/${one.portfolio.key}/projects/${p.key}`, patch), t.saved)}
                    onDetach={() => act(() => api('DELETE', `/v1/portfolios/${one.portfolio.key}/projects/${p.key}`) /* sans confirmation : réversible (le projet se rattache de nouveau) */)} />
                ))}
              </tbody>
            </Table>
          )}
          {editor && (
            <form className="ath-toolbar" onSubmit={(e) => { e.preventDefault(); if (pick) void act(async () => { await api('PUT', `/v1/portfolios/${one.portfolio.key}/projects/${pick}`, {}); setPick(''); }, t.saved); }}>
              <label className="ath-field__label" htmlFor="pf-project">{t.projectPick}</label>
              <Select id="pf-project" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{t.addProject}</option>
                {projects.filter((p) => !attached.has(p.key)).map((p) => <option key={p.key} value={p.key}>{p.key} · {p.name}</option>)}
              </Select>
              <Btn size="sm" type="submit" disabled={!pick}>{t.addProject}</Btn>
              {admin && <Btn size="sm" variant="danger" type="button" onClick={() => void (async () => {
                if (!(await confirm.ask({ title: t.deletePortfolioTitle(one.portfolio.name), body: t.deletePortfolioBody, confirm: fr.confirm.delete }))) return;
                await act(async () => { await api('DELETE', `/v1/portfolios/${one.portfolio.key}`); window.location.assign('/portefeuilles'); }, t.portfolioDeleted);
              })()}>{t.deletePortfolio}</Btn>}
            </form>
          )}
        </div>
        {confirm.dialog}
      </>
    );
  }

  const atRisk = (list ?? []).flatMap((s) => s.projects.filter((p) => p.health !== 'ok').map((p) => ({ ...p, portfolio: s.portfolio.key })));
  return (
    <>
      <PageHeader title={t.portfoliosTitle} sub={t.portfoliosSub} />
      {list === null ? <p role="status">{fr.loading}</p> : (
        <div className="ath-stack">
          {list.length === 0 ? <EmptyState eyebrow={t.portfoliosTitle} title={admin ? t.noPortfolioAdmin : t.noPortfolio} /> : (
            <div className="ath-cards ath-cards--wide" role="list" aria-label={t.portfoliosTitle}>
              {list.map((s) => (
                <div key={s.portfolio.key} role="listitem">
                  <Card title={s.portfolio.name} meta={<Id>{s.portfolio.key}</Id>}>
                    <div className="ath-stack">
                      {s.portfolio.description && <p>{s.portfolio.description}</p>}
                      <p>{t.projectsCount(s.totals.projects)}{s.portfolio.owner ? ` · ${t.owner} : ${s.portfolio.owner}` : ''}</p>
                      <Distribution totals={s.totals} />
                      <p>{t.progress} : <strong className="ath-mono">{s.totals.progress} %</strong> · {t.late} : <strong className="ath-mono">{s.totals.late}</strong> · {t.blocked} : <strong className="ath-mono">{s.totals.blocked}</strong></p>
                      <Link className="ath-link" to={`/portefeuilles/${s.portfolio.key}`} aria-label={t.openPortfolio(s.portfolio.name)}>{fr.projects.open}</Link>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          )}
          {list.length > 0 && (
            <Card title={t.projectsAtRisk}>
              {atRisk.length === 0 ? <p>{t.allHealthy}</p> : (
                <Table>
                  <thead><tr><Th>{t.project}</Th><Th>{t.portfoliosTitle}</Th><Th>{t.healthCol}</Th><Th>{t.late}</Th><Th>{t.blocked}</Th><Th>{t.progress}</Th></tr></thead>
                  <tbody>{atRisk.map((p) => (
                    <tr key={`${p.portfolio}-${p.key}`}><Td mono><Link className="ath-link" to={`/p/${p.key}`}>{p.key}</Link></Td><Td>{p.portfolio}</Td><Td><HealthPill health={p.health} /></Td><Td mono>{p.late}</Td><Td mono>{p.blocked}</Td><Td mono>{p.progress} %</Td></tr>
                  ))}</tbody>
                </Table>
              )}
            </Card>
          )}
          {admin && (
            <Card title={t.newPortfolio}>
              <form className="ath-toolbar" onSubmit={create}>
                <Field label={t.teamKey} mono value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase() })} pattern="[a-z0-9][a-z0-9\-]{1,29}" required />
                <Field label={t.teamName} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
                <Btn size="sm" type="submit">{t.create}</Btn>
              </form>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function ProjectRow({ p, editor, onSave, onDetach }: { p: PortfolioProject; editor: boolean; onSave: (patch: { health: Health | null; note: string }) => Promise<void>; onDetach: () => Promise<void> }) {
  const t = fr.steer;
  const [health, setHealth] = useState<Health | ''>(p.overridden ? p.health : '');
  const [note, setNote] = useState(p.note);
  return (
    <tr>
      <Td mono><Link className="ath-link" to={`/p/${p.key}`}>{p.key}</Link> <span>{p.name}</span></Td>
      <Td>
        {editor ? (
          <Select aria-label={t.healthLabel(p.key)} value={health} onChange={(e) => setHealth(e.target.value as Health | '')}>
            <option value="">{t.auto} ({t.health[p.computedHealth]})</option>
            {HEALTHS.map((h) => <option key={h} value={h}>{t.health[h]}</option>)}
          </Select>
        ) : <><HealthPill health={p.health} />{p.overridden && <> <small>({t.forced})</small></>}</>}
      </Td>
      <Td mono>{p.progress} %</Td><Td mono>{p.late}</Td><Td mono>{p.blocked}</Td><Td mono>{p.dueSoon}</Td>
      <Td>{p.sprint ? `${p.sprint.name} (${p.sprint.percent} %)` : '—'}</Td>
      <Td>{p.managers.length ? p.managers.join(', ') : '—'}</Td>
      <Td>{editor ? <input className="ath-input" aria-label={t.noteLabel(p.key)} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /> : p.note || '—'}</Td>
      {editor && <Td>
        <Btn size="sm" onClick={() => void onSave({ health: health === '' ? null : health, note })}>{t.saveRow}</Btn>{' '}
        <Btn size="sm" variant="ghost" aria-label={t.detach(p.key)} onClick={() => void onDetach()}>{t.remove}</Btn>
      </Td>}
    </tr>
  );
}
