/**
 * Jours ouvrés (ADR-0006 § 2.4) : bibliothèque partagée par le moteur de dates, les absences et la charge.
 * Les dates sont des chaînes `AAAA-MM-JJ` (jours civils, sans fuseau) ; les jours de semaine suivent l'ISO (1 = lundi … 7 = dimanche).
 * En interne, un jour est un entier (jours depuis le 1970-01-01) : les boucles ne créent aucune date.
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

/** Jour entier d'une date `AAAA-MM-JJ`. */
const toDay = (d: string): number => {
  if (!DATE.test(d)) throw new RangeError(`date invalide : ${d}`);
  const ms = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== d) throw new RangeError(`date inexistante : ${d}`);
  return ms / DAY_MS;
};
const fromDay = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);
/** Le 1970-01-01 était un jeudi (ISO 4). */
const isoWeekday = (n: number): number => ((((n + 3) % 7) + 7) % 7) + 1;

interface Compiled { week: boolean[]; holidays: Set<number> }
const compiled = new WeakMap<WorkCalendar, Compiled>();
function compile(c: WorkCalendar): Compiled {
  let k = compiled.get(c);
  if (!k) {
    if (c.workDays.size === 0) throw new RangeError('le calendrier ne compte aucun jour travaillé');
    k = { week: Array.from({ length: 8 }, (_, i) => c.workDays.has(i)), holidays: new Set([...c.holidays].map(toDay)) };
    compiled.set(c, k);
  }
  return k;
}
const worked = (k: Compiled, n: number): boolean => k.week[isoWeekday(n)]! && !k.holidays.has(n);

/** Vrai si le jour est travaillé : dans la semaine ouvrée et pas férié. */
export function isWorkingDay(c: WorkCalendar, day: string): boolean {
  return worked(compile(c), toDay(day));
}

/** Premier jour ouvré à partir de `day` inclus (ou en remontant, avec `direction` -1). Borne : dix ans. */
export function alignToWorkingDay(c: WorkCalendar, day: string, direction: 1 | -1 = 1): string {
  const k = compile(c);
  let n = toDay(day);
  for (let i = 0; i < 3660 && !worked(k, n); i++) n += direction;
  if (!worked(k, n)) throw new RangeError('aucun jour ouvré trouvé dans les dix ans');
  return fromDay(n);
}

/**
 * Ajoute `count` jours ouvrés (négatif : retranche). `count` = 0 rend `day` tel quel. Sinon on compte les jours ouvrés
 * traversés : le résultat est toujours un jour ouvré, que `day` le soit ou non.
 */
export function addWorkingDays(c: WorkCalendar, day: string, count: number): string {
  if (!Number.isInteger(count)) throw new RangeError('nombre de jours entier attendu');
  const k = compile(c);
  if (count === 0) { toDay(day); return day; }
  let n = toDay(day);
  const step = count > 0 ? 1 : -1;
  for (let left = Math.abs(count), guard = 0; left > 0; ) {
    n += step;
    if (++guard > Math.abs(count) * 7 + 3660) throw new RangeError('aucun jour ouvré trouvé');
    if (worked(k, n)) left--;
  }
  return fromDay(n);
}

/**
 * Écart en jours ouvrés entre deux dates : nombre de jours ouvrés dans l'intervalle ]a, b] (négatif si b précède a).
 * Cohérent avec `addWorkingDays` : `addWorkingDays(c, a, workingDaysBetween(c, a, b)) === b` quand b est un jour ouvré.
 */
export function workingDaysBetween(c: WorkCalendar, a: string, b: string): number {
  const k = compile(c);
  const from = toDay(a);
  const to = toDay(b);
  if (from === to) return 0;
  const [lo, hi] = from < to ? [from, to] : [to, from];
  let count = 0;
  for (let n = lo + 1; n <= hi; n++) if (worked(k, n)) count++;
  return from < to ? count : -count;
}

/** Liste des jours ouvrés de l'intervalle [from, to] (bornes incluses ; vide si `to` précède `from`). */
export function listWorkingDays(c: WorkCalendar, from: string, to: string): string[] {
  const k = compile(c);
  const out: string[] = [];
  const end = toDay(to);
  for (let n = toDay(from); n <= end; n++) if (worked(k, n)) out.push(fromDay(n));
  return out;
}
