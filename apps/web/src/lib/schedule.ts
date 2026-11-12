/** Planning côté navigateur (ADR-0006, T-0162) : types de l'API, jours ouvrés pour griser le calendrier, ordre WBS. */

export interface ScheduleTask {
  key: string; title: string; tracker: string; parent: string | null;
  summary: boolean; milestone: boolean; scheduled: boolean;
  start: string | null; end: string | null; plannedStart: string | null; plannedEnd: string | null;
  duration: number; moved: boolean; slack: number | null; critical: boolean; progress: number | null; remaining: number | null; version: number;
}
export interface ScheduleLink { id: string; from: string; to: string; lag: number }
export interface ScheduleData { tasks: ScheduleTask[]; links: ScheduleLink[]; projectEnd: string | null; criticalPath: string[]; moved: number }
export interface CalendarData { workDays: number[]; holidays: Array<{ day: string; label: string }> }

export const DAY_MS = 86_400_000;
export const dayNumber = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const isoOf = (day: number): string => new Date(day * DAY_MS).toISOString().split('T')[0]!;

/** Jour ISO (1 = lundi … 7 = dimanche) d'un numéro de jour (le 1970-01-01 était un jeudi). */
export const weekdayOf = (day: number): number => ((((day + 3) % 7) + 7) % 7) + 1;

export function workingPredicate(cal: CalendarData | null): (day: number) => boolean {
  const week = new Set(cal?.workDays ?? [1, 2, 3, 4, 5]);
  const holidays = new Set((cal?.holidays ?? []).map((h) => dayNumber(h.day)));
  return (day) => week.has(weekdayOf(day)) && !holidays.has(day);
}

/** Jour ouvré le plus proche de `iso` décalé de `days` jours civils : vers l'avant si `days` ≥ 0, vers l'arrière sinon. */
export function shiftTo(isWorking: (day: number) => boolean, iso: string, days: number): string {
  let d = dayNumber(iso) + days;
  const step = days >= 0 ? 1 : -1;
  for (let i = 0; i < 3660 && !isWorking(d); i++) d += step;
  return isoOf(d);
}

export interface WbsRow { task: ScheduleTask; depth: number }

/** Lignes du tableau dans l'ordre de la hiérarchie (parent, puis ses enfants), les racines dans l'ordre reçu. */
export function wbsOrder(tasks: ScheduleTask[]): WbsRow[] {
  const known = new Set(tasks.map((t) => t.key));
  const children = new Map<string | null, ScheduleTask[]>();
  for (const t of tasks) {
    const p = t.parent !== null && known.has(t.parent) ? t.parent : null;
    children.set(p, [...(children.get(p) ?? []), t]);
  }
  const rows: WbsRow[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const t of children.get(parent) ?? []) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      rows.push({ task: t, depth });
      walk(t.key, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export const ROW_HEIGHT = 32;
export const HEAD_HEIGHT = 48;
export const DAY_WIDTH = 24;

export interface Axis { first: number; days: number; width: number }

/** Axe du temps : des dates planifiées, avec une marge avant et après ; au moins trois semaines. */
export function axisOf(tasks: ScheduleTask[]): Axis | null {
  const days: number[] = [];
  for (const t of tasks) {
    if (t.plannedStart) days.push(dayNumber(t.plannedStart));
    if (t.plannedEnd) days.push(dayNumber(t.plannedEnd));
  }
  if (days.length === 0) return null;
  const first = Math.min(...days) - 2;
  const count = Math.max(21, Math.max(...days) + 6 - first + 1);
  return { first, days: count, width: count * DAY_WIDTH };
}

export const xOf = (axis: Axis, iso: string): number => (dayNumber(iso) - axis.first) * DAY_WIDTH;

/** Plages de jours non ouvrés de l'axe, fusionnées : `[premier jour, nombre de jours]`. */
export function nonWorkingRuns(axis: Axis, isWorking: (day: number) => boolean): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (let i = 0; i < axis.days; i++) {
    if (isWorking(axis.first + i)) continue;
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === i) last[1]++;
    else runs.push([i, 1]);
  }
  return runs;
}

/** Fenêtre de lignes à dessiner : toutes si peu nombreuses, sinon celles du défilement plus une marge. */
export function visibleWindow(total: number, scrollTop: number, viewport: number, overscan = 8): { from: number; to: number } {
  if (total <= 80) return { from: 0, to: total };
  const from = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
  const to = Math.min(total, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + overscan);
  return { from, to };
}
