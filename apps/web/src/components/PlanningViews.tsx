import { Link, useLocation } from 'react-router-dom';
import { EmptyState, Id, StatusPill } from '@athena/ui';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';
import { fromHere } from '../lib/origin';
import { wbsOrder, type ScheduleData, type ScheduleTask } from '../lib/schedule';

const t = fr.planning;
const CATEGORIES = ['todo', 'in_progress', 'done'] as const;

const day = (iso: string | null) => (iso ? <time dateTime={iso}>{formatDay(iso)}</time> : t.none);

/** Teinte de pastille d'un statut selon sa catégorie. */
const kind = (category: string) => (category === 'done' ? 'success' : category === 'in_progress' ? 'info' : 'default');

/**
 * Board du planning : les tâches du périmètre filtré en colonnes par catégorie de statut (à faire, en cours, terminé). Lecture
 * seule : un changement de statut passe par la fiche ou par le Board du projet.
 */
export function PlanningBoard({ project, data }: { project: string; data: ScheduleData }) {
  const location = useLocation();
  const tasks = data.tasks.filter((x) => x.scheduled && !x.summary);
  const keys = tasks.map((x) => x.key);
  if (tasks.length === 0) return <EmptyState eyebrow={t.board} title={t.noMatch} />;
  return (
    <div className="ath-board" aria-label={t.board}>
      {CATEGORIES.map((category) => {
        const cards = tasks.filter((x) => x.status.category === category);
        return (
          <section key={category} className="ath-column" aria-label={t.categories[category]}>
            <h2 className="ath-section-title">{t.categories[category]} <Id>{String(cards.length)}</Id></h2>
            <ul className="ath-stack">
              {cards.map((card: ScheduleTask) => (
                <li key={card.key} className="ath-card"><div className="ath-stack">
                  <Link className="ath-link ath-mono" to={`/p/${project}/a/${card.key}`} state={fromHere(location, t.title, keys)}>{card.key}</Link>
                  <p>{card.title === card.key ? '' : card.title}</p>
                  <p className="ath-row">
                    <StatusPill kind={kind(card.status.category)}>{card.status.name}</StatusPill>
                    <span>{card.milestone ? day(card.plannedEnd) : <>{day(card.plannedStart)} → {day(card.plannedEnd)}</>}</span>
                    {card.progress !== null && <Id>{`${card.progress} %`}</Id>}
                    {card.critical && <StatusPill kind="danger">{t.critical.tag}</StatusPill>}
                  </p>
                </div></li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Liste du planning : un tableau avec début, fin, durée, marge, avancement et reste à faire, dans l'ordre de la hiérarchie. */
export function PlanningList({ project, data }: { project: string; data: ScheduleData }) {
  const location = useLocation();
  const rows = wbsOrder(data.tasks);
  const keys = rows.map((r) => r.task.key);
  if (rows.length === 0) return <EmptyState eyebrow={t.list} title={t.noMatch} />;
  return (
    <div className="ath-table-wrap">
      <table className="ath-table">
        <caption className="ath-visually-hidden">{t.listCaption}</caption>
        <thead>
          <tr>
            <th className="ath-th" scope="col">{t.key}</th><th className="ath-th" scope="col">{t.titleCol}</th><th className="ath-th" scope="col">{t.listCols.status}</th>
            <th className="ath-th" scope="col">{t.start}</th><th className="ath-th" scope="col">{t.end}</th><th className="ath-th" scope="col">{t.duration}</th>
            <th className="ath-th" scope="col">{t.listCols.slack}</th><th className="ath-th" scope="col">{t.progressCol}</th><th className="ath-th" scope="col">{t.listCols.remaining}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ task, depth }) => (
            <tr key={task.key}>
              <td className="ath-td"><Link className="ath-link ath-mono" to={`/p/${project}/a/${task.key}`} state={fromHere(location, t.title, keys)}>{task.key}</Link></td>
              <td className={`ath-td ath-gantt-indent-${Math.min(depth, 6)}`}>{task.title === task.key ? '' : task.title}</td>
              <td className="ath-td"><StatusPill kind={kind(task.status.category)}>{task.status.name}</StatusPill></td>
              <td className="ath-td">{task.milestone ? '' : day(task.plannedStart)}</td>
              <td className="ath-td">{day(task.plannedEnd)}</td>
              <td className="ath-td">{task.scheduled ? (task.milestone ? t.milestone : t.days(task.duration)) : t.none}</td>
              <td className="ath-td">{task.slack === null ? t.none : <>{t.days(task.slack)}{task.critical && <> <StatusPill kind="danger">{t.critical.tag}</StatusPill></>}</>}</td>
              <td className="ath-td">{task.progress !== null ? <Id>{`${task.progress} %`}</Id> : t.none}</td>
              <td className="ath-td">{task.remaining !== null ? t.days(task.remaining) : t.none}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
