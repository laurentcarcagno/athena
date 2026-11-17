import { describe, expect, it } from 'vitest';
import { defaultCalendar } from '../core/work-calendar';
import { allocationMinutes, capacityMinutes, formatMinutes, isoWeek, loadLevel, parseDuration, periodsBetween } from './capacity';

// Calendrier de référence : lundi au vendredi, un jour férié (mercredi 11 novembre 2026).
const cal = { ...defaultCalendar(), holidays: new Set(['2026-11-11']) };
const WORKDAY = 468; // 7 h 48
const month = periodsBetween('2026-11-01', '2026-11-30', 'month')[0]!;

describe('périodes', () => {
  it('semaines ISO du lundi au dimanche, mois civils complets', () => {
    expect(periodsBetween('2026-11-18', '2026-12-01', 'week').map((p) => [p.key, p.from, p.to])).toEqual([['2026-W47', '2026-11-16', '2026-11-22'], ['2026-W48', '2026-11-23', '2026-11-29'], ['2026-W49', '2026-11-30', '2026-12-06']]);
    expect(periodsBetween('2026-11-15', '2027-01-02', 'month').map((p) => p.key)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
  });
});

describe('capacité (critère B35 : calcul manuel de référence)', () => {
  it('personne à 80 %, un jour férié et deux jours d’absence dans le mois : 21 jours ouvrés − 1 férié − 2 absences = 18 jours', () => {
    // novembre 2026 : 21 jours ouvrés (lundi au vendredi), moins le 11 férié = 20 ; moins 2 jours d'absence = 18 jours à 80 % de 7 h 48
    const minutes = capacityMinutes(cal, month, WORKDAY, [{ from: '2026-01-01', to: null, ratio: 0.8, workdayMinutes: null }], [{ from: '2026-11-19', to: '2026-11-20', halfDay: false }]);
    expect(minutes).toBe(Math.round(18 * WORKDAY * 0.8));
    expect(formatMinutes(minutes)).toBe('112 h 19');
  });
  it('demi-journée d’absence, absence un week-end ou un jour férié : sans effet ou à moitié', () => {
    const none = capacityMinutes(cal, month, WORKDAY, [], []);
    expect(none).toBe(20 * WORKDAY);
    expect(capacityMinutes(cal, month, WORKDAY, [], [{ from: '2026-11-11', to: '2026-11-11', halfDay: false }])).toBe(none); // férié
    expect(capacityMinutes(cal, month, WORKDAY, [], [{ from: '2026-11-14', to: '2026-11-15', halfDay: false }])).toBe(none); // week-end
    expect(capacityMinutes(cal, month, WORKDAY, [], [{ from: '2026-11-20', to: '2026-11-20', halfDay: true }])).toBe(Math.round(19.5 * WORKDAY));
  });
  it('journée propre à la personne et changement de ratio en cours de mois', () => {
    const av = [{ from: '2026-01-01', to: '2026-11-15', ratio: 1, workdayMinutes: 420 }, { from: '2026-11-16', to: null, ratio: 0.5, workdayMinutes: 420 }];
    // jours ouvrés avant le 16 : 2, 3, 4, 5, 6, 9, 10, 12, 13 (11 férié) = 9 ; à partir du 16 : 11
    expect(capacityMinutes(cal, month, WORKDAY, av, [])).toBe(9 * 420 + Math.round(11 * 420 * 0.5));
  });
});

describe('charge planifiée, conversion semaine et mois, paliers, durées', () => {
  it('une allocation de 0,5 ETP donne la même charge sur le mois en semaines puis en mois (critère B35)', () => {
    const span = { from: '2026-10-26', to: '2026-12-04', fte: 0.5 };
    const weeks = periodsBetween('2026-11-01', '2026-11-30', 'week');
    // somme des semaines restreinte au mois : on compte les jours ouvrés de novembre seulement
    const inNovember = weeks.reduce((n, w) => n + allocationMinutes(cal, { key: w.key, from: w.from < '2026-11-01' ? '2026-11-01' : w.from, to: w.to > '2026-11-30' ? '2026-11-30' : w.to }, WORKDAY, span), 0);
    expect(inNovember).toBe(allocationMinutes(cal, month, WORKDAY, span));
    expect(allocationMinutes(cal, month, WORKDAY, span)).toBe(Math.round(20 * WORKDAY * 0.5));
  });
  it('paliers : sous-charge, normal, tendu, surcharge (seuil réglable)', () => {
    expect([30, 60, 100, 105, 111].map((l) => loadLevel(l, 100))).toEqual(['free', 'normal', 'normal', 'tight', 'overload']);
    expect(loadLevel(120, 100, 130)).toBe('tight');
    expect(loadLevel(10, 0)).toBe('overload');
    expect(loadLevel(0, 0)).toBe('free');
  });
  it('durées en heures et minutes', () => {
    expect(formatMinutes(468)).toBe('7 h 48');
    expect([parseDuration('7 h 48'), parseDuration('7h48'), parseDuration('7:48'), parseDuration('8 h'), parseDuration('0 h 00'), parseDuration('25 h'), parseDuration('7 h 75'), parseDuration('x')]).toEqual([468, 468, 468, 480, null, null, null, null]);
  });
});
