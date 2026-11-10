import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('onglet Traçabilité : règle de couverture, taux, tickets en défaut et ouverture de la liste filtrée', async ({ page, request }) => {
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
  await tracker('COU', 'Exigences couverture', 'requirement');
  await tracker('ESS', 'Essais couverture', 'test');
  const make = async (t: string, title: string) => (await (await request.post(`${api}/trackers/${t}/artifacts`, { headers, data: { values: { title } } })).json()).key as string;
  const covered = await make('COU', 'Exigence vérifiée');
  const gap = await make('COU', 'Exigence nue');
  const essai = await make('ESS', 'Essai');
  expect((await request.post(`${api}/artifacts/${essai}/links`, { headers, data: { to: covered, type: 'verifies' } })).status()).toBe(201);

  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto('/p/ARI/tracabilite');
  await page.getByRole('button', { name: 'Ajouter une règle' }).click();
  const form = page.getByRole('form', { name: 'Ajouter une règle' });
  await form.getByLabel('Clé de la règle (minuscules)').fill('cou-verifiee');
  await form.getByLabel('Nom de la règle').fill('Exigences couvertes vérifiées');
  await form.getByLabel('Tracker visé').selectOption('COU');
  await form.getByLabel('Objectif (%)').fill('100');
  await form.getByLabel('Seuil d’alerte (%)').fill('40');
  await form.getByRole('button', { name: 'Créer la règle' }).click();

  const section = page.getByRole('heading', { name: /Exigences couvertes vérifiées/ }).locator('xpath=ancestor::section');
  await expect(section.getByText('50 %')).toBeVisible();
  await expect(section.getByText('Alerte', { exact: true })).toBeVisible();
  await expect(section.getByRole('link', { name: gap })).toBeVisible();
  await expect(section.getByRole('link', { name: covered })).toHaveCount(0);

  await section.getByRole('button', { name: 'Modifier' }).click();
  await page.getByLabel('Seuil d’alerte (%)').fill('30');
  await page.getByRole('button', { name: 'Enregistrer la règle' }).click();
  await expect(section.getByText('objectif 100 %, alerte 30 %')).toBeVisible();

  await section.getByRole('link', { name: '1 en défaut' }).click();
  await expect(page).toHaveURL(/\/p\/ARI\/t\/COU\/tableau\?f=/);
  await expect(page.getByRole('link', { name: gap, exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: covered, exact: true })).toHaveCount(0);
});
