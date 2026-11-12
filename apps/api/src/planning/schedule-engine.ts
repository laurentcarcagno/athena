import { validation } from '../core/errors';
import { addWorkingDays, alignToWorkingDay, listWorkingDays, workingDaysBetween, type WorkCalendar } from '../core/work-calendar';

/**
 * Moteur de dates (ADR-0006 § 2.4, T-0161) : passe avant et arrière sur des tâches reliées par « précède » (fin → début, avec
 * décalage en jours ouvrés), marge totale, chemin critique, tâches parentes calculées depuis leurs enfants (D3).
 * Fonction pure : aucune base, aucune horloge. Linéaire en tâches + liens (hors parcours de jours).
 *
 * Règles :
 * - une tâche porte un début et une fin (fin incluse) ; sa durée est le nombre de jours ouvrés de [début, fin], au moins 1 ;
 * - sans début mais avec une fin, c'est un jalon (durée nulle) daté par sa fin ; sans aucune date, la tâche n'est pas planifiée ;
 * - le calcul ne fait que repousser : une tâche ne démarre jamais avant sa date saisie ni avant la fin de ses prédécesseurs ;
 * - un lien posé sur une tâche parente borne toutes ses descendantes ; une parente dépend de ses enfants (début le plus tôt, fin la plus tard).
 */
export interface PlanTask {
  key: string;
  title: string;
  start: string | null;
  end: string | null;
  progress: number | null;
  remaining: number | null;
  /** Clé de la tâche parente (lien hiérarchique), si elle fait partie du même ensemble. */
  parent: string | null;
}
/** `from` précède `to` (fin → début), `lag` jours ouvrés entre la fin de l'une et le début de l'autre. */
export interface PlanLink { from: string; to: string; lag: number; id?: string }

export interface PlannedTask {
  key: string;
  title: string;
  parent: string | null;
  summary: boolean;
  milestone: boolean;
  scheduled: boolean;
  /** Dates saisies. */
  start: string | null;
  end: string | null;
  /** Dates calculées (nulles si la tâche n'est pas planifiée). */
  plannedStart: string | null;
  plannedEnd: string | null;
  /** Durée en jours ouvrés (0 : jalon). */
  duration: number;
  /** Le calcul change au moins une date saisie. */
  moved: boolean;
  /** Marge totale en jours ouvrés (nulle si non planifiée). */
  slack: number | null;
  critical: boolean;
  progress: number | null;
  remaining: number | null;
}
export interface Schedule {
  tasks: PlannedTask[];
  projectEnd: string | null;
  /** Clés des tâches et jalons sans marge, dans l'ordre de calcul. */
  criticalPath: string[];
  moved: number;
}

type Edge = { to: number; kind: 'link' | 'inherit' | 'agg'; lag: number };

export function computeSchedule(tasks: PlanTask[], links: PlanLink[], cal: WorkCalendar): Schedule {
  const n = tasks.length;
  const index = new Map(tasks.map((t, i) => [t.key, i]));
  const parent = tasks.map((t) => (t.parent !== null ? index.get(t.parent) ?? -1 : -1));
  const children: number[][] = tasks.map(() => []);
  parent.forEach((p, i) => { if (p >= 0 && p !== i) children[p]!.push(i); });
  checkHierarchy(parent, tasks);

  // Une tâche est planifiée si elle a une date, ou si l'un de ses enfants l'est.
  const hasSchedule: boolean[] = new Array<boolean>(n).fill(false);
  const settled: boolean[] = new Array<boolean>(n).fill(false);
  const resolve = (i: number): boolean => {
    if (settled[i]) return hasSchedule[i]!;
    settled[i] = true;
    let value = tasks[i]!.start !== null || tasks[i]!.end !== null;
    for (const c of children[i]!) if (resolve(c)) value = true;
    hasSchedule[i] = value;
    return value;
  };
  for (let i = 0; i < n; i++) resolve(i);
  const summary = tasks.map((_, i) => children[i]!.some((c) => hasSchedule[c]));

  // Nœuds : une tâche simple = un nœud (i) ; une parente = entrée « cs » (i) et sortie « agg » (n + i).
  const inNode = (i: number) => i;
  const outNode = (i: number) => (summary[i] ? n + i : i);
  const active = (node: number) => hasSchedule[node % n]! && (node < n || summary[node - n]!);
  const out: Edge[][] = Array.from({ length: 2 * n }, () => []);
  const incoming: Array<Array<{ from: number; kind: Edge['kind']; lag: number }>> = Array.from({ length: 2 * n }, () => []);
  const connect = (from: number, to: number, kind: Edge['kind'], lag = 0) => { out[from]!.push({ to, kind, lag }); incoming[to]!.push({ from, kind, lag }); };
  for (const l of links) {
    const a = index.get(l.from);
    const b = index.get(l.to);
    if (a === undefined || b === undefined || a === b || !hasSchedule[a] || !hasSchedule[b]) continue;
    connect(outNode(a), inNode(b), 'link', l.lag);
  }
  for (let s = 0; s < n; s++) {
    if (!summary[s]) continue;
    for (const c of children[s]!) {
      if (!hasSchedule[c]) continue;
      connect(inNode(s), inNode(c), 'inherit');
      connect(outNode(c), n + s, 'agg');
    }
  }

  // Ordre topologique (Kahn) ; ce qui reste est un cycle.
  const degree = incoming.map((e) => e.length);
  const order: number[] = [];
  const queue: number[] = [];
  for (let v = 0; v < 2 * n; v++) if (active(v) && degree[v] === 0) queue.push(v);
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head]!;
    order.push(v);
    for (const e of out[v]!) if (--degree[e.to]! === 0) queue.push(e.to);
  }
  const total = (() => { let c = 0; for (let v = 0; v < 2 * n; v++) if (active(v)) c++; return c; })();
  if (order.length < total) {
    const stuck = [...new Set([...Array(2 * n).keys()].filter((v) => active(v) && degree[v]! > 0).map((v) => tasks[v % n]!.key))].sort();
    throw validation([`dépendances circulaires entre : ${stuck.slice(0, 10).join(', ')}${stuck.length > 10 ? '…' : ''}`]);
  }

  // --- Passe avant ---
  const duration: number[] = new Array<number>(n).fill(0);
  const milestone: boolean[] = new Array<boolean>(n).fill(false);
  const es: Array<string | null> = new Array<string | null>(2 * n).fill(null);
  const ef: Array<string | null> = new Array<string | null>(2 * n).fill(null);
  const cs: Array<string | null> = new Array<string | null>(n).fill(null);
  const later = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a >= b ? a : b);
  const earlier = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a <= b ? a : b);
  /** Plus tôt qu'une fin de prédécesseur autorise le début du successeur. */
  const bound = (predEnd: string, lag: number, toMilestone: boolean) => addWorkingDays(cal, predEnd, toMilestone ? lag : 1 + lag);

  for (const v of order) {
    const i = v % n;
    if (v >= n) { // sortie d'une parente
      let lo: string | null = null;
      let hi: string | null = null;
      for (const e of incoming[v]!) { lo = earlier(lo, es[e.from]!); hi = later(hi, ef[e.from]!); }
      es[v] = lo; ef[v] = hi;
      continue;
    }
    const task = tasks[i]!;
    if (summary[i]) { // entrée d'une parente : borne héritée par les enfants
      let value: string | null = null;
      for (const e of incoming[v]!) value = later(value, e.kind === 'link' ? bound(ef[e.from]!, e.lag, false) : cs[e.from]!);
      cs[i] = value;
      continue;
    }
    if (task.start === null) { // jalon
      milestone[i] = true;
      let date = alignToWorkingDay(cal, task.end!);
      for (const e of incoming[v]!) date = later(date, e.kind === 'link' ? bound(ef[e.from]!, e.lag, true) : cs[e.from]!)!;
      es[v] = date; ef[v] = date;
      continue;
    }
    const first = alignToWorkingDay(cal, task.start);
    const count = task.end !== null && task.end >= first ? listWorkingDays(cal, first, task.end).length : 1;
    duration[i] = Math.max(1, count);
    let start = first;
    for (const e of incoming[v]!) start = later(start, e.kind === 'link' ? bound(ef[e.from]!, e.lag, false) : cs[e.from]!)!;
    es[v] = start;
    ef[v] = addWorkingDays(cal, start, duration[i]! - 1);
  }

  let projectEnd: string | null = null;
  for (let i = 0; i < n; i++) if (hasSchedule[i] && !summary[i]) projectEnd = later(projectEnd, ef[i]!);

  // --- Passe arrière ---
  const ls: Array<string | null> = new Array<string | null>(2 * n).fill(null);
  const lf: Array<string | null> = new Array<string | null>(2 * n).fill(null);
  const lsCs: Array<string | null> = new Array<string | null>(n).fill(null);
  /** Dernier début autorisé à l'entrée du nœud `w`. */
  const latestIn = (w: number) => (summary[w]! ? lsCs[w]! : ls[w]!);
  for (let k = order.length - 1; k >= 0; k--) {
    const v = order[k]!;
    const i = v % n;
    if (v < n && summary[i]) { // entrée d'une parente : le plus tôt de ses enfants
      let value: string | null = null;
      for (const e of out[v]!) value = earlier(value, latestIn(e.to));
      lsCs[i] = value;
      continue;
    }
    let finish = projectEnd;
    for (const e of out[v]!) {
      if (e.kind === 'agg') finish = earlier(finish, lf[e.to]!);
      else if (e.kind === 'link') {
        const w = e.to;
        const limit = latestIn(w);
        if (limit === null) continue;
        finish = earlier(finish, addWorkingDays(cal, limit, -(milestone[w]! ? e.lag : 1 + e.lag)));
      }
    }
    lf[v] = finish;
    if (v >= n) continue;
    ls[v] = milestone[i]! ? finish : addWorkingDays(cal, finish!, -(duration[i]! - 1));
  }

  // --- Résultat ---
  const slack: Array<number | null> = new Array<number | null>(n).fill(null);
  const critical: boolean[] = new Array<boolean>(n).fill(false);
  const result: PlannedTask[] = tasks.map((t, i) => ({
    key: t.key, title: t.title, parent: parent[i]! >= 0 ? tasks[parent[i]!]!.key : null, summary: summary[i]!, milestone: milestone[i]!,
    scheduled: hasSchedule[i]!, start: t.start, end: t.end, plannedStart: null, plannedEnd: null, duration: duration[i]!, moved: false,
    slack: null, critical: false, progress: t.progress, remaining: t.remaining,
  }));
  const leafSlack = (i: number) => Math.max(0, workingDaysBetween(cal, es[i]!, ls[i]!));
  for (let i = 0; i < n; i++) {
    if (!hasSchedule[i] || summary[i]) continue;
    slack[i] = leafSlack(i);
    critical[i] = slack[i] === 0;
  }
  // Parentes : dates et marge calculées depuis les descendantes (les enfants sont traités avant leur parent).
  const rollup = (i: number): void => {
    if (!summary[i]) return;
    let min: number | null = null;
    let any = false;
    for (const c of children[i]!) {
      if (!hasSchedule[c]) continue;
      rollup(c);
      if (slack[c] !== null) min = min === null ? slack[c]! : Math.min(min, slack[c]!);
      any = any || critical[c]!;
    }
    slack[i] = min;
    critical[i] = any;
  };
  for (let i = 0; i < n; i++) if (parent[i] === -1) rollup(i);

  let moved = 0;
  for (let i = 0; i < n; i++) {
    const r = result[i]!;
    if (!hasSchedule[i]) continue;
    const node = summary[i] ? n + i : i;
    r.plannedStart = milestone[i] ? null : es[node]!;
    r.plannedEnd = ef[node]!;
    r.slack = slack[i]!;
    r.critical = critical[i]!;
    // Un jalon n'a pas de début : seule sa date de fin compte.
    r.moved = r.plannedEnd !== r.end || (!milestone[i] && r.plannedStart !== r.start);
    if (r.moved) moved++;
  }
  const criticalPath = order.filter((v) => v < n && hasSchedule[v] && !summary[v] && critical[v]).map((v) => tasks[v]!.key);
  return { tasks: result, projectEnd, criticalPath, moved };
}

function checkHierarchy(parent: number[], tasks: PlanTask[]): void {
  for (let i = 0; i < parent.length; i++) {
    let p = parent[i]!;
    for (let depth = 0; p >= 0; depth++) {
      if (depth > parent.length) throw validation([`hiérarchie circulaire autour de ${tasks[i]!.key}`]);
      p = parent[p]!;
    }
  }
}
