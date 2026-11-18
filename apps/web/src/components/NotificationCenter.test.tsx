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
let digestState: { available: boolean; enabled: boolean; hour: number; timezone: string; locale: string };
let subscriptions: Array<{ id: string; scope: string; ref: string; label: string }>;

beforeEach(() => {
  inbox = { items: [entry({ id: 'n1' }), entry({ id: 'n2', event: 'transition', payload: { from: 'ouvert', to: 'fini' }, read: true })], unread: 1 };
  prefs = { transition: true, mention: true, suspect: true, comment: true, approval: true };
  subscriptions = [];
  digestState = { available: true, enabled: false, hour: 8, timezone: 'UTC', locale: 'fr' };
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
    if (url.endsWith('/notification-digest')) {
      if (method === 'PUT') digestState = { ...digestState, ...(body as object) };
      return new Response(JSON.stringify(digestState), { status: 200 });
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
    expect(first).toHaveTextContent('Bob a commenté le ticket.');
    expect(list).toHaveTextContent('Bob a fait passer le ticket de ouvert à fini.');
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

  it('résumé quotidien : activer et choisir l’heure ; indisponible sans messagerie', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: 'Réglages' }));
    const box = await screen.findByRole('checkbox', { name: 'Recevoir un résumé quotidien' });
    expect(screen.getByRole('combobox', { name: /Heure d’envoi/ })).toBeDisabled();
    await user.click(box);
    await waitFor(() => expect(digestState.enabled).toBe(true));
    await user.selectOptions(screen.getByRole('combobox', { name: /Heure d’envoi/ }), '18');
    await waitFor(() => expect(digestState.hour).toBe(18));
    expect(digestState.timezone.length).toBeGreaterThan(0);
    expect(digestState.locale).toBe('fr');
  });

  it('résumé quotidien indisponible : message, aucune case', async () => {
    digestState.available = false;
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(await screen.findByText('Le résumé par courriel n’est pas disponible sur cette instance.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Recevoir un résumé quotidien' })).not.toBeInTheDocument();
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

describe('suivi d’un ticket', () => {
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

describe('temps réel (SSE)', () => {
  class FakeSource {
    static instances: FakeSource[] = [];
    listeners: Record<string, Array<() => void>> = {};
    closed = false;
    constructor(public url: string) { FakeSource.instances.push(this); }
    addEventListener(type: string, fn: () => void) { (this.listeners[type] ??= []).push(fn); }
    removeEventListener(type: string, fn: () => void) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
    close() { this.closed = true; }
    emit(type: string) { (this.listeners[type] ?? []).forEach((f) => f()); }
  }
  beforeEach(() => { FakeSource.instances = []; vi.stubGlobal('EventSource', FakeSource); });

  it('ouvre le flux de la personne, rafraîchit la boîte à chaque notification reçue et ferme le flux au démontage', async () => {
    const { unmount } = mount();
    await screen.findByRole('button', { name: /Notifications/ });
    expect(FakeSource.instances).toHaveLength(1);
    expect(FakeSource.instances[0]!.url).toBe('/v1/me/events');
    const before = calls.filter((c) => c.url.includes('/v1/me/notifications?limit=50')).length;
    FakeSource.instances[0]!.emit('notification');
    await waitFor(() => expect(calls.filter((c) => c.url.includes('/v1/me/notifications?limit=50')).length).toBeGreaterThan(before));
    unmount();
    expect(FakeSource.instances[0]!.closed).toBe(true);
  });
});
