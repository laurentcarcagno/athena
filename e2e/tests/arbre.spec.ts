import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('vue Arbre : chapitres numérotés, dépliage et ouverture du panneau', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  const api = 'http://127.0.0.1:3001/v1/projects/ARI';
  const tracker = await request.post(`${api}/trackers`, {
    headers,
    data: {
      key: 'SPEC', name: 'Spécifications', typeKey: 'requirement',
      fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }],
      statuses: [{ key: 'draft', name: 'Brouillon', category: 'todo' }], transitions: [],
    },
  });
  expect(tracker.status()).toBe(201);
  const make = async (title: string) => (await (await request.post(`${api}/trackers/SPEC/artifacts`, { headers, data: { values: { title } } })).json()).key as string;
  const mother = await make('Exigence mère');
  const daughter = await make('Exigence fille');
  await make('Exigence isolée');
  expect((await request.post(`${api}/artifacts/${daughter}/links`, { headers, data: { to: mother, type: 'refines' } })).status()).toBe(201);

  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/t/SPEC/arbre');
  const tree = page.getByRole('tree', { name: 'Arbre des tickets' });
  await expect(tree.getByRole('treeitem')).toHaveCount(2); // la fille n'est pas une racine
  await expect(tree.getByRole('treeitem').first()).toContainText('1');
  await tree.getByRole('treeitem').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tree.getByRole('treeitem')).toHaveCount(3);
  await expect(tree.getByRole('treeitem').nth(1)).toContainText('1.1');
  await expect(tree.getByRole('treeitem').nth(1)).toContainText('Exigence fille');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Détail du ticket' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`i=${daughter}`));
});
