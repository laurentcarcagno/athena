import { expect, test, type Page } from '@playwright/test';

/** Lot 27 (ADR-0010, T-0275) : gabarits de tableaux de bord, de l'administration au tableau de bord de la personne. */
async function login(page: Page, user: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

/** Les écritures de l'API exigent l'en-tête CSRF de la session. */
async function api(page: Page, method: 'PUT' | 'DELETE' | 'POST', path: string, data?: unknown) {
  const { csrf } = await (await page.request.get('/auth/session')).json() as { csrf?: string };
  const res = await page.request.fetch(path, { method, ...(data === undefined ? {} : { data }), headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
  return res;
}

test('l’administrateur duplique un gabarit, le désigne par défaut ; une personne de ce rôle le trouve sans rien faire, puis l’adapte', async ({ browser }) => {
  // 1. Administrateur : Organisation › Gabarits › Tableaux de bord, dupliquer « Contributeur », le définir par défaut pour le membre d'équipe.
  const admin = await (await browser.newContext({ locale: 'fr-FR' })).newPage();
  await login(admin, 'admin.dev', 'dev-only-admin');
  // État de départ propre : aucun défaut, aucun gabarit d'organisation, tableau de bord de l'administrateur et de user.dev vides.
  for (const row of ((await (await admin.request.get('/v1/dashboard-templates')).json()) as { defaults: Array<{ type: string; role: string }>; templates: Array<{ key: string; builtin: boolean }> }).defaults) await api(admin, 'DELETE', `/v1/dashboard-templates/defaults/${row.type}/${row.role}`);
  for (const t of ((await (await admin.request.get('/v1/dashboard-templates')).json()) as { templates: Array<{ key: string; builtin: boolean }> }).templates.filter((x) => !x.builtin)) await api(admin, 'DELETE', `/v1/dashboard-templates/${t.key}`);
  await admin.goto('/admin');
  await admin.getByRole('tab', { name: 'Gabarits' }).click();
  await admin.getByRole('tab', { name: 'Tableaux de bord' }).click();
  const table = admin.getByRole('table', { name: /gabarits de tableau de bord/ });
  await expect(table).toBeVisible();
  await expect(table.getByText('Contributeur', { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: 'Dupliquer Contributeur' }).click();
  await expect(admin.getByText('Gabarit dupliqué.')).toBeVisible();
  await expect(table.getByText('Contributeur (copie)')).toBeVisible();
  await admin.getByRole('button', { name: 'Par défaut pour… Contributeur (copie)' }).click();
  await admin.getByRole('button', { name: 'Définir par défaut' }).click();
  await expect(admin.getByText('Gabarit par défaut défini.')).toBeVisible();
  await expect(admin.getByText(/Mon travail, Membre d’équipe : Contributeur \(copie\)/)).toBeVisible();

  // 2. Membre d'équipe : repart de zéro, ouvre Mon travail et trouve les deux onglets du gabarit sans rien organiser.
  const dev = await (await browser.newContext({ locale: 'fr-FR' })).newPage();
  await login(dev, 'user.dev', 'dev-only-user');
  // Remise à zéro : lire les onglets applique déjà le défaut à qui n'a rien ; on supprime donc les onglets, puis la disposition principale.
  for (const tab of ((await (await dev.request.get('/v1/me/dashboard/tabs')).json()) as { tabs: Array<{ id: string }> }).tabs.filter((x) => x.id !== '')) await api(dev, 'DELETE', `/v1/me/dashboard/tabs/${tab.id}`);
  await api(dev, 'DELETE', '/v1/me/dashboard');
  await dev.goto('/');
  const tabs = dev.getByRole('tablist').first();
  await expect(tabs.getByRole('tab', { name: 'Aujourd’hui' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'À prendre' })).toBeVisible();
  await expect(dev.locator('.ath-dashcard[aria-label="Mes anomalies"]')).toHaveCount(1); // la carte existe ; vide, elle se résume dans « Rien d’urgent »
  // C'est une copie : la personne renomme l'onglet principal, le gabarit ne bouge pas.
  await dev.getByRole('button', { name: 'Organiser' }).click();
  await dev.getByRole('button', { name: 'Renommer l’onglet' }).click();
  await dev.getByLabel('Nom de l’onglet').fill('Ma journée');
  await dev.getByRole('button', { name: 'Renommer', exact: true }).click();
  await expect(dev.locator('strong', { hasText: 'Ma journée' })).toBeVisible();
  // « Partir d'un gabarit » : l'essentiel s'ajoute à côté.
  await dev.getByRole('button', { name: 'Partir d’un gabarit' }).click();
  await expect(dev.getByText('Essentiel')).toBeVisible();
  await expect(dev.getByText('Revues ECSS')).toHaveCount(0); // gabarit de projet : jamais proposé dans Mon travail
  await dev.getByRole('button', { name: 'Ajouter les onglets de Essentiel' }).click();
  await expect(dev.getByText('1 onglet ajouté.')).toBeVisible();
  await expect(dev.getByRole('tablist').first().getByRole('tab')).toHaveText(['Ma journée', 'À prendre', 'Mon travail']);
  const stored = await (await admin.request.get('/v1/dashboard-templates/tcontributeur-copie')).json() as { tabs: Array<{ name: string }> };
  expect(stored.tabs.map((x) => x.name)).toEqual(['Aujourd’hui', 'À prendre']); // le gabarit n'a pas bougé

  // Nettoyage : aucun défaut ne reste pour les autres parcours.
  await api(admin, 'DELETE', '/v1/dashboard-templates/defaults/home/athena-team-member');
  await api(admin, 'DELETE', '/v1/dashboard-templates/tcontributeur-copie');
  for (const tab of ((await (await dev.request.get('/v1/me/dashboard/tabs')).json()) as { tabs: Array<{ id: string }> }).tabs.filter((x) => x.id !== '')) await api(dev, 'DELETE', `/v1/me/dashboard/tabs/${tab.id}`);
  await api(dev, 'DELETE', '/v1/me/dashboard');
});

test('sur un projet : les gabarits proposés suivent la nature du projet et le rôle dans le projet ; l’administrateur voit l’aperçu sans rien enregistrer', async ({ page }) => {
  await login(page, 'admin.dev', 'dev-only-admin');
  await api(page, 'DELETE', '/v1/me/dashboard?project=ARI');
  await page.goto('/p/ARI');
  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Partir d’un gabarit' }).click();
  // ARI est un projet générique, l'administrateur n'y est pas membre : lecteur.
  await expect(page.getByText('Lecteur du projet')).toBeVisible();
  await expect(page.getByText('Revues ECSS')).toHaveCount(0);
  await expect(page.getByText('Jalons IM 1618')).toHaveCount(0);
  await expect(page.getByText('Chef du projet', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ajouter les onglets de Lecteur du projet' }).click();
  await expect(page.getByText('1 onglet ajouté.')).toBeVisible();
  await expect(page.getByRole('tablist').first().getByRole('tab')).toHaveText(['Principal', 'Synthèse']);
  await api(page, 'DELETE', '/v1/me/dashboard/tabs/synthese?project=ARI');
  // Aperçu d'un gabarit livré sur ARI, sans rien enregistrer.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Gabarits' }).click();
  await page.getByRole('tab', { name: 'Tableaux de bord' }).click();
  await page.getByRole('button', { name: 'Aperçu Chef du projet' }).click();
  await page.getByRole('combobox', { name: /^Projet/ }).selectOption('ARI');
  await page.getByRole('button', { name: 'Afficher l’aperçu' }).click();
  await expect(page.getByRole('tab', { name: 'Planning' })).toBeVisible();
  const tabsAfter = await (await page.request.get('/v1/me/dashboard/tabs?project=ARI')).json() as { tabs: Array<{ id: string }> };
  expect(tabsAfter.tabs.map((x) => x.id)).toEqual(['']); // rien enregistré
});

test('un chef de projet limité à ses projets : les cartes répétées ne couvrent que ses projets', async ({ page }) => {
  await login(page, 'pm.dev', 'dev-only-pm');
  for (const tab of ((await (await page.request.get('/v1/me/dashboard/tabs')).json()) as { tabs: Array<{ id: string }> }).tabs.filter((x) => x.id !== '')) await api(page, 'DELETE', `/v1/me/dashboard/tabs/${tab.id}`);
  await api(page, 'DELETE', '/v1/me/dashboard');
  await page.goto('/');
  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Partir d’un gabarit' }).click();
  await page.getByRole('button', { name: 'Remplacer mon tableau de bord par Chef de projet' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remplacer mon tableau de bord' }).click();
  await expect(page.getByText('Tableau de bord remplacé.')).toBeVisible();
  await page.getByRole('tab', { name: 'Mes projets' }).click();
  // pm.dev n'est responsable d'aucun projet de la base de test : aucune carte « une par projet » (et pas ARI, qu'il ne voit pas).
  await expect(page.getByText(/Onglet vide/)).toBeVisible();
  await expect(page.getByRole('group', { name: /Santé du projet · ARI/ })).toHaveCount(0);
  for (const tab of ((await (await page.request.get('/v1/me/dashboard/tabs')).json()) as { tabs: Array<{ id: string }> }).tabs.filter((x) => x.id !== '')) await api(page, 'DELETE', `/v1/me/dashboard/tabs/${tab.id}`);
  await api(page, 'DELETE', '/v1/me/dashboard');
});
