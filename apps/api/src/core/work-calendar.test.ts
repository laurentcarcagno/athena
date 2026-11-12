import { describe, expect, it } from 'vitest';
import { addWorkingDays, alignToWorkingDay, defaultCalendar, isWorkingDay, listWorkingDays, workingDaysBetween, type WorkCalendar } from './work-calendar';

// 2026-11-09 est un lundi.
const cal = (holidays: string[] = [], workDays: number[] = [1, 2, 3, 4, 5]): WorkCalendar => ({ workDays: new Set(workDays), holidays: new Set(holidays) });

describe('jours ouvrés', () => {
  it('le week-end et les fériés ne sont pas ouvrés', () => {
    const c = cal(['2026-11-11']);
    expect(isWorkingDay(c, '2026-11-09')).toBe(true);
    expect(isWorkingDay(c, '2026-11-11')).toBe(false); // férié (mercredi)
    expect(isWorkingDay(c, '2026-11-14')).toBe(false); // samedi
    expect(isWorkingDay(c, '2026-11-15')).toBe(false); // dimanche
    expect(isWorkingDay(cal([], [1, 2, 3, 4, 5, 6]), '2026-11-14')).toBe(true); // semaine à six jours
  });

  it('ajoute des jours ouvrés en sautant week-ends et fériés, dans les deux sens', () => {
    const c = cal(['2026-11-11']);
    expect(addWorkingDays(c, '2026-11-09', 0)).toBe('2026-11-09');
    expect(addWorkingDays(c, '2026-11-09', 1)).toBe('2026-11-10');
    expect(addWorkingDays(c, '2026-11-09', 2)).toBe('2026-11-12'); // le 11 est férié
    expect(addWorkingDays(c, '2026-11-13', 1)).toBe('2026-11-16'); // vendredi → lundi
    expect(addWorkingDays(c, '2026-11-09', 10)).toBe('2026-11-24');
    expect(addWorkingDays(c, '2026-11-16', -1)).toBe('2026-11-13');
    expect(addWorkingDays(c, '2026-11-12', -2)).toBe('2026-11-09');
    expect(addWorkingDays(c, '2026-11-14', 1)).toBe('2026-11-16'); // départ un samedi
  });

  it('franchit les bornes de mois, d’année et d’année bissextile', () => {
    const c = defaultCalendar();
    expect(addWorkingDays(c, '2026-12-31', 1)).toBe('2027-01-01');
    expect(addWorkingDays(c, '2028-02-28', 1)).toBe('2028-02-29');
    expect(addWorkingDays(c, '2028-02-29', 1)).toBe('2028-03-01');
    expect(addWorkingDays(c, '2027-01-01', -1)).toBe('2026-12-31');
  });

  it('aligne une date sur le jour ouvré suivant ou précédent', () => {
    const c = cal(['2026-11-16']);
    expect(alignToWorkingDay(c, '2026-11-09')).toBe('2026-11-09');
    expect(alignToWorkingDay(c, '2026-11-14')).toBe('2026-11-17'); // samedi, lundi férié
    expect(alignToWorkingDay(c, '2026-11-15', -1)).toBe('2026-11-13');
  });

  it('mesure l’écart en jours ouvrés, de signe contraire dans l’autre sens, cohérent avec l’ajout', () => {
    const c = cal(['2026-11-11']);
    expect(workingDaysBetween(c, '2026-11-09', '2026-11-09')).toBe(0);
    expect(workingDaysBetween(c, '2026-11-09', '2026-11-13')).toBe(3); // 10, 12, 13
    expect(workingDaysBetween(c, '2026-11-13', '2026-11-09')).toBe(-3);
    expect(workingDaysBetween(c, '2026-11-13', '2026-11-16')).toBe(1);
    expect(workingDaysBetween(c, '2026-11-13', '2026-11-15')).toBe(0); // seulement le week-end
    for (const n of [1, 4, 9, -3, -7]) expect(workingDaysBetween(c, '2026-11-12', addWorkingDays(c, '2026-11-12', n))).toBe(n);
  });

  it('liste les jours ouvrés d’un intervalle, bornes incluses', () => {
    const c = cal(['2026-11-11']);
    expect(listWorkingDays(c, '2026-11-09', '2026-11-16')).toEqual(['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13', '2026-11-16']);
    expect(listWorkingDays(c, '2026-11-14', '2026-11-15')).toEqual([]);
    expect(listWorkingDays(c, '2026-11-16', '2026-11-09')).toEqual([]);
  });

  it('refuse une date invalide, un nombre non entier et un calendrier sans jour travaillé', () => {
    expect(() => isWorkingDay(defaultCalendar(), '2026-02-30')).toThrow(RangeError);
    expect(() => isWorkingDay(defaultCalendar(), 'demain')).toThrow(RangeError);
    expect(() => addWorkingDays(defaultCalendar(), '2026-11-09', 1.5)).toThrow(RangeError);
    expect(() => addWorkingDays(cal([], []), '2026-11-09', 1)).toThrow(/aucun jour travaillé/);
  });
});
