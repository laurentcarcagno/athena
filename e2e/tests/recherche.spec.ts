import { expect, test, type Page } from '@playwright/test';

// T-0119 : trouver un ticket par clé depuis n'importe où en 2 actions (Ctrl+K, la clé puis Entrée) ; recherche globale en puces.

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('recherche globale : palette sur tous les projets, puis page avec puces et périmètre', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  // Projet à part (comme le backlog) : un tracker de plus dans ARI changerait ce que voient les autres parcours.
  await request.post('http://127.0.0.1:3001/v1/projects', { headers, data: { key: 'AGL', name: 'Agile e2e' } }); // 409 si déjà créé
  const api = 'http://127.0.0.1:3001/v1/projects/AGL';
  await request.post(`${api}/trackers`, { headers, data: {
    key: 'TSK', name: 'Tâches', typeKey: 'task',
    fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate' }],
    statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }, { key: 'done', name: 'Terminé', category: 'done' }],
    transitions: [{ name: 'Terminer', from: 'todo', to: 'done' }],
  } }); // 409 si déjà créé : sans importance
  const title = `Cible recherche ${Date.now()}`;
  const created = await request.post(`${api}/trackers/TSK/artifacts`, { headers, data: { values: { title } } });
  expect(created.status()).toBe(201);
  const key = (await created.json()).key as string;

  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto('/me');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); // page prête : la palette écoute le clavier
  // 1 : Ctrl+K ; 2 : la clé, validée par Entrée. Mon travail n'est dans aucun projet : la palette cherche partout.
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(key);
  await expect(page.getByRole('option').first()).toHaveText(new RegExp(`^${key}`)); // le ticket, avant l'action « Rechercher… »
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/p/AGL/a/${key}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title);

  // Page globale : rail, puce « Ouverts », périmètre AGL, la recherche est dans l'adresse.
  await page.getByRole('button', { name: 'Recherche', exact: true }).first().click();
  await expect(page).toHaveURL(/\/recherche$/);
  await page.getByRole('group', { name: 'Filtres rapides' }).getByRole('button', { name: 'Ouverts' }).click();
  await page.getByRole('main').getByRole('group', { name: 'Projets' }).getByRole('button', { name: 'AGL', exact: true }).click();
  await expect(page).toHaveURL(/\/recherche\?q=category.*&p=AGL$/);
  await expect(page.getByRole('link', { name: key })).toBeVisible();
});
