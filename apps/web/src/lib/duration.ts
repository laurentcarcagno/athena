/**
 * Durées en heures et minutes (étude PPM, décision du 2026-11-15) : la base stocke des minutes entières, l'interface saisit et affiche
 * « 7 h 48 », « 7 h 00 », « 8 h 00 » ou toute autre durée. Aucun arrondi : 468 minutes valent exactement 7 h 48.
 */
export const MAX_DAY_MINUTES = 1440;

export const splitMinutes = (total: number): { hours: number; minutes: number } => ({ hours: Math.floor(total / 60), minutes: total % 60 });
export const toMinutes = (hours: number, minutes: number): number => hours * 60 + minutes;

/** « 7 h 48 », « 8 h 00 », « 0 h 45 » : les minutes sont toujours sur deux chiffres. */
export function formatDuration(total: number): string {
  const { hours, minutes } = splitMinutes(Math.max(0, Math.round(total)));
  return `${hours} h ${String(minutes).padStart(2, '0')}`;
}

/**
 * Lit une durée saisie au clavier : « 7 h 48 », « 7h48 », « 7:48 », « 7 h », « 45 min », « 7,5 h » (heures décimales).
 * Renvoie le nombre de minutes, ou `null` si le texte n'est pas une durée.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  let m = /^(\d{1,4})\s*(?:h|:)\s*(\d{1,2})$/.exec(t);
  if (m) return Number(m[2]) < 60 ? toMinutes(Number(m[1]), Number(m[2])) : null;
  m = /^(\d{1,4})\s*h(?:eures?)?$/.exec(t);
  if (m) return toMinutes(Number(m[1]), 0);
  m = /^(\d{1,5})\s*(?:min|mn|minutes?)$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d{1,3})[.,](\d{1,2})\s*h(?:eures?)?$/.exec(t);
  if (m) return Math.round(Number(`${m[1]}.${m[2]}`) * 60);
  return null;
}
