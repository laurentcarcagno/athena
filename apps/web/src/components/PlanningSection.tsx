import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Field as FieldInput, Id, useToast } from '@athena/ui';
import { api, type Artifact, type Field, type TrackerDefinition } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';
import type { ScheduleData, ScheduleTask } from '../lib/schedule';
import { FieldEditor } from '../pages/ArtifactPage';
import type { ItemLink } from './ItemHeader';

const t = fr.planning.section;

/** Champ porteur d'un rôle de planification dans le tracker, s'il existe. */
export const planningField = (def: TrackerDefinition, role: string): Field | undefined => def.fields.find((f) => f.semanticRole === role);

/** Vrai si le tracker porte les rôles de planification (un début et une échéance) : la fiche montre alors la section Planification. */
export const hasPlanning = (def: TrackerDefinition): boolean => Boolean(planningField(def, 'start_date') && planningField(def, 'due_date'));

/**
 * Section Planification de la fiche et du panneau de détail (ADR-0006, T-0165) : début, fin, durée, marge, prédécesseurs et
 * successeurs, avancement et reste à faire. Le chef de projet change le début et la durée (replanification des successeurs) ;
 * chacun change l'avancement et le reste à faire des tickets qui lui sont assignés. Une tâche parente est en lecture (D3).
 */
export function PlanningSection({ project, def, artifact, links, roles, me, manager, onSave, onChanged }: {
  project: string; def: TrackerDefinition; artifact: Artifact; links: ItemLink[]; roles: readonly string[]; me: string; manager: boolean;
  onSave: (field: Field, raw: string) => void; onChanged: () => void;
}) {
  const fail = useFailure();
  const toast = useToast();
  const [task, setTask] = useState<ScheduleTask | null>(null);
  useEffect(() => {
    let live = true;
    api<ScheduleData>('GET', `/v1/projects/${project}/schedule`).then((s) => { if (live) setTask(s.tasks.find((x) => x.key === artifact.key) ?? null); }).catch(() => { if (live) setTask(null); });
    return () => { live = false; };
  }, [project, artifact.key, artifact.version]);

  const assigneeField = planningField(def, 'assignee');
  const mine = assigneeField ? artifact.values[assigneeField.key] === me && me !== '' : false;
  const progress = planningField(def, 'progress');
  const remaining = planningField(def, 'remaining');
  const ordered = links.filter((l) => l.ordered === true && l.other);
  const before = ordered.filter((l) => l.direction === 'inward');
  const after = ordered.filter((l) => l.direction === 'outward');
  const parent = task?.summary ?? false;

  const change = async (body: { start?: string; duration?: number }) => {
    try {
      const r = await api<{ moved: number }>('PATCH', `/v1/projects/${project}/schedule/tasks/${artifact.key}`, body);
      toast('success', fr.planning.edit.moved(r.moved));
      onChanged();
    } catch (error) { fail(error); }
  };
  const day = (iso: string | null | undefined) => (iso ? <time dateTime={iso}>{formatDay(iso, true)}</time> : fr.planning.none);
  const list = (items: ItemLink[]) => (items.length === 0 ? t.none : (
    <ul className="ath-row">
      {items.map((l) => (
        <li key={l.id}><Link className="ath-link ath-mono" to={`/p/${project}/a/${l.other}`}>{l.other}</Link>{(l.lagDays ?? 0) !== 0 ? t.lag(l.lagDays!) : ''}</li>
      ))}
    </ul>
  ));
  const editor = (field: Field | undefined) => {
    if (!field) return fr.planning.none;
    return manager || mine
      ? <FieldEditor field={field} value={artifact.values[field.key]} roles={roles} onCommit={(raw) => onSave(field, raw)} />
      : <span>{artifact.values[field.key] === undefined || artifact.values[field.key] === null ? fr.planning.none : String(artifact.values[field.key])}</span>;
  };

  return (
    <Card title={t.title} meta={<Link className="ath-link" to={`/p/${project}/planning`}>{t.open}</Link>}>
      <dl className="ath-stack ath-planning-section" aria-label={t.title}>
        <div><dt>{t.start}</dt><dd>{manager && task && !task.milestone && !parent
          ? <FieldInput label={t.start} type="date" mono defaultValue={task.plannedStart ?? ''} key={task.plannedStart ?? 'none'} onBlur={(e) => { if (e.target.value && e.target.value !== task.plannedStart) void change({ start: e.target.value }); }} />
          : day(task?.milestone ? null : task?.plannedStart)}</dd></div>
        <div><dt>{t.end}</dt><dd>{day(task?.plannedEnd)}</dd></div>
        <div><dt>{t.duration}</dt><dd>{manager && task && !task.milestone && !parent
          ? <FieldInput label={t.duration} type="number" min={1} max={2000} mono defaultValue={task.duration} key={task.duration} onBlur={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n !== task.duration) void change({ duration: n }); }} />
          : task ? (task.milestone ? fr.planning.milestone : fr.planning.days(task.duration)) : fr.planning.none}</dd></div>
        <div><dt>{t.slack}</dt><dd>{task?.slack === null || task?.slack === undefined ? fr.planning.none : <>{fr.planning.days(task.slack)}{task.critical && <> <Id>{fr.planning.critical.tag}</Id></>}</>}</dd></div>
        <div><dt>{t.predecessors}</dt><dd>{list(before)}</dd></div>
        <div><dt>{t.successors}</dt><dd>{list(after)}</dd></div>
        <div><dt>{t.progress}</dt><dd>{parent ? (task?.progress ?? fr.planning.none) : editor(progress)}</dd></div>
        <div><dt>{t.remaining}</dt><dd>{parent ? (task?.remaining ?? fr.planning.none) : editor(remaining)}</dd></div>
      </dl>
      {parent && <p className="ath-pageheader__sub">{t.parent}</p>}
      {!manager && <p className="ath-pageheader__sub">{t.onlyMine}</p>}
    </Card>
  );
}
