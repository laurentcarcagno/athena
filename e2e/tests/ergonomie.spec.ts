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

