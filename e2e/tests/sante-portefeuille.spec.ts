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
  // Les tableaux de bord sont vides par défaut : la personne y pose elle-même les tuiles et le tableau de santé.
  const { csrf } = await (await page.request.get('/auth/session')).json() as { csrf?: string };
  const put = await page.request.put('/v1/me/dashboard?portfolio=sante-e2e', { data: { widgets: [{ id: 'tuiles', kind: 'portfolio-tiles', size: 'XL', h: 2 }, { id: 'sante', kind: 'portfolio-health', size: 'XL', h: 5 }] }, headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
  expect(put.ok()).toBe(true);
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

  // Roadmap du portefeuille (lot 19) : frise, tableau, jalons ; les projets clos sont exclus par défaut.
  await page.goto('/portefeuilles/sante-e2e/roadmap');
  await expect(page.getByRole('img', { name: /^Roadmap de \d+ projets?$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Tableau' }).click();
  await expect(page.getByRole('table', { name: /^Roadmap de \d+ projets?$/ }).getByRole('link', { name: 'ARI' })).toBeVisible();
  await page.getByRole('button', { name: 'Jalons' }).click();
  await expect(page.getByRole('button', { name: 'Imprimer les jalons' })).toBeVisible();

  // Instantanés, revue et dossier (lot 20) : l'instantané manuel, la revue qui fige un instantané, le dossier imprimable.
  await page.goto('/portefeuilles/sante-e2e');
  await page.getByLabel('Libellé de l’instantané').fill('Point e2e');
  await page.getByRole('button', { name: 'Prendre un instantané' }).click();
  await expect(page.getByRole('table', { name: /^\d+ instantanés?$/ }).getByText('Point e2e')).toBeVisible();
  await page.getByLabel('Date de la revue').fill('2026-12-10');
  await page.getByLabel('Ordre du jour ou compte rendu').fill('Revue trimestrielle e2e');
  await page.getByRole('button', { name: 'Créer la revue et figer l’instantané' }).click();
  await page.getByRole('link', { name: 'Ouvrir le dossier' }).first().click();
  const dossier = page.getByRole('article', { name: /^Dossier de revue/ });
  await expect(dossier.getByText('Revue trimestrielle e2e')).toBeVisible();
  await expect(page.getByText(/Instantané figé le .* : ces valeurs ne changent plus\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimer le dossier' })).toBeVisible();
  // Gouvernance : matrice et suivi présents (états vides acceptés pour un projet sans gabarit ni risque).
  await page.goto('/portefeuilles/sante-e2e');
  await expect(page.getByRole('heading', { name: 'Passage des gates' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Matrice des risques' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suivi des actions' })).toBeVisible();
});
