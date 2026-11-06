import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('liens depuis la fiche : créer (raccourci L, autocomplétion), suspect, acquitter, supprimer avec confirmation', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  await request.post('http://127.0.0.1:3001/v1/projects/ARI/link-types', { headers, data: { key: 'related', outwardLabel: 'est lié à', inwardLabel: 'est lié à' } }); // 409 si déjà créé : sans importance
  const created = await request.post('http://127.0.0.1:3001/v1/projects/ARI/trackers/BUG/artifacts', { headers, data: { values: { title: 'Cible des liens', severity: 'mineure' } } });
  expect(created.status()).toBe(201);
  const target = (await created.json()).key as string;

  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/a/ARI-BUG-0001');
  await expect(page.getByLabel('Titre (obligatoire)')).toBeVisible();
  await page.keyboard.press('l');
  await expect(page.getByLabel('Type de lien')).toBeFocused();
  await page.getByLabel('Type de lien').selectOption('related:out');
  await page.getByLabel('Item cible (clé ou titre)').fill('Cible des');
  await page.getByRole('button', { name: new RegExp(target) }).click();
  await page.getByRole('button', { name: 'Lier', exact: true }).click();
  const list = page.getByRole('list', { name: 'Liens' });
  await expect(list.getByRole('link', { name: target })).toBeVisible();

  // Modifier la cible rend le lien suspect : l'acquittement est un clic.
  const api = await request.get(`http://127.0.0.1:3001/v1/projects/ARI/artifacts/${target}`, { headers });
  const version = (await api.json()).version as number;
  expect((await request.patch(`http://127.0.0.1:3001/v1/projects/ARI/artifacts/${target}`, { headers, data: { values: { title: 'Cible modifiée' }, version } })).status()).toBe(200);
  await page.reload();
  await page.getByRole('tab', { name: 'Liens' }).click();
  await expect(list.getByText('Suspect')).toBeVisible();
  await page.getByRole('button', { name: `Acquitter ${target}` }).click();
  await expect(list.getByText('Suspect')).toHaveCount(0);

  await page.getByRole('button', { name: `Supprimer le lien ${target}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(list.getByRole('link', { name: target })).toHaveCount(0);
});
