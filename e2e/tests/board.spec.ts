import { expect, test, type Page } from '@playwright/test';

// T-0114 : board › ticket › retour en 1 action, filtres conservés ; « Déplacer vers » au clavier ; index des boards.

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('board du tracker : carte › panneau › retour en 1 action, filtres conservés', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/t/BUG/board?q=ARI-BUG');
  const link = page.getByRole('link', { name: 'ARI-BUG-0001', exact: true });
  await link.click();
  const panel = page.getByRole('complementary', { name: 'Détail de l’item' });
  await expect(panel.getByRole('heading', { level: 2, name: /ARI-BUG-0001/ })).toBeVisible();
  await expect(page).toHaveURL(/q=ARI-BUG&i=ARI-BUG-0001/);
  await panel.getByRole('button', { name: 'Fermer' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/p\/ARI\/t\/BUG\/board\?q=ARI-BUG$/);
  await expect(page.getByLabel('Filtrer les cartes (clé ou titre)')).toHaveValue('ARI-BUG');
  await expect(page.getByLabel('Déplacer vers').first()).toBeVisible();
});

test('index des boards : le board de chaque tracker en 1 clic', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/board');
  await page.getByRole('list', { name: 'Board de chaque tracker' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/p\/ARI\/t\/[A-Z0-9]+\/board$/);
});
