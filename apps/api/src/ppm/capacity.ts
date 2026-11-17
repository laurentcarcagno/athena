import { isWorkingDay, type WorkCalendar } from '../core/work-calendar';

/**
 * Calcul de capacité (lot 21, B35, étude PPM § 2.9) : fonctions pures, sans base. Unité : la minute. Une période est une semaine ISO ou un mois civil ;
 * une semaine à cheval sur deux mois se répartit au prorata des jours ouvrés, par construction (le calcul se fait jour ouvré par jour ouvré).
 */
export type Granularity = 'week' | 'month';
export interface Period { key: string; from: string; to: string }
export interface Availability { from: string; to: string | null; ratio: number; workdayMinutes: number | null }
export interface Absence { from: string; to: string; halfDay: boolean }
export interface AllocationSpan { from: string; to: string | null; fte: number }

const DAY_MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => iso(new Date(toDate(day).getTime() + n * DAY_MS));

/** Semaine ISO d'un jour : « 2026-W47 ». */
export function isoWeek(day: string): string {
  const d = toDate(day);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7)).padStart(2, '0')}`;
}

/** Périodes qui couvrent [from, to] : les semaines ISO (lundi au dimanche) ou les mois civils, bornes complètes. */
export function periodsBetween(from: string, to: string, granularity: Granularity): Period[] {
  const out: Period[] = [];
  if (granularity === 'month') {
    let d = new Date(Date.UTC(toDate(from).getUTCFullYear(), toDate(from).getUTCMonth(), 1));
    while (iso(d) <= to) {
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      out.push({ key: iso(d).slice(0, 7), from: iso(d), to: iso(end) });
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
    return out;
  }
  const first = toDate(from);
  let monday = addDays(from, -((first.getUTCDay() || 7) - 1));
  while (monday <= to) {
    out.push({ key: isoWeek(monday), from: monday, to: addDays(monday, 6) });
    monday = addDays(monday, 7);
  }
  return out;
}

/** Jours ouvrés de `p` compris dans [from, to] (to nul : sans fin). */
function workingDaysIn(cal: WorkCalendar, p: Period, from: string, to: string | null): string[] {
  const start = from > p.from ? from : p.from;
  const end = to !== null && to < p.to ? to : p.to;
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkingDay(cal, d)) days.push(d);
  return days;
}

/**
 * Capacité d'une personne sur une période, en minutes : somme, sur les jours ouvrés, de la durée de la journée × le ratio de disponibilité en vigueur,
 * moins les absences (un jour entier ou une demi-journée). Sans ligne de disponibilité, ratio 1 et journée de l'organisation.
 */
export function capacityMinutes(cal: WorkCalendar, p: Period, orgWorkdayMinutes: number, availability: readonly Availability[], absences: readonly Absence[]): number {
  let total = 0;
  for (const day of workingDaysIn(cal, p, p.from, p.to)) {
    // la dernière ligne qui couvre le jour fait foi
    const a = [...availability].reverse().find((x) => x.from <= day && (x.to === null || day <= x.to));
    const minutes = (a?.workdayMinutes ?? orgWorkdayMinutes) * (a?.ratio ?? 1);
    const away = absences.filter((x) => x.from <= day && day <= x.to);
    const lost = away.length === 0 ? 0 : away.some((x) => !x.halfDay) ? 1 : 0.5;
    total += minutes * (1 - lost);
  }
  return Math.round(total);
}

/** Charge planifiée d'une allocation sur une période, en minutes : jours ouvrés recouverts × journée × ETP. */
export function allocationMinutes(cal: WorkCalendar, p: Period, workdayMinutes: number, span: AllocationSpan): number {
  return Math.round(workingDaysIn(cal, p, span.from, span.to).length * workdayMinutes * span.fte);
}

export type LoadLevel = 'free' | 'normal' | 'tight' | 'overload';
/** Palier de charge : sous-charge sous 60 %, normal jusqu'à 100 %, tendu jusqu'au seuil de surcharge de l'organisation (110 % par défaut), surcharge au-delà. */
export function loadLevel(load: number, capacity: number, overloadPercent = 110): LoadLevel {
  if (capacity <= 0) return load > 0 ? 'overload' : 'free';
  const rate = (load / capacity) * 100;
  return rate < 60 ? 'free' : rate <= 100 ? 'normal' : rate <= overloadPercent ? 'tight' : 'overload';
}

/** Minutes en « 7 h 48 » (saisie et affichage en heures et minutes). */
export const formatMinutes = (m: number): string => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`;
/** « 7 h 48 », « 7h48 » ou « 7:48 » en minutes ; nul si invalide ou hors de 1 min à 24 h. */
export function parseDuration(text: string): number | null {
  const m = /^\s*(\d{1,2})\s*(?:h|:)\s*(\d{1,2})?\s*$/i.exec(text);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2] ?? 0);
  return minutes >= 1 && minutes <= 1440 && Number(m[2] ?? 0) < 60 ? minutes : null;
}
