import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, PageHeader, StatusPill } from '@athena/ui';
import { api, type Hit, type SearchResult, type Session, type TrackerOverview } from '../../api';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';
import { ProjectTemplateCard } from '../../components/ProjectTemplateCard';
import { DashboardPage } from '../DashboardPage';
import { pillKind } from '../ListPage';
import { trackerHref } from './TrackersTab';

const titleOf = (hit: Hit) => String(hit.values['title'] ?? hit.values['name'] ?? '');

/** Vue d'ensemble : jamais vide (les trackers y figurent toujours), chaque bloc renvoie à la vue qui le détaille. */
export function OverviewTab({ session }: { session: Session }) {
  const { project } = useParams();
  const fail = useFailure();
  const [trackers, setTrackers] = useState<TrackerOverview[] | null>(null);
  const [mine, setMine] = useState<Hit[] | null>(null);
  useEffect(() => {
    api<{ trackers: TrackerOverview[] }>('GET', `/v1/projects/${project}/overview`).then((r) => setTrackers(r.trackers)).catch(fail);
    api<SearchResult>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent('assignee = currentUser()')}&limit=50`)
      .then((r) => setMine(r.hits.filter((h) => h.category !== 'done')))
      .catch(() => setMine([]));
  }, [project, fail]);
  const mineQuery = `/p/${project}/recherche?q=${encodeURIComponent('assignee = currentUser()')}`;
  return (
    <>
      <PageHeader eyebrow={fr.overview.eyebrow} title={`${fr.overview.title} · ${project}`} />
      <div className="ath-layout-grid">
        <div className="ath-span-2">
          <Card title={fr.overview.mine} meta={mine ? String(mine.length) : undefined}>
            <div className="ath-stack">
              {mine === null ? <p role="status">{fr.loading}</p> : mine.length === 0 ? <p>{fr.overview.noMine}</p> : (
                <ul className="ath-stack">
                  {mine.slice(0, 5).map((h) => (
                    <li key={h.key} className="ath-row">
                      <Link className="ath-link ath-mono" to={`/p/${project}/a/${h.key}`}>{h.key}</Link>
                      <span className="ath-clip" title={titleOf(h)}>{titleOf(h)}</span>
                      <StatusPill kind={pillKind(h.category)}>{h.statusName ?? h.status}</StatusPill>
                    </li>
                  ))}
                </ul>
              )}
              <Link className="ath-link" to={mineQuery}>{fr.overview.allMine}</Link>
            </div>
          </Card>
        </div>
        <div className="ath-span-1">
          <Card title={fr.overview.trackersTitle} meta={trackers ? String(trackers.length) : undefined}>
            <div className="ath-stack">
              {trackers === null ? <p role="status">{fr.loading}</p> : (
                <ul className="ath-stack">
                  {trackers.map((t) => (
                    <li key={t.key} className="ath-row">
                      <Link className="ath-link ath-mono" to={trackerHref(String(project), t.key)}>{t.key}</Link>
                      <span className="ath-mono">{t.statuses.filter((s) => s.category !== 'done').reduce((n, s) => n + s.count, 0)} {fr.overview.open} / {t.artifacts}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link className="ath-link" to={`/p/${project}/trackers`}>{fr.overview.openTrackers}</Link>
            </div>
          </Card>
        </div>
      </div>
      <ProjectTemplateCard project={String(project)} canManage={(session.user?.roles ?? []).some((r) => r === 'athena-admin' || r === 'athena-pm')} />
      <DashboardPage embedded />
    </>
  );
}
