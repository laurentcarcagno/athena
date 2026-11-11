import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Btn, Card, EmptyState, Id, PageHeader } from '@athena/ui';
import { api, type Session, type TrackerDefinition } from '../api';
import { PinToggle } from '../components/PinToggle';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface TrackerRow { key: string; name: string; artifacts: number; attributes: string[] }
interface ProjectEntry { key: string; name: string; trackers: TrackerRow[]; boards: Array<{ key: string; name: string }>; open: number | null }

/**
 * Projets `/projets` (ADR-0005 § 2.2, T-0152) : une carte par projet pour le reconnaître et l'ouvrir d'un coup d'œil :
 * trackers (attributs en info-bulle), tickets ouverts, boards, « Ouvrir » et favori.
 */
export function ProjectsPage({ session }: { session?: Session } = {}) {
  const navigate = useNavigate();
  const admin = session?.user?.roles.includes('athena-admin') ?? false;
  const [projects, setProjects] = useState<ProjectEntry[] | null>(null);
  const fail = useFailure();
  useEffect(() => {
    (async () => {
      const list = await api<Array<{ key: string; name: string }>>('GET', '/v1/projects');
      const entries = await Promise.all(list.map(async (p) => {
        const trackers = await api<Array<{ key: string; name: string; artifacts: number }>>('GET', `/v1/projects/${p.key}/trackers`);
        const rows = await Promise.all(trackers.map(async (t) => {
          const definition = await api<TrackerDefinition>('GET', `/v1/projects/${p.key}/trackers/${t.key}`).catch(() => null);
          return { key: t.key, name: t.name, artifacts: t.artifacts, attributes: (definition?.fields ?? []).map((f) => f.label) };
        }));
        const dashboard = await api<{ byCategory: { todo: number; in_progress: number } }>('GET', `/v1/projects/${p.key}/dashboard`).catch(() => null);
        const open = dashboard?.byCategory ? dashboard.byCategory.todo + dashboard.byCategory.in_progress : null;
        return { ...p, trackers: rows, boards: await api<ProjectEntry['boards']>('GET', `/v1/projects/${p.key}/boards`), open };
      }));
      setProjects(entries);
    })().catch(fail);
  }, [fail]);

  return (
    <>
      <PageHeader title={fr.projects.title}
        actions={admin ? <Btn size="sm" onClick={() => navigate('/admin')}>{fr.projects.newProject}</Btn> : undefined} />
      {projects === null ? <p role="status">{fr.loading}</p> : projects.length === 0 ? (
        <EmptyState eyebrow={fr.projects.emptyEyebrow} title={fr.projects.empty} />
      ) : (
        <div className="ath-cards ath-cards--wide" role="list" aria-label={fr.projects.title}>
          {projects.map((p) => (
            <div key={p.key} role="listitem">
              <Card title={p.name} meta={<Id>{p.key}</Id>}>
                <div className="ath-stack">
                  <p>
                    {p.trackers.length === 0 ? fr.projects.noTracker : <>
                      {fr.projects.trackerCount(p.trackers.length)} :{' '}
                      {p.trackers.map((t, i) => (
                        <span key={t.key}>{i > 0 && ', '}<Link className="ath-link" to={`/p/${p.key}/t/${t.key}/tableau`}
                          title={t.attributes.length ? `${fr.projects.attributes} : ${t.attributes.join(', ')}` : fr.projects.noAttribute}>{t.name}</Link> <span className="ath-mono">({t.artifacts})</span></span>
                      ))}
                    </>}
                    {p.open !== null && <> · <strong>{fr.projects.openTickets(p.open)}</strong></>}
                  </p>
                  {p.boards.length > 0 && (
                    <p>{fr.projects.boards} : {p.boards.map((b, i) => <span key={b.key}>{i > 0 && ', '}<Link className="ath-link" to={`/p/${p.key}/board/${b.key}`}>{b.name}</Link></span>)}</p>
                  )}
                  <div className="ath-row">
                    <Link className="ath-btn ath-btn--primary ath-btn--sm" to={`/p/${p.key}`} aria-label={fr.projects.openNamed(p.name)}>{fr.projects.open}</Link>
                    <PinToggle entry={{ kind: 'project', project: p.key, ref: p.key, label: p.key }} />
                    {admin && <Btn size="sm" variant="ghost" onClick={() => navigate(`/p/${p.key}/trackers/new`)}>{fr.builder.addTracker}</Btn>}
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
