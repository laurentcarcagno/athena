import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../api';
import { MyWorkPage } from '../pages/MyWorkPage';
import { MentionInput, MentionText } from './MentionInput';

const people = [{ username: 'bob', displayName: 'Bob Durand' }, { username: 'carol', displayName: 'Carol Petit' }];
let queries: string[];

beforeEach(() => {
  queries = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/mentionable')) {
      const q = new URL(url, 'http://x').searchParams.get('q') ?? '';
      queries.push(q);
      return new Response(JSON.stringify(people.filter((p) => p.username.startsWith(q.toLowerCase()))), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="comment">Commentaire</label>
      <MentionInput id="comment" project="MEN" itemKey="MEN-REQ-0001" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const axeViolations = async (container: HTMLElement) => (await axe.run(container, {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
})).violations.map((v) => `${v.id} : ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' ; ')})`);

describe('saisie avec mentions', () => {
  it('@ propose les personnes autorisées ; flèches et Entrée insèrent l’identifiant', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Commentaire' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    await user.click(box);
    await user.keyboard('Relis @');
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Bob Durand @bob', 'Carol Petit @carol']);
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', options[0]!.id);
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('Relis @carol');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(box).toHaveFocus();
  });

  it('la saisie affine la liste ; Échap la ferme sans toucher au texte', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox');
    await user.click(box);
    await user.keyboard('@bo');
    await screen.findByRole('option', { name: /Bob/ });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(queries.at(-1)).toBe('bo');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('@bo');
  });

  it('pas de liste dans une adresse de courriel, et un clic choisit une personne', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox');
    await user.click(box);
    await user.keyboard('écrire à x@bo');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await user.clear(box);
    await user.keyboard('Salut @c');
    await user.click(await screen.findByRole('option', { name: /Carol/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('Salut @carol');
  });

  it('axe : champ avec liste ouverte', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('@');
    await screen.findAllByRole('option');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('affichage d’un commentaire', () => {
  it('met les mentions en évidence et n’interprète aucun HTML', () => {
    const { container } = render(<MentionText body={'<img src=x onerror=alert(1)> merci @bob.\n<script>alert(2)</script> écrire à a@b.lan'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    const marks = [...container.querySelectorAll('.ath-mention')].map((m) => m.textContent);
    expect(marks).toEqual(['@bob']);
    expect(container.textContent).toContain('<img src=x onerror=alert(1)> merci @bob.');
    expect(container.textContent).toContain('écrire à a@b.lan');
    expect(container.querySelector('.ath-mention')).toHaveClass('ath-mono');
  });
});

describe('Mon travail : mentions', () => {
  const session: Session = { authenticated: true, user: { username: 'user.dev', name: 'User Dev', email: null, roles: ['athena-user'], groups: [] } };

  it('liste les mentions reçues, marque la lecture au clic', async () => {
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url });
      if (url.endsWith('/v1/projects')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes('/v1/me/notifications?event=mention')) return new Response(JSON.stringify({ unread: 1, items: [{ id: 'n1', event: 'mention', project: 'ARI', key: 'ARI-BUG-0001', actor: 'a', actorName: 'Alice', payload: {}, read: false, createdAt: '2026-11-07T09:30:00.000Z' }] }), { status: 200 });
      return new Response('{}', { status: 200 });
    }));
    const user = userEvent.setup();
    const { container } = render(<ToastProvider><MemoryRouter><MyWorkPage session={session} /></MemoryRouter></ToastProvider>);
    const link = await screen.findByRole('link', { name: 'ARI-BUG-0001' });
    expect(link).toHaveAttribute('href', '/p/ARI/a/ARI-BUG-0001');
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Non lue')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
    await user.click(link);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/notifications/read'))).toBe(true));
  });
});
