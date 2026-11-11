import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** T-0136 (ADR-0004) : chaque thème, dans chaque mode, passe axe-core (contraste compris) sur six écrans ; palier tablette. */
const axeSource = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');
const THEMES = ['hemeria', 'contrast', 'catppuccin', 'nord', 'gruvbox'];
const PAGES = ['/projets', '/', '/p/ARI', '/p/ARI/t/BUG/tableau', '/p/ARI/a/ARI-BUG-0001', '/p/ARI/parametres/membres'];

async function login(page: Page) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill('admin.dev');
  await page.locator('#password').fill('dev-only-admin');
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

/** Préférences du compte, avec le jeton anti-CSRF de la session (comme le client web). */
async function savePreferences(page: Page, data: Record<string, string | null>) {
  const { csrf } = await (await page.request.get('/auth/session')).json() as { csrf: string };
  const response = await page.request.put('/v1/me/preferences', { data, headers: { 'X-CSRF-Token': csrf } });
  expect(response.ok(), await response.text()).toBe(true);
}

async function violations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[]; failureSummary?: string }> }> }> } })
      .axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return result.violations.map((v) => `${v.id} : ${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} (${(n.failureSummary ?? '').split('\n').slice(1, 2).join('').trim()})`).join(' ; ')}`);
  });
}

test('chaque thème × mode : axe-core sans violation, contraste compris, sur six écrans', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await login(page);
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      // Réglage enregistré sur le compte (il l'emporte au chargement sur la mémoire du navigateur), et dans le navigateur.
      await savePreferences(page, { family: theme, theme: mode });
      await page.evaluate(([t, m]) => { localStorage.setItem('athena.themeFamily', t!); localStorage.setItem('athena.theme', m!); }, [theme, mode]);
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator('main#contenu')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await page.waitForLoadState('networkidle');
        expect.soft(await violations(page), `${theme} ${mode} ${path}`).toEqual([]);
      }
    }
  }
  await savePreferences(page, { family: null, theme: null });
  await page.evaluate(() => { localStorage.removeItem('athena.themeFamily'); localStorage.removeItem('athena.theme'); });
});

test('tablette (1000 px) : rail replié en icônes, entrées nommées, panneau de détail en superposition', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await login(page);
  await page.evaluate(() => localStorage.removeItem('athena.rail.collapsed'));
  await page.goto('/p/ARI/t/BUG/tableau');
  const rail = page.locator('#rail');
  await expect(rail).toHaveClass(/ath-sidebar--collapsed/);
  expect(Math.round((await rail.boundingBox())!.width)).toBe(64);
  await expect(rail.getByRole('button', { name: 'Projets' })).toBeVisible();
  await page.getByRole('link', { name: 'ARI-BUG-0001' }).click();
  const panel = page.locator('.ath-split__panel');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
});

test('apparence : l’administration restreint les thèmes et fixe le défaut ; le Profil ne propose que ceux-là', async ({ page }) => {
  await login(page);
  await page.evaluate(() => { localStorage.removeItem('athena.themeFamily'); });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Apparence' }).click();
  for (const name of ['Catppuccin', 'Contraste élevé', 'Gruvbox']) await page.getByRole('checkbox', { name }).uncheck();
  await page.getByLabel('Thème par défaut').selectOption('nord');
  await page.getByRole('button', { name: 'Enregistrer l’apparence' }).click();
  await expect(page.getByText('Apparence enregistrée.')).toBeVisible();
  await page.goto('/profil');
  const group = page.getByRole('group', { name: 'Thème' });
  await expect(group.getByRole('radio')).toHaveCount(2);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nord');
  // Remise à l'état initial : tous les thèmes, Hemeria par défaut.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Apparence' }).click();
  for (const name of ['Catppuccin', 'Contraste élevé', 'Gruvbox']) await page.getByRole('checkbox', { name }).check();
  await page.getByLabel('Thème par défaut').selectOption('hemeria');
  await page.getByRole('button', { name: 'Enregistrer l’apparence' }).click();
  await expect(page.getByText('Apparence enregistrée.')).toBeVisible();
});
