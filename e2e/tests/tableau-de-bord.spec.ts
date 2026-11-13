import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const axeSource = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Audit axe-core dans le navigateur réel, contraste compris. */
async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return result.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(' ; ')}`);
  });
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

const TITLES = ['Mes tickets', 'Mes tâches en retard', 'À approuver', 'Mentions', 'Échéances de la semaine', 'Projets favoris', 'Récents'];

// T-0122 (ADR-0003 § 2.1) : tableau de bord personnel, disposition par défaut sans réglage, puis personnalisation durable.
test('tableau de bord : disposition par défaut, masquer et réordonner survivent au rechargement, réinitialiser la rétablit', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/me');
  // Toutes les cartes de la disposition (une carte vide est résumée dans « Rien d'urgent » mais reste dans la grille, T-0153).
  const groups = page.locator('section[aria-label="Tableau de bord"] .ath-dashcard');
  await expect(groups).toHaveCount(7);
  expect(await groups.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(TITLES);

  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Masquer Récents' }).click();
  // Déplacer au clavier (T-0154) : saisir la carte par sa poignée, flèche, poser.
  await page.getByRole('button', { name: 'Déplacer la carte Mes tickets' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(groups).toHaveCount(6);

  await page.reload();
  await expect(groups).toHaveCount(6);
  expect(await groups.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Mes tâches en retard', 'Mes tickets', 'À approuver', 'Mentions', 'Échéances de la semaine', 'Projets favoris']);
  expect(await axeViolations(page)).toEqual([]);

  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Rétablir la disposition par défaut' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(groups).toHaveCount(7);
  await page.reload();
  await expect(groups).toHaveCount(7);
  expect(await groups.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(TITLES);
});
