import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader, TabLinks } from '@athena/ui';
import { api, type Session } from '../api';
import { ScheduleGantt } from '../components/ScheduleGantt';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import type { CalendarData, ScheduleData } from '../lib/schedule';
import { RoadmapPage } from './RoadmapPage';

const t = fr.planning;
const VIEWS = ['gantt', 'versions'] as const;
type View = (typeof VIEWS)[number];

/**
 * Planning `/p/:projet/planning` (ADR-0006, T-0162) : remplace la Roadmap. Vues sur le même projet : Gantt (lecture) et Versions
 * (l'ancienne Roadmap) ; Board et Liste suivent (T-0165). La vue est dans l'adresse (`?vue=`) : Précédent et les liens la gardent.
 */
export function PlanningPage({ session }: { session: Session }) {
  const { project = '' } = useParams();
  const [params] = useSearchParams();
  const requested = params.get('vue');
  const view: View = VIEWS.find((v) => v === requested) ?? 'gantt';
  const tabs = (
    <TabLinks label={t.views} items={VIEWS.map((v) => ({ id: v, label: t[v], current: v === view }))}
      link={(item, props) => <Link to={`/p/${project}/planning${item.id === 'gantt' ? '' : `?vue=${item.id}`}`} {...props} />} />
  );
  return (
    <>
      <PageHeader title={t.title} />
      {tabs}
      {view === 'gantt' ? <GanttView project={project} /> : <RoadmapPage session={session} bare />}
    </>
  );
}

function GanttView({ project }: { project: string }) {
  const fail = useFailure();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([api<ScheduleData>('GET', `/v1/projects/${project}/schedule`), api<CalendarData>('GET', '/v1/calendar').catch(() => null)])
      .then(([schedule, cal]) => { if (live) { setData(schedule); setCalendar(cal); } })
      .catch(fail);
    return () => { live = false; };
  }, [project, fail]);
  if (data === null) return <p role="status">{fr.loading}</p>;
  if (!data.tasks.some((x) => x.scheduled)) return <EmptyState eyebrow={t.title} title={t.empty} action={<span>{t.emptyHelp}</span>} />;
  return (
    <div className="ath-stack">
      <p className="ath-pageheader__sub">{t.legend}</p>
      <ScheduleGantt project={project} data={data} calendar={calendar} />
    </div>
  );
}
