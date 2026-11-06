import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

// Critère du lot 1 : tout item s'atteint en au plus 3 actions, sans écrire de requête ATQL.
test('Projets, tracker, item : trois actions, puis retour au projet par le fil d’Ariane', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await expect(page.getByText('Ariane')).toBeVisible();
  await page.getByRole('link', { name: /Bugs|BUG/ }).first().click(); // 1 : le tracker (écran Tracker, vue Tableau)
  await expect(page).toHaveURL(/\/p\/ARI\/t\/BUG\/tableau/);
  await page.getByRole('link', { name: 'ARI-BUG-0001' }).click(); // 2 : l'item s'ouvre à droite
  await expect(page.getByRole('complementary', { name: 'Détail de l’item' })).toBeVisible();
  await expect(page).toHaveURL(/i=ARI-BUG-0001/);
  await page.getByRole('navigation', { name: 'Fil d’Ariane' }).getByRole('link', { name: 'ARI' }).click(); // 1 action pour revenir
  await expect(page.getByRole('navigation', { name: 'Projet ARI' })).toBeVisible();
});

test('J / K parcourent la liste, Échap ferme le panneau, l’ancienne adresse de recherche redirige', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/t/BUG/tableau');
  await expect(page.getByRole('link', { name: 'ARI-BUG-0001' })).toBeVisible();
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/i=ARI-BUG-0001/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Détail de l’item' })).toHaveCount(0);
  await page.goto('/p/ARI?q=status%3Dopen');
  await expect(page).toHaveURL(/\/p\/ARI\/recherche\?q=/);
});

test('colonnes du tableau et sélecteur de frères du fil d’Ariane', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/t/BUG/tableau');
  await page.getByRole('button', { name: 'Colonnes' }).click();
  await page.getByRole('checkbox', { name: 'Sévérité' }).click();
  await expect(page.getByRole('checkbox', { name: 'Sévérité' })).toBeChecked(); // état piloté par l'adresse : il se met à jour juste après le clic
  await expect(page.getByRole('columnheader', { name: /Sévérité/ })).toBeVisible();
  await expect(page).toHaveURL(/cols=/);
  await page.getByRole('button', { name: 'Changer de tracker' }).click();
  await expect(page.getByRole('list', { name: 'Changer de tracker' }).getByRole('link', { name: 'BUG' })).toBeVisible();
});

test.describe('téléphone (375 px) : tiroir du rail', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('le rail est fermé, s’ouvre en tiroir, se ferme à la navigation ; la page ne déborde pas', async ({ page }) => {
    await login(page, 'user.dev', 'dev-only-user');
    await page.goto('/p/ARI/recherche');
    await expect(page.getByRole('link', { name: 'ARI-BUG-0001' })).toBeVisible();
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noOverflow()).toBe(true);
    const rail = page.locator('#rail');
    await expect(rail).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(rail).toBeVisible();
    const box = (await rail.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBeLessThanOrEqual(375 * 0.86 + 1);
    expect(box.height).toBeGreaterThanOrEqual(699);
    await page.keyboard.press('Escape');
    await expect(rail).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    await rail.getByRole('button', { name: 'Projets' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(rail).toBeHidden();
    expect(await noOverflow()).toBe(true);
  });
});

