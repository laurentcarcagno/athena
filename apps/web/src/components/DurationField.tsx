import { useId } from 'react';
import { Field } from '@athena/ui';
import { fr } from '../i18n';
import { MAX_DAY_MINUTES, formatDuration, splitMinutes, toMinutes } from '../lib/duration';

/**
 * Champ de durée en heures et minutes (étude PPM) : deux champs numériques, le total en toutes lettres dessous. La valeur est un
 * nombre entier de minutes. Réutilisé par les réglages PPM, puis par la capacité et le temps passé.
 */
export function DurationField({ label, value, onChange, max = MAX_DAY_MINUTES, min = 1 }: { label: string; value: number; onChange: (minutes: number) => void; max?: number; min?: number }) {
  const id = useId();
  const { hours, minutes } = splitMinutes(value);
  const clamp = (n: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(0, Math.trunc(n))) : 0);
  const invalid = value < min || value > max;
  return (
    <fieldset className="ath-duration" aria-describedby={`${id}-total`}>
      <legend>{label}</legend>
      <div className="ath-toolbar">
        <Field label={fr.duration.hours} type="number" min={0} max={Math.floor(max / 60)} value={hours} onChange={(e) => onChange(toMinutes(clamp(e.target.valueAsNumber, Math.floor(max / 60)), minutes))} />
        <Field label={fr.duration.minutes} type="number" min={0} max={59} value={minutes} onChange={(e) => onChange(toMinutes(hours, clamp(e.target.valueAsNumber, 59)))} />
      </div>
      <p id={`${id}-total`} className={invalid ? 'ath-field__error' : undefined} role={invalid ? 'alert' : undefined}>
        {invalid ? fr.duration.outOfRange(formatDuration(min), formatDuration(max)) : `${fr.duration.total} : ${formatDuration(value)}`}
      </p>
    </fieldset>
  );
}
