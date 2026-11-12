import { describe, expect, it } from 'vitest';
import { DomainError } from '../core/errors';
import type { WorkCalendar } from '../core/work-calendar';
import { computeSchedule, type PlanLink, type PlanTask } from './schedule-engine';

// Lundi 2026-11-09 ; le mercredi 11 est férié.
const cal: WorkCalendar = { workDays: new Set([1, 2, 3, 4, 5]), holidays: new Set(['2026-11-11']) };
const task = (key: string, start: string | null, end: string | null, parent: string | null = null): PlanTask =>
  ({ key, title: key, start, end, progress: null, remaining: null, parent });
const link = (from: string, to: string, lag = 0): PlanLink => ({ from, to, lag });
const by = (s: ReturnType<typeof computeSchedule>, key: string) => s.tasks.find((t) => t.key === key)!;

describe('moteur de dates : planning de référence', () => {
  const tasks = [
    task('A', '2026-11-09', '2026-11-10'), // 2 jours
    task('B', '2026-11-10', '2026-11-10'), // 1 jour, saisi trop tôt
    task('C', '2026-11-09', '2026-11-13'), // 4 jours ouvrés (le 11 est férié)
    task('D', '2026-11-09', '2026-11-10'), // indépendante
    task('M', null, '2026-11-19'), // jalon
  ];
  const links = [link('A', 'B'), link('B', 'C', 1), link('C', 'M')];
  const s = computeSchedule(tasks, links, cal);

  it('repousse chaque tâche après ses prédécesseurs, au jour près, férié compris', () => {
    expect([by(s, 'A').plannedStart, by(s, 'A').plannedEnd]).toEqual(['2026-11-09', '2026-11-10']);
    expect([by(s, 'B').plannedStart, by(s, 'B').plannedEnd]).toEqual(['2026-11-12', '2026-11-12']); // le 11 est férié
    expect([by(s, 'C').plannedStart, by(s, 'C').plannedEnd]).toEqual(['2026-11-16', '2026-11-19']); // 1 jour de décalage
    expect([by(s, 'M').plannedStart, by(s, 'M').plannedEnd]).toEqual([null, '2026-11-19']);
    expect(s.projectEnd).toBe('2026-11-19');
  });

  it('compte la durée en jours ouvrés et signale ce qui bouge', () => {
    expect(tasks.map((t) => by(s, t.key).duration)).toEqual([2, 1, 4, 2, 0]);
    expect(s.tasks.filter((t) => t.moved).map((t) => t.key)).toEqual(['B', 'C']);
    expect(s.moved).toBe(2);
  });

  it('calcule la marge et le chemin critique', () => {
    expect(s.tasks.map((t) => [t.key, t.slack])).toEqual([['A', 0], ['B', 0], ['C', 0], ['D', 6], ['M', 0]]);
    expect(s.criticalPath).toEqual(['A', 'B', 'C', 'M']);
    expect(by(s, 'D').critical).toBe(false);
  });

  it('ne fait jamais avancer une tâche : une date saisie plus tard est conservée', () => {
    const later = computeSchedule([task('A', '2026-11-09', '2026-11-09'), task('B', '2026-11-20', '2026-11-20')], [link('A', 'B')], cal);
    expect([by(later, 'B').plannedStart, by(later, 'B').moved]).toEqual(['2026-11-20', false]);
    expect(by(later, 'A').slack).toBe(7); // A peut glisser jusqu'au 19, veille du 20 (jours ouvrés 10, 12, 13, 16, 17, 18, 19)
  });

  it('un décalage négatif permet le chevauchement, un nul enchaîne le lendemain ouvré', () => {
    const overlap = computeSchedule([task('A', '2026-11-09', '2026-11-10'), task('B', '2026-11-09', '2026-11-09')], [link('A', 'B', -1)], cal);
    expect(by(overlap, 'B').plannedStart).toBe('2026-11-10'); // le jour même de la fin de A
    const chain = computeSchedule([task('A', '2026-11-13', '2026-11-13'), task('B', '2026-11-09', '2026-11-09')], [link('A', 'B')], cal);
    expect(by(chain, 'B').plannedStart).toBe('2026-11-16'); // vendredi → lundi
  });

  it('cale une date saisie un jour non ouvré sur le jour ouvré suivant', () => {
    const weekend = computeSchedule([task('A', '2026-11-14', '2026-11-14')], [], cal);
    expect([by(weekend, 'A').plannedStart, by(weekend, 'A').moved]).toEqual(['2026-11-16', true]);
  });

  it('laisse de côté une tâche sans date et les liens qui la touchent', () => {
    const r = computeSchedule([task('A', '2026-11-09', '2026-11-09'), task('Z', null, null)], [link('A', 'Z'), link('Z', 'A')], cal);
    expect(by(r, 'Z')).toMatchObject({ scheduled: false, plannedStart: null, slack: null, critical: false });
    expect(by(r, 'A').scheduled).toBe(true);
  });
});

describe('moteur de dates : tâches parentes (D3)', () => {
  it('calcule les dates d’une parente depuis ses enfants, marge et criticité comprises', () => {
    const s = computeSchedule([
      task('P', null, null),
      task('X', '2026-11-09', '2026-11-10', 'P'),
      task('Y', '2026-11-12', '2026-11-13', 'P'),
    ], [link('X', 'Y')], cal);
    expect(by(s, 'P')).toMatchObject({ summary: true, plannedStart: '2026-11-09', plannedEnd: '2026-11-13', slack: 0, critical: true, moved: true });
  });

  it('un lien posé sur la parente borne ses descendantes ; un lien depuis la parente part de sa fin', () => {
    const s = computeSchedule([
      task('Q', '2026-11-09', '2026-11-09'),
      task('P', null, null),
      task('X', '2026-11-09', '2026-11-10', 'P'),
      task('Y', '2026-11-12', '2026-11-13', 'P'),
      task('R', '2026-11-09', '2026-11-09'),
    ], [link('Q', 'P'), link('P', 'R')], cal);
    expect([by(s, 'X').plannedStart, by(s, 'X').plannedEnd]).toEqual(['2026-11-10', '2026-11-12']);
    expect([by(s, 'Y').plannedStart, by(s, 'Y').plannedEnd]).toEqual(['2026-11-12', '2026-11-13']);
    expect([by(s, 'P').plannedStart, by(s, 'P').plannedEnd]).toEqual(['2026-11-10', '2026-11-13']);
    expect(by(s, 'R').plannedStart).toBe('2026-11-16'); // lendemain ouvré de la fin de P
  });

  it('une parente dont les enfants n’ont aucune date reste non planifiée', () => {
    expect(by(computeSchedule([task('P', null, null), task('X', null, null, 'P')], [], cal), 'P').scheduled).toBe(false);
  });
});

describe('moteur de dates : refus', () => {
  const code = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return e instanceof DomainError ? `${e.code}: ${e.details.join(' ')}` : String(e); } };

  it('refuse un cycle de dépendances en nommant les tâches', () => {
    const t = [task('A', '2026-11-09', '2026-11-09'), task('B', '2026-11-09', '2026-11-09'), task('C', '2026-11-09', '2026-11-09')];
    expect(code(() => computeSchedule(t, [link('A', 'B'), link('B', 'C'), link('C', 'A')], cal))).toBe('validation: dépendances circulaires entre : A, B, C');
  });

  it('refuse un lien entre une parente et sa propre descendante (cycle)', () => {
    const t = [task('P', null, null), task('X', '2026-11-09', '2026-11-09', 'P')];
    expect(code(() => computeSchedule(t, [link('X', 'P')], cal))).toMatch(/^validation: dépendances circulaires/);
  });

  it('refuse une hiérarchie circulaire', () => {
    const t = [task('A', '2026-11-09', '2026-11-09', 'B'), task('B', '2026-11-09', '2026-11-09', 'A')];
    expect(code(() => computeSchedule(t, [], cal))).toMatch(/^validation: hiérarchie circulaire/);
  });
});

describe('moteur de dates : performance', () => {
  it('500 tâches et 800 liens se calculent en moins de 200 ms', () => {
    let seed = 7;
    const rand = (max: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % max; };
    const base = Date.parse('2026-01-05T00:00:00Z');
    const iso = (offset: number) => new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
    const tasks = Array.from({ length: 500 }, (_, i) => {
      const start = rand(200);
      return task(`T${i}`, iso(start), iso(start + rand(15)), i >= 20 && i % 5 === 0 ? `T${rand(20)}` : null);
    });
    const links: PlanLink[] = [];
    while (links.length < 800) {
      const a = 20 + rand(479); // hors des 20 parentes possibles : un lien parente → enfant serait un vrai cycle
      const b = a + 1 + rand(499 - a);
      links.push(link(`T${a}`, `T${b}`, rand(3) - 1));
    }
    const holidays = new Set(Array.from({ length: 12 }, (_, i) => iso(i * 30)));
    const calendar: WorkCalendar = { workDays: new Set([1, 2, 3, 4, 5]), holidays };
    computeSchedule(tasks, links, calendar); // échauffement
    const times = Array.from({ length: 3 }, () => { const t0 = performance.now(); computeSchedule(tasks, links, calendar); return performance.now() - t0; });
    expect(Math.min(...times)).toBeLessThan(200);
    const s = computeSchedule(tasks, links, calendar);
    expect(s.tasks.every((t) => !t.scheduled || (t.slack ?? -1) >= 0)).toBe(true);
    expect(s.criticalPath.length).toBeGreaterThan(0);
  });
});
