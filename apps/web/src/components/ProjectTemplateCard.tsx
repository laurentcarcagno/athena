import { useCallback, useEffect, useState } from 'react';
import { Btn, Card, Select, Tag, Textarea, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { PhaseTimeline, type PhaseDecision, type PhaseEntry, type PhaseHistoryEntryData } from './PhaseTimeline';
import { UpgradeReport, type UpgradeReportData } from './UpgradeReport';

export interface TemplateStatus {
  templateKey: string | null; version: string | null; latest: string | null; upgradable: boolean; criticality: string | null; phase: string | null;
  phaseCheck: { key: string; name: string; review: string; next: string | null; canAdvance: boolean; criteria: Array<{ label: string; stage: 'exit' | 'entry'; phase: string; manual: boolean; met: boolean; remaining: number; checkedBy?: string; checkedAt?: string; note?: string }> } | null;
  phases?: PhaseEntry[]; phaseHistory?: PhaseHistoryEntryData[];
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
  const [decision, setDecision] = useState<PhaseDecision>('go');
  const [note, setNote] = useState('');
  const load = useCallback(() => { api<TemplateStatus>('GET', `/v1/projects/${project}/template`).then(setStatus).catch(() => setStatus(null)); }, [project]);
  useEffect(load, [load]);
  if (!status?.templateKey) return null;
  const check = status.phaseCheck;

  const advance = async () => {
    try {
      const out = await api<{ from: string; to: string }>('POST', `/v1/projects/${project}/template/phase/advance`, { decision, ...(note.trim() ? { note: note.trim() } : {}) });
      toast('success', out.to === out.from ? t.noGoRecorded : t.advanced(out.to)); setDecision('go'); setNote(''); load();
    } catch (error) { fail(error); }
  };
  const confirmCriterion = async (stage: 'exit' | 'entry', label: string, checked: boolean) => {
    try { await api('PUT', `/v1/projects/${project}/template/phase/criteria`, { stage, label, checked }); load(); } catch (error) { fail(error); }
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
              <h3 className="ath-subsection-title">{t.exitCriteria}</h3>
              <ul>
                {check.criteria.map((c) => (
                  <li key={`${c.stage}-${c.label}`}>
                    <span className="ath-eyebrow">{c.stage === 'entry' ? t.entry : t.exit}</span> {c.label}{' '}
                    <Tag variant={c.met ? 'solid' : 'accent'}>{c.met ? t.met : c.manual ? t.toConfirm : `${t.unmet} · ${t.remaining(c.remaining)}`}</Tag>
                    {c.manual && c.met && c.checkedBy && <> <small>{t.confirmedBy(c.checkedBy, c.checkedAt ? new Date(c.checkedAt).toLocaleDateString() : '')}{c.note ? ` · ${c.note}` : ''}</small></>}
                    {c.manual && canManage && (
                      <> <Btn size="sm" variant="ghost" onClick={() => void confirmCriterion(c.stage, c.label, !c.met)}>{c.met ? t.unconfirm : t.confirm}</Btn></>
                    )}
                  </li>
                ))}
              </ul>
              {check.next === null ? <p>{t.last}</p> : canManage && (
                <div className="ath-stack">
                  <div className="ath-toolbar">
                    <label className="ath-field__label" htmlFor="gate-decision">{t.decision}</label>
                    <Select id="gate-decision" value={decision} onChange={(e) => setDecision(e.target.value as PhaseDecision)}>
                      {(['go', 'go_with_reserves', 'no_go'] as const).map((d) => <option key={d} value={d}>{t.decisions[d]}</option>)}
                    </Select>
                  </div>
                  {decision !== 'go' && (
                    <>
                      <label className="ath-field__label" htmlFor="gate-note">{t.note}</label>
                      <Textarea id="gate-note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                    </>
                  )}
                  <div>
                    <Btn disabled={(decision !== 'no_go' && !check.canAdvance) || (decision !== 'go' && note.trim() === '')} onClick={() => void advance()}>{decision === 'no_go' ? t.recordNoGo : t.advance(check.next)}</Btn>
                    {decision !== 'go' && note.trim() === '' && <small> {t.noteRequired}</small>}
                  </div>
                </div>
              )}
            </section>
          ) : status.phase && <p>{t.phase} : <span className="ath-mono">{status.phase}</span></p>}
          {status.phases && status.phases.length > 0 && <PhaseTimeline project={project} phases={status.phases} history={status.phaseHistory ?? []} current={status.phase} canManage={canManage} onChange={load} />}
          <section className="ath-stack" aria-label={t.drift}>
            <h3 className="ath-subsection-title">{t.drift}</h3>
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
