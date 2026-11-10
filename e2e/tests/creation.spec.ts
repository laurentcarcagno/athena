import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

// T-0111 (ADR-0003 § 2.5) : la création part du contexte et on reste sur la page.
test('écran Tracker : « + Nouveau ticket » crée dans ce tracker, la liste reste et le ticket s’ouvre dans le panneau', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/t/BUG/tableau');
  await page.getByRole('button', { name: '+ Nouveau ticket' }).click();
  const form = page.getByRole('dialog', { name: 'Nouveau ticket' });
  await expect(form.getByLabel('Tracker')).toHaveValue('BUG');
  await form.getByLabel('Titre (obligatoire)').fill('Écran figé après mise en veille');
  await form.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('complementary', { name: 'Détail du ticket' })).toBeVisible();
  await expect(page).toHaveURL(/\/p\/ARI\/t\/BUG\/tableau\?.*i=ARI-BUG-\d{4}/);
  const key = new URL(page.url()).searchParams.get('i')!;
  await expect(page.getByRole('link', { name: key })).toBeVisible(); // la liste rechargée contient le nouveau ticket
});

test('« Créer » depuis Mon travail : projet puis tracker, on reste sur Mon travail, le message ouvre le ticket', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un ticket' }).click();
  const form = page.getByRole('dialog', { name: 'Nouveau ticket' });
  await form.getByLabel('Projet').selectOption('ARI');
  await expect(form.getByLabel('Tracker')).toHaveValue('BUG');
  await form.getByLabel('Titre (obligatoire)').fill('Créé depuis Mon travail');
  await form.getByRole('button', { name: 'Créer' }).click();
  const open = page.getByRole('button', { name: /^Ouvrir ARI-BUG-\d{4}$/ });
  await expect(open).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  const key = (await open.textContent())!.replace('Ouvrir ', '');
  await open.click();
  await expect(page).toHaveURL(new RegExp(`/p/ARI/a/${key}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(key);
});

test('la touche N ouvre la création du projet courant', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ARI');
  await page.keyboard.press('n');
  const form = page.getByRole('dialog', { name: 'Nouveau ticket' });
  await expect(form.getByLabel('Tracker')).toHaveValue('BUG');
  await expect(form.getByLabel('Projet')).toHaveCount(0);
});
