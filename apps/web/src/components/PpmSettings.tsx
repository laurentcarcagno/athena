import { useEffect, useState, type FormEvent } from 'react';
import { Btn, Checkbox, Field, Select, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { MAX_DAY_MINUTES } from '../lib/duration';
import { setFeatures, type Features } from '../lib/features';
import { DurationField } from './DurationField';

export interface PpmSettingsData {
  workdayMinutes: number; snapshotFrequency: 'weekly' | 'monthly'; snapshotWeeklyRetentionWeeks: number;
  snapshotReviewRetentionMonths: number | null; overloadPercent: number; statusNoteStaleDays: number;
}
const FEATURE_KEYS = ['ppm.portfolios', 'ppm.roadmap', 'ppm.capacity', 'ppm.finance', 'ppm.demand'] as const;

/** Administration › PPM (lot 17) : durée de la journée, instantanés, seuils, et interrupteurs de fonctionnalité de l'organisation. */
export function PpmSettingsTab() {
  const t = fr.ppmAdmin;
  const fail = useFailure();
  const toast = useToast();
  const [form, setForm] = useState<PpmSettingsData | null>(null);
  const [features, setLocalFeatures] = useState<Features | null>(null);
  useEffect(() => {
    api<PpmSettingsData>('GET', '/v1/ppm-settings').then(setForm).catch(fail);
    api<Features>('GET', '/v1/features').then(setLocalFeatures).catch(fail);
  }, [fail]);
  if (!form || !features) return <p role="status">{fr.loading}</p>;

  const set = <K extends keyof PpmSettingsData>(key: K, value: PpmSettingsData[K]) => setForm({ ...form, [key]: value });
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const valid = form.workdayMinutes >= 1 && form.workdayMinutes <= MAX_DAY_MINUTES;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try { setForm(await api<PpmSettingsData>('PUT', '/v1/admin/ppm-settings', form)); toast('success', t.saved); } catch (error) { fail(error); }
  };
  const toggle = async (key: string, enabled: boolean) => {
    try {
      const next = await api<Features>('PUT', `/v1/admin/features/${key}`, { enabled });
      setLocalFeatures(next);
      setFeatures(next); // le rail se met à jour sans rechargement
      toast('success', t.featureSaved);
    } catch (error) { fail(error); }
  };

  return (
    <div className="ath-stack">
      <section className="ath-stack" aria-label={t.settings}>
        <h2 className="ath-subsection-title">{t.settings}</h2>
        <p>{t.help}</p>
        <form className="ath-stack" onSubmit={save}>
          <DurationField label={t.workday} value={form.workdayMinutes} onChange={(m) => set('workdayMinutes', m)} />
          <div className="ath-toolbar">
            <label className="ath-field__label" htmlFor="ppm-frequency">{t.frequency}</label>
            <Select id="ppm-frequency" value={form.snapshotFrequency} onChange={(e) => set('snapshotFrequency', e.target.value as 'weekly' | 'monthly')}>
              <option value="weekly">{t.weekly}</option>
              <option value="monthly">{t.monthly}</option>
            </Select>
          </div>
          <Field label={t.weeklyRetention} type="number" min={1} max={520} value={form.snapshotWeeklyRetentionWeeks} onChange={(e) => set('snapshotWeeklyRetentionWeeks', num(e.target.value))} />
          <div className="ath-toolbar">
            <label className="ath-notify__pref">
              <Checkbox checked={form.snapshotReviewRetentionMonths === null} onChange={(e) => set('snapshotReviewRetentionMonths', e.target.checked ? null : 120)} />
              {t.reviewUnlimited}
            </label>
            {form.snapshotReviewRetentionMonths !== null && (
              <Field label={t.reviewRetention} type="number" min={1} max={600} value={form.snapshotReviewRetentionMonths} onChange={(e) => set('snapshotReviewRetentionMonths', num(e.target.value))} />
            )}
          </div>
          <Field label={t.overload} type="number" min={100} max={300} value={form.overloadPercent} onChange={(e) => set('overloadPercent', num(e.target.value))} />
          <Field label={t.staleDays} type="number" min={1} max={365} value={form.statusNoteStaleDays} onChange={(e) => set('statusNoteStaleDays', num(e.target.value))} />
          <div><Btn type="submit" disabled={!valid}>{t.save}</Btn></div>
        </form>
      </section>
      <section className="ath-stack" aria-label={t.features}>
        <h2 className="ath-subsection-title">{t.features}</h2>
        <p>{t.featuresHelp}</p>
        {FEATURE_KEYS.map((key) => (
          <label key={key} className="ath-notify__pref">
            <Checkbox checked={features[key] !== false} onChange={(e) => void toggle(key, e.target.checked)} />
            {t.featureNames[key]}
          </label>
        ))}
      </section>
    </div>
  );
}
