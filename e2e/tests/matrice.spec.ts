import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('vue Matrice : ligne non couverte, création d’un lien depuis une case, export CSV', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  const api = 'http://127.0.0.1:3001/v1/projects/ARI';
  const tracker = async (key: string, name: string, typeKey: string) => {
    const r = await request.post(`${api}/trackers`, {
      headers,
      data: { key, name, typeKey, fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }], statuses: [{ key: 'draft', name: 'Brouillon', category: 'todo' }], transitions: [] },
    });
    expect(r.status()).toBe(201);
  };
  await tracker('EXI', 'Exigences matrice', 'requirement');
  await tracker('VER', 'Vérifications matrice', 'test');
  const make = async (t: string, title: string) => (await (await request.post(`${api}/trackers/${t}/artifacts`, { headers, data: { values: { title } } })).json()).key as string;
  const covered = await make('EXI', 'Exigence couverte');
  const gap = await make('EXI', 'Exigence à couvrir');
  const test1 = await make('VER', 'Essai un');
  await make('VER', 'Essai deux');
  expect((await request.post(`${api}/artifacts/${test1}/links`, { headers, data: { to: covered, type: 'verifies' } })).status()).toBe(201);

  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/t/EXI/matrice?mx=VER&mt=verifies');
  const table = page.getByRole('table', { name: /Matrice de traçabilité/ });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row').filter({ hasText: gap })).toContainText('non couvert');
  await expect(table.getByRole('row').filter({ hasText: covered })).not.toContainText('non couvert');

  await page.getByRole('button', { name: `Lier ${gap} et ${test1}` }).click();
  await expect(table.getByRole('row').filter({ hasText: gap })).not.toContainText('non couvert');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter en CSV' }).click();
  expect((await download).suggestedFilename()).toBe('matrice-EXI-VER-verifies.csv');
});
