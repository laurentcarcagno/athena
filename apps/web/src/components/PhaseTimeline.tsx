import { useState, type FormEvent } from 'react';
import { Btn, Field, Tag, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

export type PhaseDecision = 'go' | 'go_with_reserves' | 'no_go';
export interface PhaseRecordData {
  plannedStart: string | null; plannedEnd: string | null; reviewPlannedOn: string | null; reviewHeldOn: string | null;
  decision: PhaseDecision | null; decidedBy: string | null; decidedAt: string | null; note: string;
}
export interface PhaseEntry { key: string; name: string; review: string; offTemplate: boolean; record: PhaseRecordData }
export interface PhaseHistoryEntryData { phase: string; field: 'planned_end' | 'review_planned_on'; from: string | null; to: string | null; by: string; at: string }

const day = (iso: string | null) => (iso ? <time dateTime={iso}>{formatDay(iso, true)}</time> : null);

/** Frise des gates (lot 17, B12) : phases du gabarit avec dates prévues, revue prévue et tenue, décision ; historique des dates prévues. */
export function PhaseTimeline({ project, phases, history, current, canManage, onChange }: {
  project: string; phases: PhaseEntry[]; history: PhaseHistoryEntryData[]; current: string | null; canManage: boolean; onChange: () => void;
}) {
  const t = fr.phaseCard;
  const fail = useFailure();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ plannedStart: '', plannedEnd: '', reviewPlannedOn: '' });
  const invalid = form.plannedStart !== '' && form.plannedEnd !== '' && form.plannedEnd < form.plannedStart;
  const nameOf = (key: string) => phases.find((p) => p.key === key)?.name ?? key;

  const open = (p: PhaseEntry) => {
    setForm({ plannedStart: p.record.plannedStart ?? '', plannedEnd: p.record.plannedEnd ?? '', reviewPlannedOn: p.record.reviewPlannedOn ?? '' });
    setEditing(p.key);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('PUT', `/v1/projects/${project}/template/phases/${editing}`, { plannedStart: form.plannedStart || null, plannedEnd: form.plannedEnd || null, reviewPlannedOn: form.reviewPlannedOn || null });
      toast('success', t.datesSaved); setEditing(null); onChange();
    } catch (error) { fail(error); }
  };

  return (
    <section className="ath-stack" aria-label={t.timeline}>
      <h3 className="ath-subsection-title">{t.timeline}</h3>
      <ol className="ath-stack">
        {phases.map((p) => {
          const r = p.record;
          const dates = r.plannedStart || r.plannedEnd ? t.planned(r.plannedStart ? formatDay(r.plannedStart, true) : '…', r.plannedEnd ? formatDay(r.plannedEnd, true) : '…') : t.noDates;
          return (
            <li key={p.key} aria-current={p.key === current ? 'step' : undefined}>
              <strong>{p.name}</strong>{p.review && <> <span className="ath-mono">({p.review.toUpperCase()})</span></>}{' '}
              {p.key === current && <Tag variant="solid">{t.current}</Tag>}{p.offTemplate && <Tag>{t.offTemplate}</Tag>}
              {r.decision && <> <Tag variant={r.decision === 'go' ? 'default' : 'accent'}>{t.decisions[r.decision]}</Tag></>}
              <div>{dates}</div>
              {(r.reviewPlannedOn || r.reviewHeldOn) && (
                <div>{t.review}{r.reviewPlannedOn && <> {t.reviewPlanned} {day(r.reviewPlannedOn)}</>}{r.reviewHeldOn && <> · {t.reviewHeld} {day(r.reviewHeldOn)}</>}</div>
              )}
              {r.decision && r.decidedBy && r.decidedAt && <small>{t.decidedBy(r.decidedBy, formatDay(r.decidedAt, true))}{r.note ? ` · ${r.note}` : ''}</small>}
              {canManage && !p.offTemplate && editing !== p.key && <> <Btn size="sm" variant="ghost" onClick={() => open(p)}>{t.editDates(p.name)}</Btn></>}
              {editing === p.key && (
                <form className="ath-stack" onSubmit={(e) => void save(e)} aria-label={t.editDates(p.name)}>
                  <div className="ath-toolbar">
                    <Field label={t.plannedStart} type="date" value={form.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.target.value })} />
                    <Field label={t.plannedEnd} type="date" value={form.plannedEnd} error={invalid ? t.endBeforeStart : undefined} onChange={(e) => setForm({ ...form, plannedEnd: e.target.value })} />
                    <Field label={t.reviewPlannedOn} type="date" value={form.reviewPlannedOn} onChange={(e) => setForm({ ...form, reviewPlannedOn: e.target.value })} />
                  </div>
                  <div className="ath-toolbar"><Btn type="submit" disabled={invalid}>{t.saveDates}</Btn><Btn type="button" variant="ghost" onClick={() => setEditing(null)}>{t.cancel}</Btn></div>
                </form>
              )}
            </li>
          );
        })}
      </ol>
      {history.length > 0 && (
        <>
          <h4 className="ath-group-title">{t.history}</h4>
          <ul>
            {history.map((h, i) => (
              <li key={i}><small>{t.historyLine(`${t.historyFields[h.field]} · ${nameOf(h.phase)}`, h.from ? formatDay(h.from, true) : t.none, h.to ? formatDay(h.to, true) : t.none, h.by, formatDay(h.at, true))}</small></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
