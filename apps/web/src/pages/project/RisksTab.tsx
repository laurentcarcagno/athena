import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, Id, PageHeader, StatusPill, Table, Td, Th } from '@athena/ui';
import { api, type Hit, type SearchResult } from '../../api';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';
import { fromHere } from '../../lib/origin';
import { statusPill } from '../../lib/status';
import { useLocation } from 'react-router-dom';

const t = fr.risks;

/** Paliers de criticité (ADR-0006 § 2.4) : faible 1-4, modéré 5-9, élevé 10-16, critique 20-25 ; le score est toujours écrit. */
export const bandOf = (score: number): 'low' | 'moderate' | 'high' | 'critical' => (score >= 20 ? 'critical' : score >= 10 ? 'high' : score >= 5 ? 'moderate' : 'low');
const num = (hit: Hit, key: string): number | null => {
  const v = hit.values[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
const text = (hit: Hit, key: string): string => (hit.values[key] === undefined || hit.values[key] === null ? '' : String(hit.values[key]));

/**
 * Rapport Risques (pont avant le lot 13) : les tickets des trackers de type « risque » du projet, du plus critique au moins critique,
 * avec probabilité, impact et criticité quand le tracker les porte (champs `probability`, `impact`, `criticality`), et le palier en toutes lettres.
 */
export function RisksTab({ tabs }: { tabs?: ReactNode } = {}) {
  const { project = '' } = useParams();
  const fail = useFailure();
  const location = useLocation();
  const [hits, setHits] = useState<Hit[] | null>(null);
  useEffect(() => {
    api<SearchResult>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent('type = risk ORDER BY criticality DESC')}&limit=200`)
      .then((r) => setHits(r.hits)).catch((e) => { setHits([]); fail(e); });
  }, [project, fail]);
  if (hits === null) return <><PageHeader title={fr.reports.names.risques!} />{tabs}<p role="status">{fr.loading}</p></>;
  const open = hits.filter((h) => h.category !== 'done');
  const scored = (hit: Hit) => num(hit, 'criticality') ?? ((num(hit, 'probability') ?? 0) * (num(hit, 'impact') ?? 0) || null);
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const h of open) { const s = scored(h); if (s !== null) counts[bandOf(s)]++; }
  const keys = hits.map((h) => h.key);
  return (
    <>
      <PageHeader title={fr.reports.names.risques!} sub={t.sub} />
      {tabs}
      {hits.length === 0 ? <EmptyState eyebrow={t.eyebrow} title={t.empty} /> : (
        <div className="ath-stack">
          <p>{t.summary(open.length, counts.critical, counts.high, counts.moderate, counts.low)}</p>
          <Table>
            <thead><tr><Th>{fr.list.key}</Th><Th>{fr.list.title}</Th><Th>{t.category}</Th><Th>{t.probability}</Th><Th>{t.impact}</Th><Th>{t.criticality}</Th><Th>{fr.list.status}</Th></tr></thead>
            <tbody>
              {hits.map((h) => {
                const score = scored(h);
                return (
                  <tr key={h.key}>
                    <Td><Link className="ath-link ath-mono" to={`/p/${project}/a/${h.key}`} state={fromHere(location, t.eyebrow, keys)}>{h.key}</Link></Td>
                    <Td><span className="ath-clip" title={h.title ?? h.key}>{h.title ?? h.key}</span></Td>
                    <Td>{text(h, 'category')}</Td>
                    <Td mono>{num(h, 'probability') ?? ''}</Td>
                    <Td mono>{num(h, 'impact') ?? ''}</Td>
                    <Td>{score === null ? '' : <><Id>{String(score)}</Id> {t.bands[bandOf(score)]}</>}</Td>
                    <Td><StatusPill {...statusPill(h.category, h.statusColor)}>{h.statusName ?? h.status}</StatusPill></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
