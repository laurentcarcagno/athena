import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seedPlanning } from './planning-seed';

// T-0162 à T-0165 : Planning (Gantt, Board, Liste, Versions) ; barres aux bonnes dates, édition, filtres, accessibilité par thème.

const axeSource = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');
const THEMES = ['athena', 'contrast', 'catppuccin', 'nord', 'gruvbox', 'solarized', 'dracula', 'tokyo-night', 'rose-pine'];

async function login(page: Page, username = 'admin.dev', password = 'dev-only-admin') {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

const chartOf = (page: Page) => page.locator('svg.ath-gantt-svg:not(.ath-gantt-svg--head)');
const rowOf = (page: Page, title: string) => page.getByRole('row').filter({ hasText: title });

test('planning : entrée du rail, barres aux bonnes dates, redirection de /roadmap', async ({ page, request }) => {
  const { key } = await seedPlanning(request);
  await login(page);
  await page.goto(`/p/${key}/board`);
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${key}/planning$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Vues du planning' });
  await expect(tabs.getByRole('link', { name: 'Gantt' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.getByRole('link')).toHaveText(['Gantt', 'Board', 'Liste', 'Versions']);

  // Tableau : six lignes dans l'ordre de la hiérarchie ; Réalisation est repoussée au 11 novembre par le lien « précède ».
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(2)).toContainText('Réalisation');
  await expect(rows.nth(2).locator('time').first()).toHaveAttribute('datetime', '2026-11-11');
  await expect(rows.nth(4).locator('time').first()).toHaveAttribute('datetime', '2026-11-12'); // la phase parente : dates des enfants

  // Diagramme : l'axe commence deux jours avant le 9 novembre ; un jour = 24 px.
  const bars = chartOf(page).locator('rect.ath-gantt-bar');
  await expect(bars).toHaveCount(5);
  await expect(bars.nth(0)).toHaveAttribute('x', '48');
  await expect(bars.nth(0)).toHaveAttribute('width', '48');
  await expect(bars.nth(1)).toHaveAttribute('x', '96');
  await expect(chartOf(page).locator('rect.ath-gantt-done').first()).toHaveAttribute('width', '24'); // 50 % de deux jours
  await expect(chartOf(page).locator('.ath-gantt-milestone polygon')).toHaveCount(1);
  await expect(chartOf(page).locator('path.ath-gantt-link')).toHaveCount(2);

  // Versions : l'ancienne Roadmap, dans le même écran.
  await tabs.getByRole('link', { name: 'Versions' }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${key}/planning\\?vue=versions$`));
  await expect(page.getByText('Aucune version dans ce projet.')).toBeVisible();

  // Ancienne adresse conservée.
  await page.goto(`/p/${key}/roadmap`);
  await expect(page).toHaveURL(new RegExp(`/p/${key}/planning\\?vue=versions$`));
});

test('planning : lecture seule pour un utilisateur, aucun contrôle d’édition', async ({ page, request }) => {
  const { key } = await seedPlanning(request);
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto(`/p/${key}/planning`);
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('.ath-gantt-handle, .ath-gantt-resize, input.ath-gantt-duration')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Lier à…$|replanifier|enregistrer/i })).toHaveCount(0);
  await expect(page.getByText(/Planning en lecture/)).toBeVisible();
  // Demander un décalage : la demande part en commentaire et mentionne les chefs du projet.
  await page.getByRole('button', { name: 'Réalisation', exact: true }).click();
  await page.getByRole('button', { name: 'Demander un décalage' }).click();
  await page.getByLabel('Motif').fill('Banc indisponible cette semaine');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByText(/Demande envoyée|Demande ajoutée/).first()).toBeVisible();
});

test('planning : le chef de projet change une durée, les successeurs suivent et le déplacement est annoncé', async ({ page, request }) => {
  const { key } = await seedPlanning(request);
  await login(page);
  await page.goto(`/p/${key}/planning`);
  // Conception dure 2 jours (9-10). À 4 jours elle finit le 12 : Réalisation passe du 11 au 13, le jalon reste au 17.
  await page.getByRole('button', { name: `Modifier la durée de ${key}-TSK-0001 (2 j)` }).click();
  const duration = page.getByLabel('Durée de ' + key + '-TSK-0001 en jours ouvrés');
  await duration.fill('4');
  await duration.press('Enter');
  await expect(page.getByText('3 tickets déplacés.').first()).toBeVisible(); // Conception, Réalisation et la phase parente (dates calculées, jamais écrites avant)
  await expect(rowOf(page, 'Réalisation').locator('time').first()).toHaveAttribute('datetime', '2026-11-13');
  await expect(chartOf(page).locator('rect.ath-gantt-bar').nth(1)).toHaveAttribute('x', '144'); // (13 - 7) * 24
  await page.reload();
  await expect(rowOf(page, 'Réalisation').locator('time').first()).toHaveAttribute('datetime', '2026-11-13'); // enregistré
});

test('planning : clavier et glisser de la souris sur une barre', async ({ page, request }) => {
  const { key } = await seedPlanning(request);
  await login(page);
  await page.goto(`/p/${key}/planning`);
  // Clavier : une barre est un bouton ; flèche droite = un jour ouvré de plus au début.
  const conception = chartOf(page).locator('g[role="button"]').first();
  await conception.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/ticket(s)? déplacé/).first()).toBeVisible();
  await expect(rowOf(page, 'Conception').locator('time').first()).toHaveAttribute('datetime', '2026-11-10');
  // Souris : glisser la barre de Tests unitaires de 2 jours vers la droite (48 px) déplace son début de 2 jours ouvrés.
  const bar = chartOf(page).locator('g[role="button"] rect.ath-gantt-bar').nth(2); // Conception, Réalisation, Tests unitaires
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(rowOf(page, 'Tests unitaires').locator('time').first()).toHaveAttribute('datetime', '2026-11-16'); // jeudi 12 + 2 jours ouvrés
});

test('planning : lier deux tâches, cycle refusé avec un message, retirer le lien', async ({ page, request }) => {
  const { key } = await seedPlanning(request);
  await login(page);
  await page.goto(`/p/${key}/planning`);
  // Livraison (jalon) suit déjà Réalisation. Lier Livraison → Conception ferme un cycle : refusé, message affiché.
  await page.getByRole('button', { name: 'Livraison', exact: true }).click();
  await page.getByRole('button', { name: 'Lier à…', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').selectOption(`${key}-TSK-0001`);
  await dialog.getByRole('button', { name: 'Lier', exact: true }).click();
  await expect(page.getByText(/cycle/i).first()).toBeVisible();
  // Retirer le lien Conception → Réalisation depuis le dialogue de Conception.
  await page.getByRole('button', { name: 'Conception', exact: true }).click();
  await page.getByRole('button', { name: 'Lier à…', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Retirer le lien/ }).click();
  await expect(page.getByText('Lien retiré.').first()).toBeVisible();
  await expect(chartOf(page).locator('path.ath-gantt-link')).toHaveCount(1);
});

test('planning : le décalage d’un lien se modifie sur place et repousse le successeur', async ({ page, request }) => {
  const { key } = await seedPlanning(request);
  await login(page);
  await page.goto(`/p/${key}/planning`);
  await expect(rowOf(page, 'Réalisation').locator('time').first()).toHaveAttribute('datetime', '2026-11-11');
  await page.getByRole('button', { name: 'Conception', exact: true }).click();
  await page.getByRole('button', { name: 'Lier à…', exact: true }).click();
  const lag = page.getByRole('dialog').getByLabel(/Décalage du lien en jours ouvrés/);
  await lag.fill('2');
  await lag.press('Enter');
  await expect(page.getByText(/ticket(s)? déplacé/).first()).toBeVisible();
  await expect(rowOf(page, 'Réalisation').locator('time').first()).toHaveAttribute('datetime', '2026-11-13'); // fin le 10 + 2 jours de décalage
});

test('planning : chemin critique, Board et Liste gardent le même filtre dans l’adresse', async ({ page, request }) => {
  const { key } = await seedPlanning(request);
  await login(page);
  await page.goto(`/p/${key}/planning`);
  await page.getByRole('switch', { name: 'Chemin critique' }).click();
  await expect(page.getByRole('switch', { name: 'Chemin critique' })).toBeChecked();
  await expect(page).toHaveURL(/critique=1/);
  await expect(page.getByText('Critique', { exact: true }).first()).toBeVisible();
  await expect(chartOf(page).locator('g.ath-gantt-critical').first()).toBeVisible();

  await page.getByLabel('Rechercher une tâche').fill('tests');
  await expect(page).toHaveURL(/q=tests/);
  const tabs = page.getByRole('navigation', { name: 'Vues du planning' });
  await tabs.getByRole('link', { name: 'Liste' }).click();
  await expect(page).toHaveURL(/vue=list/);
  await expect(page).toHaveURL(/q=tests/);
  const list = page.getByRole('table');
  await expect(list.getByRole('row')).toHaveCount(4); // en-tête, la phase et ses deux enfants
  await expect(list.getByRole('columnheader', { name: 'Marge' })).toBeVisible();
  await tabs.getByRole('link', { name: 'Board' }).click();
  await expect(page).toHaveURL(/vue=board/);
  await expect(page).toHaveURL(/q=tests/);
  await expect(page.getByRole('region', { name: 'À faire' }).getByText('Tests unitaires')).toBeVisible();
  await expect(page.getByText('Conception')).toHaveCount(0);
  await expect(page.getByLabel('Rechercher une tâche')).toHaveValue('tests');
});

test('planning : la section Planification de la fiche, avancement modifiable par le responsable', async ({ page, request }) => {
  const { key, tasks } = await seedPlanning(request);
  await login(page);
  await page.goto(`/p/${key}/a/${tasks['a']}`);
  await expect(page.getByText('Précédée par')).toBeVisible();
  await expect(page.getByRole('link', { name: tasks['b']! }).first()).toBeVisible(); // successeur
  const progress = page.getByLabel('Avancement', { exact: true });
  await progress.fill('80');
  await progress.blur();
  await expect(page.getByText('Modification enregistrée.').first()).toBeVisible();
});

async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe.run;
    const result = await run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return result.violations.map((v) => `${v.id} : ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ; ')}`);
  });
}

test('planning : Gantt, Board, Liste et fiche passent axe-core dans chaque thème et chaque mode', async ({ page, request }) => {
  test.setTimeout(20 * 60_000);
  const { key, tasks } = await seedPlanning(request);
  await login(page);
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      const { csrf } = await (await page.request.get('/auth/session')).json() as { csrf: string };
      expect((await page.request.put('/v1/me/preferences', { data: { family: theme, theme: mode }, headers: { 'X-CSRF-Token': csrf } })).ok()).toBe(true);
      await page.evaluate(([t, m]) => { localStorage.setItem('athena.themeFamily', t!); localStorage.setItem('athena.theme', m!); }, [theme, mode]);
      for (const path of [`/p/${key}/planning?critique=1`, `/p/${key}/planning?vue=board`, `/p/${key}/planning?vue=list`, `/p/${key}/a/${tasks['a']}`]) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('main#contenu')).toBeVisible();
        expect.soft(await axeViolations(page), `${theme} ${mode} ${path}`).toEqual([]);
      }
    }
  }
  const { csrf } = await (await page.request.get('/auth/session')).json() as { csrf: string };
  await page.request.put('/v1/me/preferences', { data: { family: null, theme: null }, headers: { 'X-CSRF-Token': csrf } });
  await page.evaluate(() => { localStorage.removeItem('athena.themeFamily'); localStorage.removeItem('athena.theme'); });
});
