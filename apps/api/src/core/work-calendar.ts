/**
 * Jours ouvrés (ADR-0006 § 2.4) : bibliothèque partagée par le moteur de dates, les absences et la charge.
 * Les dates sont des chaînes `AAAA-MM-JJ` (jours civils, sans fuseau) ; les jours de semaine suivent l'ISO (1 = lundi … 7 = dimanche).
 */
export interface WorkCalendar {
  /** Jours ISO travaillés (au moins un). */
  workDays: ReadonlySet<number>;
  /** Jours fériés `AAAA-MM-JJ`. */
  holidays: ReadonlySet<string>;
}

export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5] as const;
export const defaultCalendar = (): WorkCalendar => ({ workDays: new Set(DEFAULT_WORK_DAYS), holidays: new Set() });

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const toMs = (d: string): number => {
  if (!DATE.test(d)) throw new RangeError(`date invalide : ${d}`);
  const ms = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== d) throw new RangeError(`date inexistante : ${d}`);
  return ms;
};
const fromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const isoWeekday = (ms: number): number => ((new Date(ms).getUTCDay() + 6) % 7) + 1;
const ok = (c: WorkCalendar, ms: number): boolean => c.workDays.has(isoWeekday(ms)) && !c.holidays.has(fromMs(ms));

function assertUsable(c: WorkCalendar): void {
  if (c.workDays.size === 0) throw new RangeError('le calendrier ne compte aucun jour travaillé');
}

/** Vrai si le jour est travaillé : dans la semaine ouvrée et pas férié. */
export function isWorkingDay(c: WorkCalendar, day: string): boolean {
  return ok(c, toMs(day));
}

/** Premier jour ouvré à partir de `day` inclus (ou en remontant, avec `direction` -1). Borne : un férié par jour sur un an au plus. */
export function alignToWorkingDay(c: WorkCalendar, day: string, direction: 1 | -1 = 1): string {
  assertUsable(c);
  let ms = toMs(day);
  for (let i = 0; i < 3660 && !ok(c, ms); i++) ms += direction * DAY_MS;
  if (!ok(c, ms)) throw new RangeError('aucun jour ouvré trouvé dans les dix ans');
  return fromMs(ms);
}

/**
 * Ajoute `count` jours ouvrés (négatif : retranche). `count` = 0 rend `day` tel quel. Sinon on compte les jours ouvrés
 * traversés : le résultat est toujours un jour ouvré, que `day` le soit ou non.
 */
export function addWorkingDays(c: WorkCalendar, day: string, count: number): string {
  if (!Number.isInteger(count)) throw new RangeError('nombre de jours entier attendu');
  assertUsable(c);
  let ms = toMs(day);
  if (count === 0) return day;
  const step = count > 0 ? DAY_MS : -DAY_MS;
  for (let left = Math.abs(count), guard = 0; left > 0; ) {
    ms += step;
    if (++guard > Math.abs(count) * 7 + 3660) throw new RangeError('aucun jour ouvré trouvé');
    if (ok(c, ms)) left--;
  }
  return fromMs(ms);
}

/**
 * Écart en jours ouvrés entre deux dates : nombre de jours ouvrés dans l'intervalle ]a, b] (négatif si b précède a).
 * Cohérent avec `addWorkingDays` : `addWorkingDays(c, a, workingDaysBetween(c, a, b)) === b` quand b est un jour ouvré.
 */
export function workingDaysBetween(c: WorkCalendar, a: string, b: string): number {
  const from = toMs(a);
  const to = toMs(b);
  if (from === to) return 0;
  const sign = to > from ? 1 : -1;
  const [lo, hi] = sign === 1 ? [from, to] : [to, from];
  let n = 0;
  for (let ms = lo + DAY_MS; ms <= hi; ms += DAY_MS) if (ok(c, ms)) n++;
  return sign * n;
}

/** Liste des jours ouvrés de l'intervalle [from, to] (bornes incluses ; vide si `to` précède `from`). */
export function listWorkingDays(c: WorkCalendar, from: string, to: string): string[] {
  const out: string[] = [];
  const end = toMs(to);
  for (let ms = toMs(from); ms <= end; ms += DAY_MS) if (ok(c, ms)) out.push(fromMs(ms));
  return out;
}
