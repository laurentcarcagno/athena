import { expect, test, type Page } from '@playwright/test';

// T-0112 : informations clés de la fiche visibles sans clic, onglet actif dans l'adresse et restauré par Précédent.

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('fiche : en-tête complet (blocage), onglet dans l’adresse, Précédent restaure l’onglet', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  const make = async (title: string) => {
    const created = await request.post('http://127.0.0.1:3001/v1/projects/ARI/trackers/BUG/artifacts', { headers, data: { values: { title, severity: 'majeure' } } });
    expect(created.status()).toBe(201);
    return (await created.json()).key as string;
  };
  const item = await make('Fiche à en-tête complet');
  const blocker = await make('Ticket bloquant');
  expect((await request.post(`http://127.0.0.1:3001/v1/projects/ARI/artifacts/${blocker}/links`, { headers, data: { to: item, type: 'blocks' } })).status()).toBeLessThan(300);

  await login(page, 'user.dev', 'dev-only-user');
  await page.goto(`/p/ARI/a/${item}?onglet=history`);
  await expect(page.getByRole('tab', { name: 'Historique', selected: true })).toBeVisible();
  const facts = page.getByLabel('Informations clés');
  await expect(facts.getByRole('link', { name: blocker })).toBeVisible(); // « Bloqué par », sans clic
  await expect(facts.getByText('Sprint', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Liens' }).click();
  await expect(page).toHaveURL(new RegExp(`/p/ARI/a/${item}\\?onglet=links$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/p/ARI/a/${item}\\?onglet=history$`));
  await expect(page.getByRole('tab', { name: 'Historique', selected: true })).toBeVisible();

  // Raccourci L : l'adresse passe sur l'onglet des liens.
  await page.getByRole('tab', { name: 'Historique' }).focus();
  await page.keyboard.press('l');
  await expect(page).toHaveURL(/onglet=links$/);

  // T-0113 : relations groupées ; saut vers le ticket lié en 1 action, retour en 1 action.
  const relations = page.getByRole('group', { name: 'Relations' });
  await relations.getByRole('list', { name: 'Est bloqué par' }).getByRole('link', { name: blocker }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(blocker) })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/p/ARI/a/${blocker}$`)); // un autre ticket s'ouvre sur Détails
  await page.getByRole('link', { name: `Retour : ${item}` }).click();
  await expect(page).toHaveURL(new RegExp(`/p/ARI/a/${item}\\?onglet=links$`));
});

test('fiche ouverte depuis la recherche : précédent, suivant, retour à la liste filtrée', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/recherche?q=tracker%20%3D%20BUG');
  const first = page.getByRole('table').first().getByRole('link').first();
  const key = (await first.textContent())!.trim();
  await first.click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(key) })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navigation depuis l’origine' });
  await expect(nav.getByText(/^1 \/ \d+$/)).toBeVisible();
  await nav.getByRole('button', { name: 'Suivant' }).click();
  await expect(nav.getByText(/^2 \/ \d+$/)).toBeVisible();
  await page.getByRole('link', { name: 'Retour : Recherche' }).click();
  await expect(page).toHaveURL(/\/p\/ARI\/recherche\?q=tracker%20%3D%20BUG$|\/p\/ARI\/recherche\?q=tracker\+%3D\+BUG$/);
});
