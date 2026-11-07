import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter, describe as describeEntry, type NotificationEntry } from './NotificationCenter';
import { SubscribeToggle } from './SubscribeToggle';

const entry = (over: Partial<NotificationEntry>): NotificationEntry => ({
  id: 'n1', event: 'comment', project: 'ARI', key: 'ARI-BUG-0001', actor: 'bob', actorName: 'Bob', payload: {}, read: false, createdAt: '2026-11-07T09:00:00.000Z', ...over,
});

let inbox: { items: NotificationEntry[]; unread: number };
let calls: Array<{ method: string; url: string; body: unknown }>;
let prefs: Record<string, boolean>;
let subscriptions: Array<{ id: string; scope: string; ref: string; label: string }>;

beforeEach(() => {
  inbox = { items: [entry({ id: 'n1' }), entry({ id: 'n2', event: 'transition', payload: { from: 'ouvert', to: 'fini' }, read: true })], unread: 1 };
  prefs = { transition: true, mention: true, suspect: true, comment: true, approval: true };
  subscriptions = [];
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (method === 'POST' && url.endsWith('/notifications/read')) {
      const ids = (body as { ids?: string[]; all?: boolean; read: boolean });
      inbox.items = inbox.items.map((n) => (ids.all || ids.ids?.includes(n.id) ? { ...n, read: ids.read } : n));
      inbox.unread = inbox.items.filter((n) => !n.read).length;
      return new Response(JSON.stringify({ updated: 1 }), { status: 200 });
    }
    if (url.includes('/notifications')) return new Response(JSON.stringify(inbox), { status: 200 });
    if (url.endsWith('/notification-prefs')) return new Response(JSON.stringify(prefs), { status: 200 });
    if (method === 'PUT' && url.includes('/notification-prefs/')) { prefs[url.split('/').pop()!] = (body as { enabled: boolean }).enabled; return new Response('{}', { status: 200 }); }
    if (method === 'POST' && url.endsWith('/subscriptions')) { const s = { id: 's1', scope: (body as { scope: string }).scope, ref: (body as { ref: string }).ref, label: (body as { ref: string }).ref }; subscriptions.push(s); return new Response(JSON.stringify(s), { status: 201 }); }
    if (method === 'DELETE') { subscriptions = []; return new Response(null, { status: 204 }); }
    if (url.endsWith('/subscriptions')) return new Response(JSON.stringify(subscriptions), { status: 200 });
    return new Response('{}', { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const mount = () => render(<ToastProvider><MemoryRouter><NotificationCenter /></MemoryRouter></ToastProvider>);
const axeViolations = async (container: HTMLElement) => (await axe.run(container, {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
})).violations.map((v) => `${v.id} : ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' ; ')})`);

describe('centre de notifications', () => {
  it('le bouton annonce le nombre de non lues et la liste s’ouvre au clavier', async () => {
    const user = userEvent.setup();
    mount();
    const button = await screen.findByRole('button', { name: 'Notifications, 1 non lue' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    button.focus();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const list = await screen.findByRole('list', { name: 'Liste des notifications' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const first = within(list).getAllByRole('listitem')[0]!;
    expect(within(first).getByRole('link', { name: 'ARI-BUG-0001' })).toHaveClass('ath-mono');
    expect(within(first).getByText('Non lu')).toBeInTheDocument();
    expect(first).toHaveTextContent('Bob a commenté l’item.');
    expect(list).toHaveTextContent('Bob a fait passer l’item de ouvert à fini.');
  });

  it('Échap referme la liste et rend le focus au bouton', async () => {
    const user = userEvent.setup();
    mount();
    const button = await screen.findByRole('button', { name: /Notifications/ });
    await user.click(button);
    await screen.findByRole('list', { name: 'Liste des notifications' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: 'Liste des notifications' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('marque lu, non lu et tout lu ; le compteur suit', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    const first = (await screen.findAllByRole('listitem'))[0]!;
    await user.click(within(first).getByRole('button', { name: 'Marquer comme lu' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument());
    expect(calls.some((c) => c.method === 'POST' && JSON.stringify(c.body) === JSON.stringify({ ids: ['n1'], read: true }))).toBe(true);
    const second = (await screen.findAllByRole('listitem'))[1]!;
    await user.click(within(second).getByRole('button', { name: 'Marquer comme non lu' }));
    await screen.findByRole('button', { name: 'Notifications, 1 non lue' });
    await user.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));
    await screen.findByRole('button', { name: 'Notifications' });
    expect(calls.some((c) => c.method === 'POST' && JSON.stringify(c.body) === JSON.stringify({ all: true, read: true }))).toBe(true);
  });

  it('les réglages par événement s’enregistrent', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: 'Réglages' }));
    const box = await screen.findByRole('checkbox', { name: 'Commentaire' });
    await waitFor(() => expect(box).not.toBeDisabled());
    await user.click(box);
    await waitFor(() => expect(prefs['comment']).toBe(false));
    expect(box).not.toBeChecked();
  });

  it('sans notification : message vide', async () => {
    inbox = { items: [], unread: 0 };
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('Aucune notification.')).toBeInTheDocument();
  });

  it('axe : bouton, liste et réglages sans violation', async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: 'Réglages' }));
    await screen.findByRole('checkbox', { name: 'Commentaire' });
    expect(await axeViolations(container)).toEqual([]);
  });

  it('phrases par événement, sans valeur de champ', () => {
    expect(describeEntry(entry({ event: 'suspect', payload: { cause: 'ARI-REQ-0002' } }))).toBe('Lien suspect : Bob a modifié ARI-REQ-0002.');
    expect(describeEntry(entry({ event: 'mention' }))).toBe('Bob vous a mentionné.');
  });
});

describe('suivi d’un item', () => {
  it('suivre puis ne plus suivre', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><SubscribeToggle project="ARI" scope="item" target="ARI-BUG-0001" /></ToastProvider>);
    const follow = await screen.findByRole('button', { name: 'Suivre' });
    expect(follow).toHaveAttribute('aria-pressed', 'false');
    await user.click(follow);
    const unfollow = await screen.findByRole('button', { name: 'Ne plus suivre' });
    expect(unfollow).toHaveAttribute('aria-pressed', 'true');
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ scope: 'item', ref: 'ARI-BUG-0001' });
    await user.click(unfollow);
    await screen.findByRole('button', { name: 'Suivre' });
  });
});
