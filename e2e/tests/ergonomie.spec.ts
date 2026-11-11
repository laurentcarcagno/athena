import { expect, test, type Page } from '@playwright/test';

/** Lot 11 (ADR-0005) : parcours corrigés après l'audit d'ergonomie. */
async function login(page: Page, user = 'admin.dev', password = 'dev-only-admin') {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('rapports : les onglets sont sous l’en-tête, visibles et cliquables ; le titre suit le rapport (T-0143)', async ({ page }) => {
  await login(page);
  await page.goto('/p/ARI/rapports');
  await expect(page.locator('h1')).toHaveText('Avancement');
  const tabs = page.getByRole('navigation', { name: /rapports/i });
  const header = page.locator('main .ath-pageheader');
  expect((await tabs.boundingBox())!.y).toBeGreaterThan((await header.boundingBox())!.y + (await header.boundingBox())!.height - 1);
  // Le point central de l'onglet « Activité » appartient bien à l'onglet (rien ne le recouvre).
  const activity = tabs.getByRole('link', { name: 'Activité' });
  const box = (await activity.boundingBox())!;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.textContent?.trim(), [box.x + box.width / 2, box.y + box.height / 2])).toBe('Activité');
  await activity.click();
  await expect(page).toHaveURL(/\/rapports\/activite$/);
  await expect(page.locator('h1')).toHaveText(/Activité/);
});

test('téléphone (390 px) : la fiche garde la largeur de l’écran, ses onglets défilent dans leur rangée (T-0143)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/p/ARI/a/ARI-BUG-0001');
  await expect(page.locator('main .ath-tabs').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const tabs = page.locator('main .ath-tabs').first();
  expect(await tabs.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test('chef de projet : création de tracker et configuration d’un tracker disent qui peut agir, sans bascule silencieuse (T-0144)', async ({ page }) => {
  await login(page, 'pm.dev', 'dev-only-pm');
  await page.goto('/p/ARI/trackers/new');
  await expect(page.getByRole('heading', { name: 'Seul un administrateur peut ajouter un tracker.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Retour aux trackers' })).toBeVisible();
  await page.goto('/p/ARI/parametres/trackers/BUG');
  await expect(page.getByRole('heading', { name: 'La section Trackers est réservée aux administrateurs.' })).toBeVisible();
  await expect(page).toHaveURL(/\/parametres\/trackers\/BUG$/);
});

test('automatisations : un administrateur crée une règle depuis un modèle, elle apparaît active (T-0145)', async ({ page }) => {
  await login(page);
  await page.goto('/p/ARI/parametres/automatisations');
  await expect(page.getByText(/Une automatisation agit seule/)).toBeVisible();
  await page.getByRole('button', { name: 'Utiliser le modèle : Relance des tickets bloqués' }).click();
  await expect(page.getByLabel('Quand')).toHaveValue('schedule');
  await page.getByRole('button', { name: 'Créer l’automatisation' }).click();
  await expect(page.getByText('Automatisation « Relance des tickets bloqués » créée et active.')).toBeVisible();
  const row = page.getByRole('row', { name: /Relance des tickets bloqués/ });
  await expect(row.getByText('Active', { exact: true })).toBeVisible();
  await expect(row.getByText('À intervalle régulier')).toBeVisible();
});

test('tracker sur téléphone : la liste commence dans le premier écran ; « Filtres » déplie les réglages (T-0147)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/p/ARI/t/BUG/tableau');
  const first = page.getByRole('link', { name: 'ARI-BUG-0001' });
  await expect(first).toBeVisible();
  expect((await first.boundingBox())!.y).toBeLessThan(844);
  const toggle = page.getByRole('button', { name: /^Filtres/ });
  await expect(page.getByRole('combobox', { name: 'Sévérité' })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('combobox', { name: 'Sévérité' })).toBeVisible();
});

test('fiche : enregistrement automatique annoncé ; « + Ajouter » mène au champ (T-0148)', async ({ page }) => {
  await login(page);
  await page.goto('/p/ARI/a/ARI-BUG-0001');
  await expect(page.getByText('✓ Enregistrement automatique')).toBeVisible();
  const facts = page.getByRole('definition').filter({ has: page.getByRole('button', { name: /^Ajouter : / }) }).first();
  const button = facts.getByRole('button', { name: /^Ajouter : / });
  const term = ((await button.getAttribute('aria-label')) ?? '').replace('Ajouter : ', '');
  await button.click();
  if (!['Sprint', 'Parent', 'Bloqué par'].includes(term)) await expect(page.getByLabel(new RegExp(`^${term}`))).toBeFocused();
});

test('recherche simple : un mot trouve le ticket, une clé ouvre sa fiche (T-0149)', async ({ page }) => {
  await login(page);
  await page.goto('/recherche');
  await expect(page.locator('h1')).toHaveText('Recherche');
  const box = page.getByRole('textbox', { name: 'Rechercher un ticket' });
  await box.fill('démarrage');
  await box.press('Enter');
  await expect(page).toHaveURL(/q=text/); // la recherche est appliquée (avant elle, la page liste déjà tous les tickets)
  await expect(page.getByRole('link', { name: 'ARI-BUG-0001' })).toBeVisible();
  await box.fill('ari-bug-0001');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/p\/ARI\/a\/ARI-BUG-0001/);
});

test('Organiser : glisser une carte et changer sa largeur, retrouvés au rechargement (T-0154)', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/');
  const cards = page.locator('section[aria-label="Tableau de bord"] .ath-dashcard');
  const card = (name: string) => page.locator(`section[aria-label="Tableau de bord"] .ath-dashcard[aria-label="${name}"]`);
  await expect(cards).toHaveCount(6);
  await page.getByRole('button', { name: 'Organiser' }).click();
  await card('Récents').dragTo(card('Mes tickets'));
  await expect(cards.first()).toHaveAttribute('aria-label', 'Récents');
  await page.getByRole('button', { name: 'Largeur L : Récents' }).click();
  await expect(card('Récents')).toHaveClass(/ath-dashcard--L/);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.reload();
  await expect(cards.first()).toHaveAttribute('aria-label', 'Récents');
  await expect(cards.first()).toHaveClass(/ath-dashcard--L/);
  // Remise à l'état initial.
  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Rétablir la disposition par défaut' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(cards.first()).toHaveAttribute('aria-label', 'Mes tickets');
});

test('carte graphique : ajouter un anneau des tickets par statut, puis le retirer (T-0156)', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI');
  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByLabel('+ Ajouter une carte').selectOption({ label: 'Graphique sur une recherche…' });
  await page.getByLabel('Titre de la carte').fill('Tickets par statut');
  await page.getByLabel('Répartir par').selectOption({ label: 'Statut' });
  await page.getByRole('button', { name: 'Ajouter le graphique' }).click();
  const chart = page.locator('.ath-dashcard[aria-label="Tickets par statut"]');
  await expect(chart.getByRole('img', { name: /tickets :/ })).toBeVisible();
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.reload();
  await expect(chart.getByRole('img', { name: /tickets :/ })).toBeVisible();
  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Masquer Tickets par statut' }).click();
  await expect(chart).toHaveCount(0);
});
