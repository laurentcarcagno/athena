import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const axeSource = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Audit axe-core dans le navigateur réel, contraste compris. */
async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[]; failureSummary?: string }> }> }> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return result.violations.map((v) => `${v.id} : ${v.nodes.map((n) => `${n.target.join(' ')} (${(n.failureSummary ?? '').split('\n').slice(1, 2).join('').trim()})`).join(' ; ')}`);
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

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('.ath-root')!).backgroundColor);

/** Pages représentatives : liste, tableau de tracker, fiche item avec ses onglets, circuit d'approbation, Mon travail. */
const PAGES: Array<[string, string]> = [
  ['projets', '/'],
  ['mon travail', '/me'],
  ['vue d’ensemble', '/p/ARI'],
  ['tracker (tableau)', '/p/ARI/t/BUG/tableau'],
  ['fiche item', '/p/ARI/a/ARI-BUG-0001'],
  ['configuration du tracker', '/p/ARI/trackers/BUG/config'],
];

test('thème sombre : bascule au clavier, mémorisée, système respecté, axe (contraste compris) dans les deux thèmes', async ({ page }, testInfo) => {
  await login(page, 'admin.dev', 'dev-only-admin');
  await expect(page.getByText('Ariane')).toBeVisible();

  // Par défaut : système. Navigateur en clair, puis en sombre, sans rien toucher.
  await page.emulateMedia({ colorScheme: 'light' });
  const clair = await background(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  const sombreSysteme = await background(page);
  expect(clair).toBe('rgb(240, 247, 252)'); // Cold Mist
  expect(sombreSysteme).toBe('rgb(10, 27, 39)'); // {semantic.surface.app} sombre
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);

  // La bascule au clavier : système → clair → sombre ; un choix explicite l'emporte sur le système.
  await page.emulateMedia({ colorScheme: 'dark' });
  const toggle = page.getByRole('button', { name: /^Thème : / });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Thème : clair. Changer de thème.' })).toBeFocused();
  expect(await background(page)).toBe('rgb(240, 247, 252)'); // clair forcé malgré un navigateur sombre
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Thème : sombre. Changer de thème.' })).toBeFocused();
  expect(await background(page)).toBe('rgb(10, 27, 39)');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await background(page)).toBe('rgb(10, 27, 39)'); // sombre forcé malgré un navigateur clair

  // Mémorisé : le réglage survit au rechargement.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Thème : sombre. Changer de thème.' })).toBeVisible();
  expect(await background(page)).toBe('rgb(10, 27, 39)');

  // Axe dans le thème sombre, puis dans le thème clair, sur les pages représentatives.
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((t) => { window.localStorage.setItem('athena.theme', t); document.documentElement.setAttribute('data-theme', t); }, theme);
    for (const [name, path] of PAGES) {
      await page.goto(path);
      await expect(page.locator('main#contenu')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await axeViolations(page), `${theme} : ${name}`).toEqual([]);
    }
    // Capture visuelle jointe au rapport (aucune comparaison de pixels : la référence est la mesure axe et les couleurs calculées).
    await page.goto('/p/ARI/t/BUG/tableau');
    await page.waitForLoadState('networkidle');
    await testInfo.attach(`tableau-${theme}.png`, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
  }

  // Retour à « système » : l'attribut disparaît et la mémoire est effacée.
  await page.goto('/');
  const reglage = page.getByRole('button', { name: /^Thème : / });
  while (!(await reglage.getAttribute('aria-label'))?.startsWith('Thème : système')) await reglage.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  expect(await page.evaluate(() => window.localStorage.getItem('athena.theme'))).toBeNull();
});
