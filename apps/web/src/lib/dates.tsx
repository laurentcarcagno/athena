import { fr, getLocale } from '../i18n';

/**
 * Dates et heures affichées selon la langue de l'interface et le fuseau du navigateur (T-0132, DESIGN.md § 6.4) :
 * « 07/11/2026 09:30 » en français, « 07/11/2026, 09:30 » en anglais. Une valeur illisible est rendue telle quelle.
 */
const TAG = { fr: 'fr-FR', en: 'en-GB' } as const;

function format(iso: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!iso) return '';
  // Une date seule (« 2026-11-04 ») est un jour du calendrier, pas minuit UTC : elle se lit en heure locale.
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(TAG[getLocale()] ?? 'fr-FR', options).format(date);
}

export const formatDateTime = (iso: string | null | undefined): string => format(iso, { dateStyle: 'short', timeStyle: 'short' });
export const formatDate = (iso: string | null | undefined): string => format(iso, { dateStyle: 'short' });

/** Date affichée dans un élément `<time>` (valeur machine en `dateTime`) : lisible, sémantique, et masquée dans les captures de test. */
export function DateTime({ iso, date = false }: { iso: string | null | undefined; date?: boolean }) {
  if (!iso) return null;
  return <time dateTime={iso}>{date ? formatDate(iso) : formatDateTime(iso)}</time>;
}

/** Jour du calendrier en clair : « 20 nov. », ou « 3 déc. 2026 » avec l'année (T-0150). */
export const formatDay = (iso: string | null | undefined, year = false): string => format(iso, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });

/** Période en clair : « du 20 nov. au 3 déc. 2026 » (T-0150). */
export const formatSpan = (start: string | null | undefined, end: string | null | undefined): string =>
  (start && end ? fr.when.span(formatDay(start), formatDay(end, true)) : '');

/** Où en est une période par rapport à aujourd'hui : « commence dans 9 jours », « se termine dans 3 jours », « terminée ». */
export function relativeSpan(start: string | null | undefined, end: string | null | undefined, today = new Date()): string {
  const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y!, m! - 1, d!); };
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = (t: number) => Math.round((t - now) / 86_400_000);
  if (start && days(day(start)) > 0) return fr.when.startsIn(days(day(start)));
  if (end && days(day(end)) >= 0) return fr.when.endsIn(days(day(end)));
  return end ? fr.when.ended : '';
}
