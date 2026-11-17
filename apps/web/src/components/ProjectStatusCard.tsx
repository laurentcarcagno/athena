import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Card, Select, Tag, Textarea, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

export type StatusLevel = 'ok' | 'attention' | 'critical';
export interface StatusNoteData {
  id: string; writtenAt: string; author: string; authorName: string | null;
  schedule: StatusLevel; scope: StatusLevel; risk: StatusLevel; resources: StatusLevel | null; cost: StatusLevel | null; comment: string;
}
const AXES = ['schedule', 'scope', 'risk'] as const;
const OPTIONAL_AXES = ['resources', 'cost'] as const;

/** Carte « Météo » de la vue d'ensemble (lot 18, B17) : dernière note du chef de projet et saisie en trois choix. */
export function ProjectStatusCard({ project, canManage }: { project: string; canManage: boolean }) {
  const t = fr.statusNote;
  const fail = useFailure();
  const toast = useToast();
  const [notes, setNotes] = useState<StatusNoteData[] | null>(null);
  const [form, setForm] = useState<{ schedule: StatusLevel; scope: StatusLevel; risk: StatusLevel; comment: string } | null>(null);
  const load = useCallback(() => {
    api<StatusNoteData[]>('GET', `/v1/projects/${project}/status-notes?limit=5`).then((r) => setNotes(Array.isArray(r) ? r : [])).catch(() => setNotes([]));
  }, [project]);
  useEffect(load, [load]);
  if (notes === null) return null;
  const last = notes[0];
  if (!last && !canManage) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    try {
      await api('POST', `/v1/projects/${project}/status-notes`, form);
      setForm(null); toast('success', t.saved); load();
    } catch (error) { fail(error); }
  };
  const level = (l: StatusLevel) => <Tag variant={l === 'ok' ? 'default' : l === 'attention' ? 'accent' : 'solid'}>{t.levels[l]}</Tag>;

  return (
    <Card title={t.title} meta={canManage && !form ? <Btn variant="ghost" onClick={() => setForm({ schedule: last?.schedule ?? 'ok', scope: last?.scope ?? 'ok', risk: last?.risk ?? 'ok', comment: '' })}>{t.write}</Btn> : undefined}>
      {form ? (
        <form className="ath-stack" onSubmit={(e) => void save(e)} aria-label={t.write}>
          {AXES.map((axis) => (
            <div className="ath-toolbar" key={axis}>
              <label className="ath-field__label" htmlFor={`status-${axis}`}>{t.axes[axis]}</label>
              <Select id={`status-${axis}`} value={form[axis]} onChange={(e) => setForm({ ...form, [axis]: e.target.value as StatusLevel })}>
                {(['ok', 'attention', 'critical'] as const).map((l) => <option key={l} value={l}>{t.levels[l]}</option>)}
              </Select>
            </div>
          ))}
          <label className="ath-field__label" htmlFor="status-comment">{t.comment}</label>
          <Textarea id="status-comment" rows={3} maxLength={2000} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          <div className="ath-toolbar"><Btn type="submit">{t.save}</Btn><Btn type="button" variant="ghost" onClick={() => setForm(null)}>{t.cancel}</Btn></div>
        </form>
      ) : last ? (
        <div className="ath-stack">
          <dl className="ath-facts">
            {AXES.map((axis) => <div key={axis}><dt>{t.axes[axis]}</dt><dd>{level(last[axis])}</dd></div>)}
            {OPTIONAL_AXES.map((axis) => last[axis] ? <div key={axis}><dt>{t.axes[axis]}</dt><dd>{level(last[axis]!)}</dd></div> : null)}
          </dl>
          {last.comment && <p>{last.comment}</p>}
          <small>{t.writtenBy(last.authorName ?? last.author, formatDay(last.writtenAt, true))}</small>
        </div>
      ) : <p>{t.none}</p>}
    </Card>
  );
}
