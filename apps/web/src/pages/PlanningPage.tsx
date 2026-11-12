import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader, Select, Switch, TabLinks, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { ScheduleGantt, type GanttEdit } from '../components/ScheduleGantt';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import type { BaselineChoice, CalendarData, ScheduleData } from '../lib/schedule';
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
      {view === 'gantt' ? <GanttView project={project} canEdit={(session.user?.roles ?? []).some((r) => r === 'athena-admin' || r === 'athena-pm')} /> : <RoadmapPage session={session} bare />}
    </>
  );
}

function GanttView({ project, canEdit }: { project: string; canEdit: boolean }) {
  const fail = useFailure();
  const toast = useToast();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [announce, setAnnounce] = useState('');
  const [baselines, setBaselines] = useState<BaselineChoice[]>([]);
  const [params, setParams] = useSearchParams();
  const critical = params.get('critique') === '1';
  const baselineName = params.get('baseline') ?? '';
  const base = `/v1/projects/${project}`;
  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next, { replace: true });
  };
  useEffect(() => { api<BaselineChoice[]>('GET', `${base}/schedule/baselines`).then(setBaselines).catch(() => setBaselines([])); }, [base]);
  const load = useCallback(async () => {
    const query = baselineName ? `?baseline=${encodeURIComponent(baselineName)}` : '';
    const [schedule, cal] = await Promise.all([api<ScheduleData>('GET', `${base}/schedule${query}`), api<CalendarData>('GET', '/v1/calendar').catch(() => null)]);
    setData(schedule);
    setCalendar(cal);
  }, [base, baselineName]);
  useEffect(() => { load().catch(fail); }, [load, fail]);

  /** Une action d'édition : l'API replanifie les successeurs ; on annonce le nombre de tickets déplacés et on recharge. */
  const edit = useMemo<GanttEdit | undefined>(() => {
    if (!canEdit) return undefined;
    const run = async (action: () => Promise<string>) => {
      try {
        const message = await action();
        setAnnounce(message);
        toast('success', message);
      } catch (error) { fail(error); }
      await load().catch(fail);
    };
    return {
      onChange: (key, change) => void run(async () => t.edit.moved((await api<{ moved: number }>('PATCH', `${base}/schedule/tasks/${key}`, change)).moved)),
      onLink: (from, to, lag) => void run(async () => {
        await api('POST', `${base}/artifacts/${from}/links`, { to, type: 'precedes', ...(lag !== 0 ? { lagDays: lag } : {}) });
        const pushed = (await api<{ moved: number }>('POST', `${base}/schedule/apply`)).moved;
        return `${t.edit.linked} ${t.edit.moved(pushed)}`;
      }),
      onUnlink: (id) => void run(async () => { await api('DELETE', `${base}/links/${id}`); return t.edit.unlinked; }),
    };
  }, [canEdit, base, load, fail, toast]);
  if (data === null) return <p role="status">{fr.loading}</p>;
  if (!data.tasks.some((x) => x.scheduled)) return <EmptyState eyebrow={t.title} title={t.empty} action={<span>{t.emptyHelp}</span>} />;
  return (
    <div className="ath-stack">
      <p className="ath-pageheader__sub">{t.legend}{canEdit ? '' : ` ${t.edit.readOnly}`}</p>
      <div className="ath-toolbar">
        <label className="ath-row">
          <Switch checked={critical} onChange={(e) => setParam('critique', e.target.checked ? '1' : null)} />
          {t.critical.label}
        </label>
        <label className="ath-row">
          <span className="ath-field__label">{t.baseline.label}</span>
          <Select value={baselineName} onChange={(e) => setParam('baseline', e.target.value || null)} disabled={baselines.length === 0 && !baselineName} title={baselines.length === 0 ? t.baseline.none2 : undefined}>
            <option value="">{t.baseline.none}</option>
            {baselines.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
          </Select>
        </label>
      </div>
      {critical && <p className="ath-pageheader__sub">{t.critical.help}</p>}
      {data.baseline && <p className="ath-pageheader__sub">{t.baseline.note(data.baseline.name)}</p>}
      <p role="status" className="ath-visually-hidden">{announce}</p>
      <ScheduleGantt project={project} data={data} calendar={calendar} critical={critical} {...(edit ? { edit } : {})} />
    </div>
  );
}
