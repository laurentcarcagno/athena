import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** T-0136 (ADR-0004) : chaque thème, dans chaque mode, passe axe-core (contraste compris) sur six écrans ; palier tablette. */
const axeSource = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');
const THEMES = ['athena', 'contrast', 'catppuccin', 'nord', 'gruvbox', 'solarized', 'dracula', 'tokyo-night', 'rose-pine', 'athena-arrondi', 'github'];
/** Thèmes décochés par le test d'apparence : il ne reste que Athena et Nord. */
const HIDDEN = ['Catppuccin', 'Contraste élevé', 'Gruvbox', 'Solarized', 'Dracula', 'Tokyo Night', 'Rosé Pine'];
const PAGES = ['/projets', '/', '/p/ARI', '/p/ARI/t/BUG/tableau', '/p/ARI/a/ARI-BUG-0001', '/p/ARI/parametres/membres', '/p/ARI/rapports/avancement',
  // Lot 11 (T-0157) : autres écrans modifiés.
  '/recherche', '/p/ARI/backlog', '/p/ARI/planning?vue=versions', '/p/ARI/board?tous=1', '/p/ARI/parametres/automatisations'];

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
  test.setTimeout(15 * 60_000);
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
  // Pied replié : boutons visibles en colonne depuis le bas, le dépliage tout en bas, au même niveau que le repli.
  const box = async (name: string) => (await rail.getByRole(name === 'Aide' ? 'link' : 'button', { name, exact: true }).boundingBox())!;
  const expand = await box('Déplier le rail');
  const logout = await box('Déconnexion');
  const help = await box('Aide');
  expect(help.y).toBeLessThan(expand.y);
  expect(logout.y).toBeLessThan(help.y);
  expect(Math.round(help.x)).toBe(Math.round(expand.x));
  await rail.getByRole('button', { name: 'Déplier le rail' }).click();
  const collapse = await box('Replier le rail');
  expect(Math.round(collapse.y)).toBe(Math.round(expand.y));
  await rail.getByRole('button', { name: 'Replier le rail' }).click();
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
  for (const name of HIDDEN) await page.getByRole('checkbox', { name }).uncheck();
  await page.getByLabel('Thème par défaut').selectOption('nord');
  await page.getByRole('button', { name: 'Enregistrer l’apparence' }).click();
  await expect(page.getByText('Apparence enregistrée.')).toBeVisible();
  await page.goto('/profil');
  const group = page.getByRole('group', { name: 'Thème' });
  await expect(group.getByRole('radio')).toHaveCount(2);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nord');
  // Remise à l'état initial : tous les thèmes, Athena par défaut.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Apparence' }).click();
  for (const name of HIDDEN) await page.getByRole('checkbox', { name }).check();
  await page.getByLabel('Thème par défaut').selectOption('athena');
  await page.getByRole('button', { name: 'Enregistrer l’apparence' }).click();
  await expect(page.getByText('Apparence enregistrée.')).toBeVisible();
});

test('icône de marque : un SVG piégé est servi nettoyé, typé et isolé ; affiché par <img> dans le rail ; retiré après confirmation (T-0137)', async ({ page }) => {
  await login(page);
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Apparence' }).click();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)"><script>alert(2)</script><path d="M2 2h20v20H2z" fill="#E0B000"/></svg>';
  // Script interdit : refus explicite.
  await page.getByLabel('Téléverser l’icône : Tous les thèmes').setInputFiles({ name: 'piege.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.getByText(/élément <script> interdit/)).toBeVisible();
  // Gestionnaire d'événement : retiré, l'image est acceptée.
  const clean = svg.replace('<script>alert(2)</script>', '');
  await page.getByLabel('Téléverser l’icône : Tous les thèmes').setInputFiles({ name: 'marque.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(clean) });
  await expect(page.getByText('Icône enregistrée.')).toBeVisible();
  const mark = page.locator('#rail .ath-sidebar__mark');
  await expect(mark).toHaveAttribute('src', /\/v1\/brand\/athena\/mark\?v=/);
  const response = await page.request.get((await mark.getAttribute('src'))!);
  expect(response.headers()['content-type']).toBe('image/svg+xml');
  expect(response.headers()['content-security-policy']).toContain('sandbox');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(await response.text()).not.toMatch(/onload|script/i);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/v1\/brand\/athena\/mark/);
  // Retrait, après confirmation : l'icône par défaut du thème revient.
  await page.getByRole('button', { name: 'Retirer l’icône : Tous les thèmes' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Icône retirée.')).toBeVisible();
  await expect(mark).toHaveAttribute('src', /^data:image\/svg\+xml/);
  // Logo horizontal (PNG) : remplace icône et nom dans le rail déplié ; retiré ensuite.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.getByLabel('Téléverser le logo : Tous les thèmes').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#rail .ath-sidebar__logo')).toHaveAttribute('src', /\/v1\/brand\/athena\/logo\?v=/);
  await page.getByRole('button', { name: 'Retirer le logo : Tous les thèmes' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('#rail .ath-sidebar__logo')).toHaveCount(0);
});

test('teinte d’un statut : choisie dans la configuration du tracker, visible dans le tableau, effacée ensuite (T-0138)', async ({ page }) => {
  await login(page);
  await page.goto('/p/ARI/parametres/trackers/BUG');
  await page.getByLabel('Teinte du statut Ouvert').selectOption('teal');
  await expect(page.getByText('Teinte enregistrée.')).toBeVisible();
  await page.goto('/p/ARI/t/BUG/tableau');
  await expect(page.locator('tbody .ath-pill', { hasText: 'Ouvert' }).first()).toHaveClass(/ath-pill--hue-teal/);
  await page.goto('/p/ARI/parametres/trackers/BUG');
  await page.getByLabel('Teinte du statut Ouvert').selectOption('');
  await expect(page.getByText('Teinte enregistrée.')).toBeVisible();
  await page.goto('/p/ARI/t/BUG/tableau');
  await expect(page.locator('tbody .ath-pill', { hasText: 'Ouvert' }).first()).not.toHaveClass(/ath-pill--hue-/);
});
