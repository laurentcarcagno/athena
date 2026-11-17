import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Btn, PageHeader, StatusPill, type PillKind } from '@athena/ui';
import { api, type Hit, type SearchResult } from '../../api';
import { HealthPill, type Health } from '../../components/PortfolioHealthTable';
import type { PhaseEntry } from '../../components/PhaseTimeline';
import type { ProjectMetaData } from '../../components/ProjectInfoCard';
import type { StatusNoteData } from '../../components/ProjectStatusCard';
import { fr } from '../../i18n';
import { formatDay } from '../../lib/dates';

interface Kpis { project: { name: string; managers: string[] }; progress: { percent: number }; late: number; blocked: number; open: number; dueSoon: number; health: { state: Health } }
interface Lifecycle { state: { name: string } }
interface TemplateStatus { phase: string | null; phases?: PhaseEntry[] }

const LEVEL_KIND: Record<string, PillKind> = { ok: 'success', attention: 'warning', critical: 'danger' };
const settle = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

/**
 * Fiche projet d'une page (lot 18, B23) : météo, santé, phase, revues, risques principaux. Aucune dépendance serveur pour l'impression :
 * la page se compose des lectures habituelles et s'imprime par le navigateur sur une page A4 (feuille d'impression `.ath-sheet`).
 */
export function ProjectSheetPage() {
  const { project = '' } = useParams();
  const t = fr.sheet;
  const [d, setD] = useState<{ kpis: Kpis | null; meta: ProjectMetaData | null; notes: StatusNoteData[]; life: Lifecycle | null; tpl: TemplateStatus | null; risks: Hit[] } | null>(null);
  useEffect(() => {
    void Promise.all([
      settle(api<Kpis>('GET', `/v1/projects/${project}/kpis`)), settle(api<ProjectMetaData>('GET', `/v1/projects/${project}/meta`)),
      settle(api<StatusNoteData[]>('GET', `/v1/projects/${project}/status-notes?limit=1`)), settle(api<Lifecycle>('GET', `/v1/projects/${project}/lifecycle`)),
      settle(api<TemplateStatus>('GET', `/v1/projects/${project}/template`)), settle(api<SearchResult>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent('type = risk ORDER BY criticality DESC')}&limit=50`)),
    ]).then(([kpis, meta, notes, life, tpl, risks]) => setD({
      kpis, meta, notes: Array.isArray(notes) ? notes : [], life, tpl,
      risks: (risks?.hits ?? []).filter((h) => h.category !== 'done' && h.risk?.criticality != null).slice(0, 5),
    }));
  }, [project]);
  if (!d) return <p role="status">{fr.loading}</p>;

  const day = (iso: string | null | undefined) => (iso ? <time dateTime={iso}>{formatDay(iso, true)}</time> : t.notSet);
  const note = d.notes[0];
  const reviews = (d.tpl?.phases ?? []).filter((p) => !p.offTemplate);
  return (
    <>
      <PageHeader title={t.title(project)} actions={<Btn variant="ghost" onClick={() => window.print()}>{t.print}</Btn>} sub={d.kpis?.project.name ?? ''} />
      <article className="ath-sheet ath-stack" aria-label={t.title(project)}>
        <section aria-label={t.health}>
          <h2 className="ath-section-title">{t.health}</h2>
          <p>{d.kpis ? <HealthPill health={d.kpis.health.state} /> : t.notSet} · {t.state} : {d.life?.state.name ?? t.notSet}</p>
          {d.kpis && <p>{fr.steer.progress} : <strong className="ath-mono">{d.kpis.progress.percent} %</strong> · {fr.steer.open} : <strong className="ath-mono">{d.kpis.open}</strong> · {fr.steer.late} : <strong className="ath-mono">{d.kpis.late}</strong> · {fr.steer.blocked} : <strong className="ath-mono">{d.kpis.blocked}</strong></p>}
          <p>{t.dates} : {day(d.meta?.plannedStart)} → {day(d.meta?.plannedEnd)} · {t.sponsor} : {d.meta?.sponsorName ?? t.notSet} · {t.manager} : {d.kpis?.project.managers.join(', ') || t.notSet}</p>
        </section>
        <section aria-label={t.weather}>
          <h2 className="ath-section-title">{t.weather}</h2>
          {note ? (
            <>
              <p>{(['schedule', 'scope', 'risk', 'resources', 'cost'] as const).map((a) => note[a] ? <span key={a}>{fr.statusNote.axes[a]} : <StatusPill kind={LEVEL_KIND[note[a]!]!}>{fr.statusNote.levels[note[a]!]}</StatusPill>{' '}</span> : null)}</p>
              {note.comment && <p>{note.comment}</p>}
              <small>{fr.statusNote.writtenBy(note.authorName ?? note.author, formatDay(note.writtenAt, true))}</small>
            </>
          ) : <p>{t.noWeather}</p>}
        </section>
        <section aria-label={t.phases}>
          <h2 className="ath-section-title">{t.phases}</h2>
          {reviews.length === 0 ? <p>{t.noPhases}</p> : (
            <ol>
              {reviews.map((p) => (
                <li key={p.key} aria-current={p.key === d.tpl?.phase ? 'step' : undefined}>
                  <strong>{p.name}</strong>{p.review ? ` (${p.review.toUpperCase()})` : ''}{p.key === d.tpl?.phase ? ` · ${fr.phaseCard.current}` : ''} · {fr.phaseCard.review} {fr.phaseCard.reviewPlanned} {day(p.record.reviewPlannedOn)}
                  {p.record.reviewHeldOn && <> · {fr.phaseCard.reviewHeld} {day(p.record.reviewHeldOn)}</>}
                  {p.record.decision && <> · {fr.phaseCard.decisions[p.record.decision]}</>}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-label={t.risks}>
          <h2 className="ath-section-title">{t.risks}</h2>
          {d.risks.length === 0 ? <p>{t.noRisks}</p> : (
            <ul>{d.risks.map((h) => <li key={h.key}><Link className="ath-link ath-mono" to={`/p/${project}/a/${h.key}`}>{h.key}</Link> {h.title ?? ''} · {fr.risks.criticality} <strong className="ath-mono">{h.risk!.criticality}</strong></li>)}</ul>
          )}
        </section>
      </article>
    </>
  );
}
