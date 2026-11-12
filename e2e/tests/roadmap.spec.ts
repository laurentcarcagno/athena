import { expect, test, type Page } from '@playwright/test';

// T-0117 : avancement d'une version en 1 clic depuis le rail ; ajout d'un ticket et publication sans quitter la page.

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test('roadmap : avancement en 1 clic depuis le rail, ajouter un ticket, publier', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  // Projet à part (comme le backlog) : une version dans ARI changerait ce que voient les autres parcours.
  await request.post('http://127.0.0.1:3001/v1/projects', { headers, data: { key: 'AGL', name: 'Agile e2e' } }); // 409 si déjà créé
  const api = 'http://127.0.0.1:3001/v1/projects/AGL';
  await request.post(`${api}/trackers`, { headers, data: {
    key: 'TSK', name: 'Tâches', typeKey: 'task',
    fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate' }],
    statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }, { key: 'done', name: 'Terminé', category: 'done' }],
    transitions: [{ name: 'Terminer', from: 'todo', to: 'done' }],
  } }); // 409 si déjà créé : sans importance
  const keys: string[] = [];
  for (const title of ['Livrable alpha', 'Livrable bêta']) {
    const created = await request.post(`${api}/trackers/TSK/artifacts`, { headers, data: { values: { title, points: 2 } } });
    expect(created.status()).toBe(201);
    keys.push((await created.json()).key as string);
  }
  const name = `V-${Date.now()}`;
  const release = await request.post(`${api}/releases`, { headers, data: { name, startsOn: day(0), endsOn: day(20) } });
  expect(release.status()).toBeLessThan(300);
  const id = (await release.json()).id as string;
  expect((await request.post(`${api}/releases/${id}/items`, { headers, data: { artifact: keys[0] } })).status()).toBe(204);

  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto('/p/AGL/board');
  // 2 clics : l'entrée Planning du rail, puis l'onglet Versions (ex-Roadmap) affichent l'avancement de chaque version.
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await page.getByRole('navigation', { name: 'Vues du planning' }).getByRole('link', { name: 'Versions' }).click();
  await expect(page).toHaveURL(/\/p\/AGL\/planning\?vue=versions$/);
  const card = page.getByRole('list', { name }).locator('xpath=ancestor::section[1]');
  await expect(card.getByText('0 / 1 tickets terminés')).toBeVisible();
  await expect(card.getByText('Avancement 0 %')).toBeVisible();

  // Ajouter un ticket, puis publier : tout sur la page.
  await card.getByLabel('Clé du ticket').fill(keys[1]!);
  await card.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByRole('list', { name })).toContainText(keys[1]!);
  await expect(card.getByText('0 / 2 tickets terminés')).toBeVisible();
  await card.getByRole('button', { name: 'Publier' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByText('Version publiée.')).toBeVisible();
  await expect(card.getByText('Publiée')).toBeVisible();
  await expect(card.getByLabel('Clé du ticket')).toHaveCount(0);
  await expect(page).toHaveURL(/\/p\/AGL\/planning\?vue=versions$/);
});
