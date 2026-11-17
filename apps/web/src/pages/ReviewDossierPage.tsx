import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Table, Td, Th } from '@athena/ui';
import { api } from '../api';
import { HealthPill, type Health } from '../components/PortfolioHealthTable';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

interface Line { key: string; name: string; health: Health; computedHealth: Health; overridden: boolean; declaredHealth: Health | null; gap: boolean; phase: string | null; plannedEnd: string | null; nextReview: string | null; progress: number; open: number; late: number; blocked: number; maxRisk: number | null }
interface Dossier {
  review: { id: string; heldOn: string; state: 'draft' | 'held'; summary: string; createdBy: string };
  portfolio: { key: string; name: string };
  snapshot: { takenAt: string; lines: Line[]; totals: { projects: number; byHealth: Record<Health, number>; late: number; blocked: number; open: number; progress: number } };
}

/**
 * Dossier de revue (lot 20, B33) : tuiles, tableau de santé et une section par projet critique, tous tirés de l'instantané figé à la création de la
 * revue (jamais des données du jour). S'imprime : seul le dossier reste, une page par projet critique.
 */
export function ReviewDossierPage() {
  const { key = '', id = '' } = useParams();
  const t = fr.dossier;
  const fail = useFailure();
  const [d, setD] = useState<Dossier | null>(null);
  useEffect(() => { api<Dossier>('GET', `/v1/portfolios/${key}/reviews/${id}`).then((r) => setD(r && r.snapshot ? r : null)).catch(fail); }, [key, id, fail]);
  if (!d) return <p role="status">{fr.loading}</p>;
  const { review, snapshot } = d;
  const critical = snapshot.lines.filter((l) => l.health === 'critical');
  const day = (iso: string | null) => (iso ? <time dateTime={iso}>{formatDay(iso, true)}</time> : t.notSet);
  return (
    <>
      <PageHeader title={t.title(d.portfolio.name, formatDay(review.heldOn, true))} sub={t.frozen(formatDay(snapshot.takenAt, true))}
        actions={<><Btn variant="ghost" onClick={() => window.print()}>{t.print}</Btn> <Link className="ath-link" to={`/portefeuilles/${key}`}>{fr.steer.back}</Link></>} />
      <article className="ath-sheet ath-stack" aria-label={t.title(d.portfolio.name, formatDay(review.heldOn, true))}>
        <section aria-label={t.summary}>
          <h2 className="ath-section-title">{t.summary}</h2>
          <p>{t.state}: <strong>{t.states[review.state]}</strong> · {t.createdBy(review.createdBy)}</p>
          {review.summary ? <p className="ath-prose">{review.summary}</p> : <p>{t.noSummary}</p>}
        </section>
        <section aria-label={t.tiles}>
          <h2 className="ath-section-title">{t.tiles}</h2>
          <p>
            {t.projects(snapshot.totals.projects)} · {(['critical', 'attention', 'ok'] as const).map((h) => <span key={h}><HealthPill health={h} /> <strong className="ath-mono">{snapshot.totals.byHealth[h]}</strong>{' '}</span>)}
            · {fr.steer.late} : <strong className="ath-mono">{snapshot.totals.late}</strong> · {fr.steer.blocked} : <strong className="ath-mono">{snapshot.totals.blocked}</strong> · {fr.steer.progress} : <strong className="ath-mono">{snapshot.totals.progress} %</strong>
          </p>
        </section>
        <section aria-label={t.health}>
          <h2 className="ath-section-title">{t.health}</h2>
          {snapshot.lines.length === 0 ? <EmptyState eyebrow={t.title(d.portfolio.name, '')} title={t.empty} /> : (
            <Table caption={t.caption(snapshot.lines.length)}>
              <thead><tr><Th>{fr.steer.project}</Th><Th>{fr.steerHealth.health}</Th><Th>{fr.steerHealth.declared}</Th><Th>{fr.steerHealth.phase}</Th><Th>{fr.steerHealth.nextReview}</Th><Th>{fr.steerHealth.plannedEnd}</Th><Th>{fr.steer.late}</Th><Th>{fr.steer.blocked}</Th><Th>{fr.steerHealth.maxRisk}</Th></tr></thead>
              <tbody>{snapshot.lines.map((l) => (
                <tr key={l.key}>
                  <Td mono><Link className="ath-link" to={`/p/${l.key}`}>{l.key}</Link> <span>{l.name}</span></Td>
                  <Td><HealthPill health={l.health} forced={l.overridden} /></Td><Td>{l.declaredHealth ? <HealthPill health={l.declaredHealth} /> : t.notSet}</Td>
                  <Td mono>{l.phase ?? t.notSet}</Td><Td>{day(l.nextReview)}</Td><Td>{day(l.plannedEnd)}</Td><Td mono>{l.late}</Td><Td mono>{l.blocked}</Td><Td mono>{l.maxRisk ?? '—'}</Td>
                </tr>
              ))}</tbody>
            </Table>
          )}
        </section>
        {critical.map((l) => (
          <section key={l.key} className="ath-sheet-page" aria-label={t.criticalProject(l.key)}>
            <h2 className="ath-section-title">{t.criticalProject(l.key)} · {l.name}</h2>
            <p><HealthPill health={l.health} forced={l.overridden} /> · {t.phase} : {l.phase ?? t.notSet} · {t.review} : {day(l.nextReview)} · {fr.steerHealth.plannedEnd} : {day(l.plannedEnd)}</p>
            <p>{fr.steer.progress} : <strong className="ath-mono">{l.progress} %</strong> · {fr.steer.open} : <strong className="ath-mono">{l.open}</strong> · {fr.steer.late} : <strong className="ath-mono">{l.late}</strong> · {fr.steer.blocked} : <strong className="ath-mono">{l.blocked}</strong> · {fr.steerHealth.maxRisk} : <strong className="ath-mono">{l.maxRisk ?? '—'}</strong></p>
          </section>
        ))}
      </article>
    </>
  );
}
