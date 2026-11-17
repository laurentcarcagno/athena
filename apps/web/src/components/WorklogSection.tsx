import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Card, Field, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';
import { hours, parseDuration } from '../pages/CapacityPage';

interface Row { id: string; subject: string; person: string; day: string; minutes: number; comment: string }
interface Data { rows: Row[]; totalMinutes: number }

/** Temps passé d'un ticket (lot 22, B36) : saisie en heures et minutes, total, retrait du sien. Absente quand la fonctionnalité Capacité est désactivée. */
export function WorklogSection({ project, ticket, me }: { project: string; ticket: string; me: string }) {
  const t = fr.worklog;
  const fail = useFailure();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState({ day: '', duration: '', comment: '' });
  const load = useCallback(() => { api<Data>('GET', `/v1/projects/${project}/artifacts/${ticket}/worklog`).then((d) => setData(d && Array.isArray(d.rows) ? d : null)).catch(() => setData(null)); }, [project, ticket]);
  useEffect(load, [load]);
  if (!data) return null;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const minutes = parseDuration(form.duration);
    if (minutes === null) { fail(new Error(t.badDuration)); return; }
    try { await api('POST', `/v1/projects/${project}/artifacts/${ticket}/worklog`, { day: form.day, minutes, comment: form.comment }); setForm({ day: '', duration: '', comment: '' }); toast('success', t.saved); load(); } catch (error) { fail(error); }
  };
  const remove = async (id: string) => { try { await api('DELETE', `/v1/projects/${project}/worklog/${id}`) /* sans confirmation : réversible (le temps se ressaisit) */; load(); } catch (error) { fail(error); } };

  return (
    <Card title={t.title} meta={<span className="ath-mono">{t.total(hours(data.totalMinutes))}</span>}>
      <div className="ath-stack">
        <form className="ath-toolbar" onSubmit={(e) => void add(e)} aria-label={t.form}>
          <Field label={t.day} type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} required />
          <Field label={t.duration} placeholder="1 h 30" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} required />
          <Field label={t.comment} value={form.comment} maxLength={500} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          <Btn type="submit" size="sm" disabled={!form.day || !form.duration}>{t.add}</Btn>
        </form>
        {data.rows.length === 0 ? <p>{t.none}</p> : (
          <ul>{data.rows.map((r) => (
            <li key={r.id}>{formatDay(r.day, true)} · <strong className="ath-mono">{hours(r.minutes)}</strong> · {r.person}{r.comment ? ` · ${r.comment}` : ''}{r.subject === me && <> <Btn size="sm" variant="ghost" onClick={() => void remove(r.id)}>{t.remove}</Btn></>}</li>
          ))}</ul>
        )}
      </div>
    </Card>
  );
}
