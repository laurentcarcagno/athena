import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@athena/ui';
import { ProjectInfoCard } from './ProjectInfoCard';

const meta = { plannedStart: '2026-03-01', plannedEnd: '2026-12-31', sponsorSubject: 'sp', sponsorName: 'Sam Sponsor', description: 'Programme pilote', capacityGranularity: null };
const calls: Array<{ method: string; url: string; body?: string }> = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body as string | undefined });
    if (String(url).endsWith('/v1/users')) return new Response(JSON.stringify([{ subject: 'sp', username: 'sp', displayName: 'Sam Sponsor' }]), { status: 200 });
    return new Response(JSON.stringify(meta), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const show = (canManage: boolean) => render(<MemoryRouter><ToastProvider><ProjectInfoCard project="MET" canManage={canManage} /></ToastProvider></MemoryRouter>);

describe('carte Informations (B10)', () => {
  it('affiche dates, sponsor et description ; pas de bouton pour qui ne gère pas le projet', async () => {
    show(false);
    expect(await screen.findByText('Sam Sponsor')).toBeInTheDocument();
    expect(screen.getByText('Programme pilote')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
  });

  it('le chef de projet modifie ; une fin avant le début bloque l’envoi', async () => {
    show(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    const end = screen.getByLabelText('Fin prévue');
    await userEvent.clear(end);
    await userEvent.type(end, '2026-01-01');
    expect(screen.getByText('La fin prévue ne peut pas précéder le début prévu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await userEvent.clear(end);
    await userEvent.type(end, '2027-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toContain('/v1/projects/MET/meta');
    expect(JSON.parse(patch!.body!)).toMatchObject({ plannedEnd: '2027-01-01', plannedStart: '2026-03-01' });
  });
});
