import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Timeline } from './components/ReleaseCharts';
import { formatSpan, relativeSpan } from './lib/dates';
import { notStarted } from './pages/BacklogPage';

/** T-0150 (ADR-0005) : dates en clair, sprint à venir, frise des versions datée avec repère du jour. */
const day = (iso: string) => new Date(`${iso}T12:00:00`);

it('période et délai en clair', () => {
  expect(formatSpan('2026-11-20', '2026-12-03')).toBe('du 20 nov. au 3 déc. 2026');
  expect(relativeSpan('2026-11-20', '2026-12-03', day('2026-11-11'))).toBe('commence dans 9 jours');
  expect(relativeSpan('2026-11-01', '2026-11-14', day('2026-11-11'))).toBe('se termine dans 3 jours');
  expect(relativeSpan('2026-11-01', '2026-11-11', day('2026-11-11'))).toBe('se termine aujourd’hui');
  expect(relativeSpan('2026-10-01', '2026-10-14', day('2026-11-11'))).toBe('terminée');
});

it('un sprint dont la date de début est à venir n’a pas encore commencé', () => {
  expect(notStarted('2999-01-01')).toBe(true);
  expect(notStarted('2000-01-01')).toBe(false);
  expect(notStarted(null)).toBe(false);
});

it('la frise nomme chaque version, ses dates et son avancement, avec les mois et le repère du jour', () => {
  const { container } = render(<Timeline label="Calendrier des versions" today={day('2026-11-11')} todayLabel="aujourd’hui"
    releases={[{ id: 'v1', name: 'v1.0', startsOn: '2026-10-10', endsOn: '2026-12-09', progress: 0 }]} counts={{ v1: '0 / 2 tickets terminés' }} />);
  expect(screen.getByRole('img', { name: 'Calendrier des versions' })).toBeTruthy();
  const text = container.textContent ?? '';
  expect(text).toContain('v1.0');
  expect(text).toContain('10 oct. → 9 déc.');
  expect(text).toContain('0 / 2 tickets terminés');
  expect(text).toMatch(/oct\. 2026.*nov\. 2026.*déc\. 2026/);
  expect(text).toContain('aujourd’hui');
  expect(container.querySelector('.ath-timeline__today')).not.toBeNull();
});
