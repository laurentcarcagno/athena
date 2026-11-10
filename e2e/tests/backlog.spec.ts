import { expect, test, type Page } from '@playwright/test';

// T-0116 : un sprint se planifie sans quitter la page Backlog, au clavier compris.

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test('backlog : réordonner, ajouter au sprint, démarrer, burndown, clore — sans quitter la page', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  // Projet à part : un tracker Tâche dans ARI changerait ce que voient les autres parcours.
  await request.post('http://127.0.0.1:3001/v1/projects', { headers, data: { key: 'AGL', name: 'Agile e2e' } }); // 409 si déjà créé
  const api = 'http://127.0.0.1:3001/v1/projects/AGL';
  await request.post(`${api}/trackers`, { headers, data: {
    key: 'TSK', name: 'Tâches', typeKey: 'task',
    fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate' }],
    statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }, { key: 'done', name: 'Terminé', category: 'done' }],
    transitions: [{ name: 'Terminer', from: 'todo', to: 'done' }],
  } }); // 409 si déjà créé : sans importance
  const keys: string[] = [];
  for (const title of ['Tâche alpha', 'Tâche bêta']) {
    const created = await request.post(`${api}/trackers/TSK/artifacts`, { headers, data: { values: { title, points: 3 } } });
    expect(created.status()).toBe(201);
    keys.push((await created.json()).key as string);
  }
  const name = `Sprint e2e ${Date.now()}`;
  expect((await request.post(`${api}/sprints`, { headers, data: { name, startsOn: day(-1), endsOn: day(6) } })).status()).toBeLessThan(300);

  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto('/p/AGL/backlog');
  const backlog = page.getByRole('list', { name: 'Backlog' });
  await expect(backlog.getByRole('link', { name: keys[1]! })).toBeVisible();

  // Réordonner au clavier : la seconde tâche passe avant la première.
  const before = await backlog.getByRole('listitem').allTextContents();
  await page.getByRole('button', { name: `Monter ${keys[1]}` }).focus();
  await page.keyboard.press('Enter');
  const index = async () => (await backlog.getByRole('listitem').allTextContents()).findIndex((t) => t.includes(keys[1]!));
  await expect.poll(index).toBeLessThan(before.findIndex((t) => t.includes(keys[1]!)));
  await expect(page.getByRole('button', { name: `Descendre ${keys[1]}` })).toBeFocused(); // en tête : « Monter » est désactivé

  // Ajouter au sprint au clavier, démarrer, voir le burndown, clore : tout sur la page.
  await page.getByLabel(`Ajouter ${keys[0]} au sprint`).selectOption({ label: name });
  await page.getByLabel(`Ajouter ${keys[0]} au sprint`).locator('xpath=ancestor::li').getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByRole('list', { name })).toContainText(keys[0]!);
  await page.getByRole('list', { name }).locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Démarrer' }).click();
  await expect(page.getByRole('img', { name: /Burndown/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clore' }).click();
  await expect(page.getByText(/Sprint clos : 1 ticket\(s\) non terminé\(s\) reporté\(s\)\./)).toBeVisible();
  await expect(backlog.getByRole('link', { name: keys[0]! })).toBeVisible();
  await expect(page).toHaveURL(/\/p\/AGL\/backlog$/);
});
