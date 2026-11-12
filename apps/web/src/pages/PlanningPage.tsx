import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Select, Switch, TabLinks, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { PlanningBoard, PlanningList } from '../components/PlanningViews';
import { ScheduleGantt, type GanttEdit } from '../components/ScheduleGantt';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { PLANNING_FILTERS, filterSchedule, type BaselineChoice, type CalendarData, type PlanningFilter, type ScheduleData } from '../lib/schedule';
import { RoadmapPage } from './RoadmapPage';

const t = fr.planning;
const VIEWS = ['gantt', 'board', 'list', 'versions'] as const;
type View = (typeof VIEWS)[number];

/**
 * Planning `/p/:projet/planning` (ADR-0006, T-0162, T-0165) : remplace la Roadmap. Quatre vues du même périmètre : Gantt, Board,
 * Liste et Versions (l'ancienne Roadmap). La vue (`?vue=`), la recherche (`?q=`), le critère (`?f=`), le chemin critique et la
 * baseline sont dans l'adresse : passer d'un onglet à l'autre les garde, Précédent aussi.
 */
export function PlanningPage({ session }: { session: Session }) {
  const { project = '' } = useParams();
  const [params] = useSearchParams();
  const requested = params.get('vue');
  const view: View = VIEWS.find((v) => v === requested) ?? 'gantt';
  const tabs = (
    <TabLinks label={t.views} items={VIEWS.map((v) => ({ id: v, label: t[v], current: v === view }))}
      link={(item, props) => {
        const next = new URLSearchParams(params);
        if (item.id === 'gantt') next.delete('vue'); else next.set('vue', item.id);
        if (item.id === 'versions') { next.delete('q'); next.delete('f'); }
        const query = next.toString();
        return <Link to={`/p/${project}/planning${query ? `?${query}` : ''}`} {...props} />;
      }} />
  );
  const roles = session.user?.roles ?? [];
  return (
    <>
      <PageHeader title={t.title} />
      {tabs}
      {view === 'versions' ? <RoadmapPage session={session} bare /> : <ScheduleViews project={project} view={view} canEdit={roles.some((r) => r === 'athena-admin' || r === 'athena-pm')} me={session.user?.id ?? session.user?.username ?? ''} />}
    </>
  );
}

function ScheduleViews({ project, view, canEdit, me }: { project: string; view: Exclude<View, 'versions'>; canEdit: boolean; me: string }) {
  const fail = useFailure();
  const toast = useToast();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [announce, setAnnounce] = useState('');
  const [baselines, setBaselines] = useState<BaselineChoice[]>([]);
  const [params, setParams] = useSearchParams();
  const critical = params.get('critique') === '1';
  const baselineName = params.get('baseline') ?? '';
  const q = params.get('q') ?? '';
  const asked = params.get('f') as PlanningFilter | null;
  const f: PlanningFilter = PLANNING_FILTERS.find((x) => x === asked) ?? 'all';
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
      onUnlink: (id) => void run(async () => { await api('DELETE', `${base}/links/${id}`); return t.edit.unlinked; }), // sans confirmation : un lien se recrée d'un geste (« Lier à… »)
    };
  }, [canEdit, base, load, fail, toast]);

  if (data === null) return <p role="status">{fr.loading}</p>;
  if (!data.tasks.some((x) => x.scheduled)) return <EmptyState eyebrow={t.title} title={t.empty} action={<span>{t.emptyHelp}</span>} />;
  const today = new Date().toISOString().split('T')[0]!;
  const shown = filterSchedule(data, { q, f, me, today });
  const filtered = q !== '' || f !== 'all';
  return (
    <div className="ath-stack">
      {view === 'gantt' && <p className="ath-pageheader__sub">{t.legend}{canEdit ? '' : ` ${t.edit.readOnly}`}</p>}
      <div className="ath-toolbar" role="search" aria-label={t.filters.label}>
        <label className="ath-row">
          <span className="ath-field__label">{t.filters.search}</span>
          <input className="ath-input" type="search" value={q} onChange={(e) => setParam('q', e.target.value || null)} />
        </label>
        <label className="ath-row">
          <span className="ath-field__label">{t.filters.show}</span>
          <Select value={f} onChange={(e) => setParam('f', e.target.value === 'all' ? null : e.target.value)}>
            {PLANNING_FILTERS.map((x) => <option key={x} value={x}>{t.filters[x]}</option>)}
          </Select>
        </label>
        {filtered && <Btn variant="ghost" size="sm" onClick={() => { const next = new URLSearchParams(params); next.delete('q'); next.delete('f'); setParams(next, { replace: true }); }}>{t.filters.reset}</Btn>}
        {view === 'gantt' && (
          <>
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
          </>
        )}
      </div>
      {view === 'gantt' && critical && <p className="ath-pageheader__sub">{t.critical.help}</p>}
      {view === 'gantt' && data.baseline && <p className="ath-pageheader__sub">{t.baseline.note(data.baseline.name)}</p>}
      <p role="status" className="ath-visually-hidden">{announce}</p>
      {shown.tasks.length === 0 ? <EmptyState eyebrow={t.title} title={t.noMatch} /> : (
        view === 'gantt' ? <ScheduleGantt project={project} data={shown} calendar={calendar} critical={critical} {...(edit ? { edit } : {})} />
          : view === 'board' ? <PlanningBoard project={project} data={shown} />
            : <PlanningList project={project} data={shown} />
      )}
    </div>
  );
}
