import { expect, test, type Page } from '@playwright/test';
import { seedPlanning } from './planning-seed';

/**
 * Non-régression visuelle du lot 10 (ADR-0004) : 13 écrans × clair et sombre × 4 largeurs.
 * Lancé seulement à la demande (la suite e2e ordinaire l'ignore), depuis `e2e/` :
 *   référence : `pnpm visuel:reference` ; comparaison : `pnpm visuel`.
 * Les deux scripts réinitialisent d'abord la base e2e et le compte admin.dev (global-setup.mjs) :
 * sans cela, la connexion bute sur l'enrôlement TOTP et les données (Récents, etc.) diffèrent.
 * Les captures vont dans `e2e/visuel/` (ignoré par Git, voir `snapshotPathTemplate`).
 */
test.skip(!process.env.VISUEL, 'captures visuelles : pnpm visuel');

const PAGES: Array<[string, string]> = [
  ['mon-travail', '/'],
  ['projets', '/projets'],
  ['recherche', '/recherche'],
  ['administration', '/admin'],
  ['vue-ensemble', '/p/ARI'],
  ['tracker-tableau', '/p/ARI/t/BUG/tableau'],
  ['fiche', '/p/ARI/a/ARI-BUG-0001'],
  ['board', '/p/ARI/board'],
  ['backlog', '/p/ARI/backlog'],
  // Planning : un projet daté à clé fixe, créé avant les captures (VPL), car ARI n'a aucune tâche planifiée.
  ['planning', '/p/VPL/planning'],
  ['planning-liste', '/p/VPL/planning?vue=list'],
  ['rapports', '/p/ARI/rapports/avancement'],
  ['parametres', '/p/ARI/parametres/membres'],
];
const WIDTHS = [375, 768, 1024, 1440];
const MODES = ['light', 'dark'] as const;

async function login(page: Page) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill('admin.dev');
  await page.locator('#password').fill('dev-only-admin');
  await page.locator('#kc-login').click();
  await page.waitForURL((url) => url.host === 'localhost:3000' || url.href.includes('CONFIGURE_TOTP'), { timeout: 30_000 });
  if (page.url().includes('CONFIGURE_TOTP')) {
    throw new Error('admin.dev demande un TOTP : lancer les captures par pnpm visuel (global-setup.mjs).');
  }
}

for (const mode of MODES) {
  test(`captures de référence : ${mode}`, async ({ page, request }) => {
    test.setTimeout(10 * 60_000);
    await seedPlanning(request, 'VPL'); // idempotent : déjà créé par le premier mode
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    await page.addInitScript((m) => window.localStorage.setItem('athena.theme', m), mode);
    await login(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, path] of PAGES) {
        await page.goto(path);
        await expect(page.locator('main#contenu')).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await expect.soft(page).toHaveScreenshot(`${mode}-${width}-${name}.png`, {
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          mask: [page.locator('time'), page.locator('.ath-gantt-today')],
          maxDiffPixelRatio: 0.001,
        });
      }
    }
  });
}
