import { getLocale } from '../i18n';

/**
 * Dates et heures affichées selon la langue de l'interface et le fuseau du navigateur (T-0132, DESIGN.md § 6.4) :
 * « 07/11/2026 09:30 » en français, « 07/11/2026, 09:30 » en anglais. Une valeur illisible est rendue telle quelle.
 */
const TAG = { fr: 'fr-FR', en: 'en-GB' } as const;

function format(iso: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!iso) return '';
  const date = new Date(iso);
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
