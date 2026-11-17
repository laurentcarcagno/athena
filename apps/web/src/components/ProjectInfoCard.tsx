import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Card, Field, Select, Textarea, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

export interface ProjectMetaData {
  plannedStart: string | null; plannedEnd: string | null; sponsorSubject: string | null; sponsorName: string | null;
  description: string; capacityGranularity: 'week' | 'month' | null;
}
interface UserEntry { subject: string; displayName: string }

/** Carte « Informations » de la vue d'ensemble : dates de référence, sponsor, description, granularité de la capacité (lot 17, B10). */
export function ProjectInfoCard({ project, canManage }: { project: string; canManage: boolean }) {
  const t = fr.projectMeta;
  const fail = useFailure();
  const toast = useToast();
  const [meta, setMeta] = useState<ProjectMetaData | null>(null);
  const [form, setForm] = useState<ProjectMetaData | null>(null);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const load = useCallback(() => { api<ProjectMetaData>('GET', `/v1/projects/${project}/meta`).then(setMeta).catch(fail); }, [project, fail]);
  useEffect(load, [load]);
  useEffect(() => { if (form) api<UserEntry[]>('GET', '/v1/users').then(setUsers).catch(() => setUsers([])); }, [form !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!meta) return null;

  const day = (iso: string | null) => (iso ? <time dateTime={iso}>{formatDay(iso, true)}</time> : t.none);
  const invalid = form !== null && form.plannedStart !== null && form.plannedEnd !== null && form.plannedEnd < form.plannedStart;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || invalid) return;
    try {
      setMeta(await api<ProjectMetaData>('PATCH', `/v1/projects/${project}/meta`, {
        plannedStart: form.plannedStart, plannedEnd: form.plannedEnd, sponsorSubject: form.sponsorSubject, description: form.description, capacityGranularity: form.capacityGranularity,
      }));
      setForm(null);
      toast('success', t.saved);
    } catch (error) { fail(error); }
  };

  return (
    <Card title={t.title} meta={canManage && !form ? <Btn variant="ghost" onClick={() => setForm({ ...meta })}>{t.edit}</Btn> : undefined}>
      {form ? (
        <form className="ath-stack" onSubmit={save}>
          <div className="ath-toolbar">
            <Field label={t.plannedStart} type="date" value={form.plannedStart ?? ''} onChange={(e) => setForm({ ...form, plannedStart: e.target.value || null })} />
            <Field label={t.plannedEnd} type="date" value={form.plannedEnd ?? ''} error={invalid ? t.endBeforeStart : undefined} onChange={(e) => setForm({ ...form, plannedEnd: e.target.value || null })} />
          </div>
          <div className="ath-toolbar">
            <label className="ath-field__label" htmlFor="meta-sponsor">{t.sponsor}</label>
            <Select id="meta-sponsor" value={form.sponsorSubject ?? ''} onChange={(e) => setForm({ ...form, sponsorSubject: e.target.value || null })}>
              <option value="">{t.none}</option>
              {form.sponsorSubject && !users.some((u) => u.subject === form.sponsorSubject) && <option value={form.sponsorSubject}>{form.sponsorName ?? form.sponsorSubject}</option>}
              {users.map((u) => <option key={u.subject} value={u.subject}>{u.displayName}</option>)}
            </Select>
          </div>
          <div className="ath-toolbar">
            <label className="ath-field__label" htmlFor="meta-granularity">{t.granularity}</label>
            <Select id="meta-granularity" value={form.capacityGranularity ?? ''} onChange={(e) => setForm({ ...form, capacityGranularity: (e.target.value || null) as 'week' | 'month' | null })}>
              <option value="">{t.inherit}</option>
              <option value="week">{t.week}</option>
              <option value="month">{t.month}</option>
            </Select>
          </div>
          <label className="ath-field__label" htmlFor="meta-description">{t.description}</label>
          <Textarea id="meta-description" rows={4} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="ath-toolbar"><Btn type="submit" disabled={invalid}>{t.save}</Btn><Btn type="button" variant="ghost" onClick={() => setForm(null)}>{t.cancel}</Btn></div>
        </form>
      ) : (
        <dl className="ath-facts">
          <div className="ath-facts__item"><dt>{t.plannedStart}</dt><dd>{day(meta.plannedStart)}</dd></div>
          <div className="ath-facts__item"><dt>{t.plannedEnd}</dt><dd>{day(meta.plannedEnd)}</dd></div>
          <div className="ath-facts__item"><dt>{t.sponsor}</dt><dd>{meta.sponsorName ?? meta.sponsorSubject ?? t.none}</dd></div>
          <div className="ath-facts__item"><dt>{t.granularity}</dt><dd>{meta.capacityGranularity ? t[meta.capacityGranularity] : t.inherit}</dd></div>
          <div className="ath-facts__item"><dt>{t.description}</dt><dd>{meta.description || t.none}</dd></div>
        </dl>
      )}
    </Card>
  );
}
