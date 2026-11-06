import { useCallback, useEffect, useState } from 'react';
import { Btn, Card, Tag, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { UpgradeReport, type UpgradeReportData } from './UpgradeReport';

export interface TemplateStatus {
  templateKey: string | null; version: string | null; latest: string | null; upgradable: boolean; criticality: string | null; phase: string | null;
  phaseCheck: { key: string; name: string; review: string; next: string | null; canAdvance: boolean; criteria: Array<{ label: string; manual: boolean; met: boolean; remaining: number }> } | null;
  drift: { trackersAdded: string[]; trackers: Array<{ key: string; fieldsAdded: string[]; statusesAdded: string[]; transitionsAdded: string[] }>; total: number };
}

/**
 * Gabarit du projet : version épinglée, criticité, phase en cours avec ses critères de sortie, écart au gabarit (dérive) et montée de
 * version avec rapport d'impact. Absent si le projet n'a pas de gabarit.
 */
export function ProjectTemplateCard({ project, canManage }: { project: string; canManage: boolean }) {
  const t = fr.phaseCard;
  const fail = useFailure();
  const toast = useToast();
  const [status, setStatus] = useState<TemplateStatus | null>(null);
  const [report, setReport] = useState<UpgradeReportData | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api<TemplateStatus>('GET', `/v1/projects/${project}/template`).then(setStatus).catch(() => setStatus(null)); }, [project]);
  useEffect(load, [load]);
  if (!status?.templateKey) return null;
  const check = status.phaseCheck;

  const advance = async () => {
    try { const out = await api<{ to: string }>('POST', `/v1/projects/${project}/template/phase/advance`); toast('success', t.advanced(out.to)); load(); } catch (error) { fail(error); }
  };
  const preview = async () => {
    try { setReport(await api<UpgradeReportData>('POST', `/v1/projects/${project}/template/upgrade-preview`, {})); } catch (error) { fail(error); }
  };
  const apply = async () => {
    setBusy(true);
    try { const out = await api<UpgradeReportData>('POST', `/v1/projects/${project}/template/upgrade`, {}); toast('success', fr.upgrade.applied(out.to)); setReport(null); load(); } catch (error) { fail(error); } finally { setBusy(false); }
  };

  return (
    <>
      <Card title={t.title} meta={status.version ? `${status.templateKey} ${status.version}` : status.templateKey}>
        <div className="ath-stack">
          {status.version === null && <p className="ath-eyebrow">{t.unversioned}</p>}
          {status.criticality && <p>{t.criticality} : <span className="ath-mono">{status.criticality}</span></p>}
          {check ? (
            <section className="ath-stack" aria-label={t.phase}>
              <p>{t.phase} : <strong>{check.name}</strong> <span className="ath-mono">({check.review.toUpperCase()})</span></p>
              <h3 className="ath-eyebrow">{t.exitCriteria}</h3>
              <ul>
                {check.criteria.map((c) => (
                  <li key={c.label}>{c.label} <Tag variant={c.manual ? 'ghost' : c.met ? 'solid' : 'accent'}>{c.manual ? t.manual : c.met ? t.met : `${t.unmet} · ${t.remaining(c.remaining)}`}</Tag></li>
                ))}
              </ul>
              {check.next === null ? <p>{t.last}</p> : canManage && <div><Btn disabled={!check.canAdvance} onClick={() => void advance()}>{t.advance(check.next)}</Btn></div>}
            </section>
          ) : status.phase && <p>{t.phase} : <span className="ath-mono">{status.phase}</span></p>}
          <section className="ath-stack" aria-label={t.drift}>
            <h3 className="ath-eyebrow">{t.drift}</h3>
            {status.drift.total === 0 ? <p>{t.driftNone}</p> : (
              <>
                <p>{t.driftSummary(status.drift.total)}</p>
                <ul>
                  {status.drift.trackersAdded.map((k) => <li key={`t-${k}`} className="ath-mono">{t.driftTracker(k)}</li>)}
                  {status.drift.trackers.flatMap((d) => [
                    d.fieldsAdded.length ? <li key={`f-${d.key}`} className="ath-mono">{t.driftFields(d.key, d.fieldsAdded.join(', '))}</li> : null,
                    d.statusesAdded.length ? <li key={`s-${d.key}`} className="ath-mono">{t.driftStatuses(d.key, d.statusesAdded.join(', '))}</li> : null,
                    d.transitionsAdded.length ? <li key={`x-${d.key}`} className="ath-mono">{t.driftTransitions(d.key, d.transitionsAdded.join(', '))}</li> : null,
                  ])}
                </ul>
              </>
            )}
          </section>
          {status.version !== null && (status.upgradable && status.latest ? (
            <div className="ath-row"><span>{t.upgradeAvailable(status.latest)}</span>{canManage && <Btn variant="ghost" onClick={() => void preview()}>{t.preview}</Btn>}</div>
          ) : <p>{t.upToDate}</p>)}
        </div>
      </Card>
      {report && <UpgradeReport report={report} busy={busy} onApply={() => void apply()} onCancel={() => setReport(null)} />}
    </>
  );
}
