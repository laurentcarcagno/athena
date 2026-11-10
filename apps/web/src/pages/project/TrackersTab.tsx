import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, EmptyState, PageHeader, Tag } from '@athena/ui';
import { api, type TrackerOverview } from '../../api';
import { categoryLabel } from '../../components/TrackerTypesTab';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';
import { DateTime } from '../../lib/dates';

export const CATEGORY_ORDER = ['engineering', 'development', 'verification', 'management', 'other'] as const;

/** Adresse d'un tracker : sa vue Tableau (écran Tracker). */
export const trackerHref = (project: string, tracker: string) => `/p/${project}/t/${tracker}/tableau`;

/** Regroupe les trackers par catégorie dans l'ordre fixe ; une catégorie vide n'apparaît pas. */
export function groupByCategory(trackers: TrackerOverview[]): Array<{ category: string; trackers: TrackerOverview[] }> {
  return CATEGORY_ORDER.map((category) => ({ category, trackers: trackers.filter((t) => (CATEGORY_ORDER as readonly string[]).includes(t.category) ? t.category === category : category === 'other') }))
    .filter((g) => g.trackers.length > 0);
}

/**
 * Barre empilée : un segment par catégorie de statut, largeur proportionnelle ; le texte alternatif donne les chiffres.
 * Dessinée en SVG (attributs de présentation) car la CSP de production interdit les attributs `style` en ligne.
 */
export function StatusBar({ tracker }: { tracker: TrackerOverview }) {
  const total = tracker.statuses.reduce((n, s) => n + s.count, 0);
  const byCategory = ['todo', 'in_progress', 'done'].map((category) => ({
    category,
    count: tracker.statuses.filter((s) => s.category === category).reduce((n, s) => n + s.count, 0),
  }));
  const label = tracker.statuses.map((s) => `${s.name} ${s.count}`).join(', ');
  let x = 0;
  return (
    <svg className="ath-stackbar" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label={`${fr.trackersTab.statusSummary} : ${label}`}>
      {total > 0 && byCategory.filter((c) => c.count > 0).map((c) => {
        const width = (c.count / total) * 100;
        const rect = <rect key={c.category} className={`ath-stackbar__seg--${c.category}`} x={x} y={0} width={width} height={8} />;
        x += width;
        return rect;
      })}
    </svg>
  );
}

export function TrackerCard({ project, tracker }: { project: string; tracker: TrackerOverview }) {
  return (
    <Card title={tracker.name} meta={tracker.key}>
      <div className="ath-trackercard">
        <StatusBar tracker={tracker} />
        <ul className="ath-taglist" aria-label={fr.trackersTab.statusSummary}>
          {tracker.statuses.map((s) => <li key={s.key}><Tag>{s.name} <span className="ath-mono">{s.count}</span></Tag></li>)}
        </ul>
        <div className="ath-row">
          <span className="ath-mono">{fr.trackersTab.items(tracker.artifacts)}</span>
          {tracker.mine > 0 && <span className="ath-mono">{fr.trackersTab.mine(tracker.mine)}</span>}
          <span className="ath-eyebrow">{fr.trackersTab.lastActivity} : {tracker.lastActivity ? <span className="ath-mono"><DateTime iso={tracker.lastActivity} date /></span> : fr.trackersTab.never}</span>
        </div>
        <Link className="ath-link" to={trackerHref(project, tracker.key)} aria-label={`${fr.trackersTab.openTracker} ${tracker.name}`}>{fr.trackersTab.openTracker}</Link>
      </div>
    </Card>
  );
}

/** Onglet Trackers : tous les trackers du projet, groupés par catégorie, avec compteurs par état. */
export function TrackersTab() {
  const { project } = useParams();
  const fail = useFailure();
  const [trackers, setTrackers] = useState<TrackerOverview[] | null>(null);
  useEffect(() => {
    api<{ trackers: TrackerOverview[] }>('GET', `/v1/projects/${project}/overview`).then((r) => setTrackers(r.trackers)).catch(fail);
  }, [project, fail]);
  return (
    <>
      <PageHeader eyebrow={fr.overview.eyebrow} title={`${fr.trackersTab.title} · ${project}`} />
      {trackers === null ? <p role="status">{fr.loading}</p> : trackers.length === 0 ? (
        <EmptyState eyebrow={fr.trackersTab.title} title={fr.trackersTab.empty} />
      ) : (
        <div className="ath-stack">
          {groupByCategory(trackers).map((g) => (
            <section key={g.category} aria-label={categoryLabel(g.category)} className="ath-stack">
              <h2 className="ath-section-title">{categoryLabel(g.category)}</h2>
              <div className="ath-layout-grid">
                {g.trackers.map((t) => <div key={t.key} className="ath-span-1"><TrackerCard project={String(project)} tracker={t} /></div>)}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
