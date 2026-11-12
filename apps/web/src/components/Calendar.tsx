import { useEffect, useState, type FormEvent } from 'react';
import { Btn, Checkbox, Field, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

export interface CalendarData { workDays: number[]; holidays: Array<{ day: string; label: string }> }

/** Administration > Calendrier (ADR-0006 § 2.4) : semaine ouvrée et jours fériés de l'organisation. */
export function CalendarTab() {
  const fail = useFailure();
  const toast = useToast();
  const [form, setForm] = useState<CalendarData | null>(null);
  const [draft, setDraft] = useState({ day: '', label: '' });
  const [error, setError] = useState<string | undefined>();
  useEffect(() => { api<CalendarData>('GET', '/v1/calendar').then(setForm).catch(fail); }, [fail]);
  if (!form) return <p role="status">{fr.loading}</p>;

  const toggle = (iso: number, on: boolean) => {
    setError(undefined);
    setForm({ ...form, workDays: (on ? [...form.workDays, iso] : form.workDays.filter((d) => d !== iso)).sort((a, b) => a - b) });
  };
  const add = () => {
    if (!draft.day || !draft.label.trim()) { setError(fr.calendar.needFields); return; }
    if (form.holidays.some((h) => h.day === draft.day)) { setError(fr.calendar.duplicate); return; }
    setError(undefined);
    setForm({ ...form, holidays: [...form.holidays, { day: draft.day, label: draft.label.trim() }].sort((a, b) => a.day.localeCompare(b.day)) });
    setDraft({ day: '', label: '' });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.workDays.length === 0) { setError(fr.calendar.needDay); return; }
    try {
      setForm(await api<CalendarData>('PUT', '/v1/admin/calendar', form));
      setError(undefined);
      toast('success', fr.calendar.saved);
    } catch (e) { fail(e); }
  };

  return (
    <form className="ath-stack" onSubmit={submit} aria-labelledby="calendar-title">
      <h2 id="calendar-title" className="ath-section-title">{fr.calendar.title}</h2>
      <p>{fr.calendar.help}</p>
      <fieldset className="ath-stack">
        <legend className="ath-field__label">{fr.calendar.week}</legend>
        {fr.calendar.days.map((name, i) => (
          <label key={name} className="ath-row">
            <Checkbox checked={form.workDays.includes(i + 1)} onChange={(e) => toggle(i + 1, e.target.checked)} />
            {name}
          </label>
        ))}
      </fieldset>
      <fieldset className="ath-stack">
        <legend className="ath-field__label">{fr.calendar.holidays}</legend>
        {form.holidays.length === 0 ? <p>{fr.calendar.none}</p> : (
          <ul className="ath-stack">
            {form.holidays.map((h) => (
              <li key={h.day} className="ath-row">
                <time className="ath-mono" dateTime={h.day}>{h.day}</time>
                <span>{h.label}</span>
                <Btn type="button" icon="trash" variant="ghost" size="sm" aria-label={fr.calendar.remove(h.label)} onClick={() => setForm({ ...form, holidays: form.holidays.filter((x) => x.day !== h.day) })}>{fr.confirm.delete}</Btn>
              </li>
            ))}
          </ul>
        )}
        <div className="ath-row">
          <Field label={fr.calendar.date} type="date" mono value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })} />
          <Field label={fr.calendar.label} value={draft.label} maxLength={100} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <Btn type="button" variant="ghost" onClick={add}>{fr.calendar.add}</Btn>
        </div>
      </fieldset>
      {error && <p role="alert" className="ath-field__error">{error}</p>}
      <div><Btn type="submit">{fr.calendar.save}</Btn></div>
    </form>
  );
}
