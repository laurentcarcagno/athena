import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ReleaseCard, VelocityCard } from './components/ProgressCards';

/** T-0155 : prochaine version (jours restants, tickets à terminer, rythme) ; vélocité sans sprint clos. */
const stub = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
afterEach(() => vi.unstubAllGlobals());

it('prochaine version : 28 jours restants, 2 tickets à terminer, en retard sur le rythme', async () => {
  stub([
    { id: 'old', name: 'v0.9', startsOn: '2026-08-01', endsOn: '2026-09-01', state: 'released', items: 3, doneItems: 3, progress: 1 },
    { id: 'v1', name: 'v1.0', startsOn: '2026-10-10', endsOn: '2026-12-09', state: 'planned', items: 2, doneItems: 0, progress: 0 },
  ]);
  render(<MemoryRouter><ReleaseCard project="SAT1" today={new Date(2026, 10, 11)} /></MemoryRouter>);
  expect(await screen.findByText('v1.0')).toBeInTheDocument();
  expect(screen.getByText('28')).toBeInTheDocument();
  expect(screen.getByText('jours restants')).toBeInTheDocument();
  expect(screen.getByText('tickets à terminer')).toBeInTheDocument();
  expect(screen.getByText(/0 % terminé · 53 % du temps écoulé/)).toBeInTheDocument();
  expect(screen.getByText('en retard sur le rythme')).toHaveClass('ath-text-warning');
});

it('vélocité sans sprint clos : un message utile et l’accès au backlog, pas un « 0 point »', async () => {
  stub({ sprints: [{ sprint: 'Sprint 1', committed: 0, completed: 0 }], average: 0, forecast: 0 });
  render(<MemoryRouter><VelocityCard project="SAT1" /></MemoryRouter>);
  expect(await screen.findByText(/La vélocité apparaîtra à la clôture du premier sprint/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ouvrir le backlog' })).toHaveAttribute('href', '/p/SAT1/backlog');
  expect(screen.queryByText(/0 point/)).toBeNull();
});
