import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const axeSource = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Audit axe-core dans le navigateur réel, contraste compris. */
async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
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
  await page.goto('/projets'); // T-0123 : « / » est Mon travail
  await expect(page.getByText('Ariane')).toBeVisible();
}

/** Toutes les pages de l'application (T-0096) : routes, onglets d'un projet et d'une fiche, page introuvable. */
const ROUTES = [
  '/', '/me', '/org', '/help', '/recherche', '/projets', '/profil', '/notifications', '/admin', '/projets', '/profil', '/notifications', '/admin', '/charge', '/portefeuilles', '/portefeuilles/spatial',
  '/p/ARI', '/p/ARI/trackers', '/p/ARI/planification', '/p/ARI/tracabilite', '/p/ARI/conformite', '/p/ARI/documents', '/p/ARI/code', '/p/ARI/activite', '/p/ARI/rapports/avancement', '/p/ARI/rapports/tracabilite', '/p/ARI/rapports/conformite', '/p/ARI/rapports/livraison', '/p/ARI/rapports/activite', '/p/ARI/membres', '/p/ARI/recherche', '/p/ARI/backlog', '/p/ARI/roadmap', '/p/ARI/fiche', '/capacite',
  '/p/ARI/t/BUG/tableau', '/p/ARI/t/BUG/board', '/p/ARI/t/BUG/arbre', '/p/ARI/t/BUG/matrice',
  '/p/ARI/a/ARI-BUG-0001', '/p/ARI/admin', '/p/ARI/trackers/BUG/config', '/p/ARI/trackers/new',
  '/p/ARI/parametres/membres', '/p/ARI/parametres/trackers', '/p/ARI/parametres/boards', '/p/ARI/parametres/automatisations', '/p/ARI/parametres/baselines', '/p/ARI/parametres/approbations',
  '/une/page/inconnue',
];
const ITEM_TABS = ['Liens', 'Historique', 'Pièces jointes', 'Commentaires', 'Développement'];

async function sweep(page: Page, label: string): Promise<void> {
  for (const path of ROUTES) {
    await page.goto(path);
    await expect(page.locator('main#contenu')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await axeViolations(page), `${label} : ${path}`).toEqual([]);
  }
  await page.goto('/p/ARI/a/ARI-BUG-0001');
  await page.waitForLoadState('networkidle');
  for (const tab of ITEM_TABS) {
    await page.getByRole('tab', { name: tab }).click();
    expect(await axeViolations(page), `${label} : fiche, onglet ${tab}`).toEqual([]);
  }
}

test('audit : axe (contraste compris) sur toutes les pages, administrateur, thèmes clair et sombre', async ({ page }) => {
  test.setTimeout(600_000); // deux balayages complets : 4 minutes ne suffisent plus depuis l'ajout des pages de pilotage
  await login(page, 'admin.dev', 'dev-only-admin');
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => { window.localStorage.setItem('athena.theme', t); }, theme);
    await page.reload();
    await sweep(page, `administrateur, ${theme}`);
  }
});

test('audit : axe sur toutes les pages pour un utilisateur sans droit d’administration ; les pages réservées l’annoncent (F-13)', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'user.dev', 'dev-only-user');
  await sweep(page, 'utilisateur');
  await page.goto('/org');
  await expect(page.getByRole('heading', { name: 'L’administration de l’organisation est réservée aux administrateurs.' })).toBeVisible(); // T-0144
  await expect(page.getByRole('tab')).toHaveCount(0);
  // T-0120 : l'ancienne administration du projet mène aux Paramètres, réservés aux responsables et à l'assurance qualité.
  await page.goto('/p/ARI/admin');
  await expect(page.getByRole('heading', { name: /réservés aux administrateurs, aux chefs de projet/ })).toBeVisible(); // T-0144
  await expect(page.getByRole('navigation', { name: 'Sections des paramètres' })).toHaveCount(0);
});
