import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutomationsTab, ruleBody } from './components/AutomationEditor';

/** T-0145 (ADR-0005) : créer une automatisation depuis l'interface, à partir d'un modèle ou de zéro. */
let rules: unknown[];
let posts: unknown[];
beforeEach(() => {
  rules = [];
  posts = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (init?.method === 'POST' && /\/automations$/.test(input)) {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      rules.push({ id: 'r1', enabled: true, ...body });
      return new Response(JSON.stringify({ id: 'r1' }), { status: 200 });
    }
    return new Response(JSON.stringify(rules), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<ToastProvider><AutomationsTab project="SAT1" /></ToastProvider>);

it('sans règle : explication, bouton de création et trois modèles', async () => {
  open();
  expect(screen.getByText(/Une automatisation agit seule/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Nouvelle automatisation' })).toBeTruthy();
  expect(await screen.findAllByRole('button', { name: /^Utiliser le modèle/ })).toHaveLength(3);
});

it('un modèle préremplit le formulaire ; la création envoie le schéma de l’API et la règle apparaît active', async () => {
  open();
  await userEvent.click(await screen.findByRole('button', { name: 'Utiliser le modèle : Relance des tickets bloqués' }));
  expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('Relance des tickets bloqués');
  expect((screen.getByLabelText('Quand') as HTMLSelectElement).value).toBe('schedule');
  expect((screen.getByLabelText('Fréquence') as HTMLSelectElement).value).toBe('1440');
  await userEvent.click(screen.getByRole('button', { name: 'Créer l’automatisation' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toEqual({ name: 'Relance des tickets bloqués', trigger: 'schedule', everyMinutes: 1440, condition: 'status = blocked', actions: [{ type: 'comment', body: 'Toujours bloqué : à traiter au prochain point d’équipe.' }] });
  const row = (await screen.findByRole('cell', { name: 'Relance des tickets bloqués' })).closest('tr')!;
  expect(within(row).getByText('À intervalle régulier')).toBeTruthy();
  expect(within(row).getByText('Active')).toBeTruthy();
});

it('de zéro : le bouton reste inactif tant qu’un champ manque ; une règle planifiée exige une condition', async () => {
  open();
  await userEvent.click(screen.getByRole('button', { name: 'Nouvelle automatisation' }));
  const create = screen.getByRole('button', { name: 'Créer l’automatisation' });
  expect(create).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Nom'), 'Accusé');
  await userEvent.type(screen.getByLabelText('Texte du commentaire'), 'Bien reçu.');
  expect(create).toBeEnabled();
  await userEvent.selectOptions(screen.getByLabelText('Quand'), 'schedule');
  expect(create).toBeDisabled();
  expect(screen.getByLabelText('Si (condition ATQL, obligatoire)')).toBeTruthy();
});

it('une modification de champ devient { type: update, values }', () => {
  expect(ruleBody({ name: ' Escalade ', trigger: 'artifact.created', everyMinutes: 60, condition: '', actions: [{ type: 'update', field: 'assignee ', value: 'astreinte' }, { type: 'transition', name: 'Démarrer' }] }))
    .toEqual({ name: 'Escalade', trigger: 'artifact.created', condition: '', actions: [{ type: 'update', values: { assignee: 'astreinte' } }, { type: 'transition', name: 'Démarrer' }] });
});
