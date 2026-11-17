import { expect, test, type Page } from '@playwright/test';

// Lot 18 : santé du portefeuille (tableau, tuiles, export), météo du projet, fiche d'une page.

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('météo du projet, fiche d’une page, tableau de santé et tuiles du portefeuille', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  await request.post('http://127.0.0.1:3001/v1/portfolios', { headers, data: { key: 'sante-e2e', name: 'Santé e2e' } }); // 409 si déjà créé
  await request.put('http://127.0.0.1:3001/v1/portfolios/sante-e2e/projects/ARI', { headers, data: {} });
  await login(page, 'admin.dev', 'dev-only-admin');

  // Météo : saisie depuis la vue d'ensemble du projet.
  await page.goto('/p/ARI');
  await page.getByRole('button', { name: 'Écrire la météo' }).click();
  await page.getByLabel('Risque', { exact: true }).selectOption('critical');
  await page.getByLabel('Commentaire').fill('Lanceur décalé de six semaines');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Lanceur décalé de six semaines').first()).toBeVisible();

  // Fiche d'une page : la météo y figure, le bouton d'impression existe.
  await page.goto('/p/ARI/fiche');
  const sheet = page.getByRole('article', { name: 'Fiche projet ARI' });
  await expect(sheet.getByText('Lanceur décalé de six semaines')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimer la fiche' })).toBeVisible();
  // L'aperçu d'impression ne garde que la fiche.
  await page.emulateMedia({ media: 'print' });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('navigation').first()).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  // Portefeuille : tuiles, tableau, écart entre santé déclarée et calculée, export CSV de mêmes lignes.
  await page.goto('/portefeuilles/sante-e2e');
  const tiles = page.getByRole('list', { name: 'Vue direction' });
  await expect(tiles.getByRole('listitem')).toHaveCount(6);
  const table = page.getByRole('table', { name: /^Santé de \d+ projets?$/ });
  await expect(table).toBeVisible();
  const rows = await table.getByRole('row').count();
  const projects = Number((await tiles.getByRole('listitem').first().locator('.ath-tile__value').textContent())?.trim());
  expect(rows - 1).toBe(projects); // tuile « Projets » = lignes du tableau
  await expect(table.getByRole('row', { name: /ARI/ }).getByText('écart avec la santé calculée')).toBeVisible();
  const href = await page.getByRole('link', { name: /Exporter en CSV/ }).getAttribute('href');
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');
  const lines = (await csv.text()).replace(/^﻿/, '').trim().split('\n');
  expect(lines.length - 1).toBe(rows - 1);
  expect(lines[0]).toContain('projet,nom,etat,sante');
});
