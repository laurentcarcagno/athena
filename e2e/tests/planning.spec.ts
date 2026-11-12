import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// T-0162 : Planning remplace la Roadmap ; Gantt en lecture (barres aux bonnes dates, redirection, accessibilité par thème).

const axeSource = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');
const THEMES = ['hemeria', 'contrast', 'catppuccin', 'nord', 'gruvbox', 'solarized', 'dracula', 'tokyo-night', 'rose-pine'];
const API = 'http://127.0.0.1:3001/v1';

async function login(page: Page, username = 'admin.dev', password = 'dev-only-admin') {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

/** Projet à part, daté : A (lundi 9 au mardi 10 novembre 2026), B saisie trop tôt, jalon ; B est repoussée par le lien « précède ». */
async function seed(request: APIRequestContext): Promise<string> {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  const key = `PL${Date.now().toString(36).toUpperCase().slice(-6)}`;
  expect((await request.post(`${API}/projects`, { headers, data: { key, name: 'Planning e2e' } })).status()).toBe(201);
  expect((await request.post(`${API}/projects/${key}/trackers`, { headers, data: {
    key: 'TSK', name: 'Tâches', typeKey: 'task',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'start', label: 'Début', type: 'date', semanticRole: 'start_date' },
      { key: 'due', label: 'Échéance', type: 'date', semanticRole: 'due_date' },
      { key: 'progress', label: 'Avancement', type: 'number', semanticRole: 'progress' },
    ],
    statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }], transitions: [{ name: 'Rouvrir', from: null, to: 'todo' }],
  } })).status()).toBe(201);
  const make = async (values: Record<string, unknown>) => {
    const created = await request.post(`${API}/projects/${key}/trackers/TSK/artifacts`, { headers, data: { values } });
    expect(created.status()).toBe(201);
    return (await created.json()).key as string;
  };
  const a = await make({ title: 'Conception', start: '2026-11-09', due: '2026-11-10', progress: 50 });
  const b = await make({ title: 'Réalisation', start: '2026-11-10', due: '2026-11-10' });
  const m = await make({ title: 'Livraison', due: '2026-11-17' });
  for (const [from, to] of [[a, b], [b, m]]) {
    const link = await request.post(`${API}/projects/${key}/artifacts/${from}/links`, { headers, data: { to, type: 'precedes' } });
    expect(link.status(), await link.text()).toBeLessThan(300);
  }
  return key;
}

test('planning : entrée du rail, barres aux bonnes dates, redirection de /roadmap', async ({ page, request }) => {
  const key = await seed(request);
  await login(page);
  await page.goto(`/p/${key}/board`);
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${key}/planning$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Vues du planning' }).getByRole('link', { name: 'Gantt' })).toHaveAttribute('aria-current', 'page');

  // Tableau : les trois lignes, dates calculées (B repoussée au 11 novembre par le lien).
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(2)).toContainText('Réalisation');
  await expect(rows.nth(2).locator('time').first()).toHaveAttribute('datetime', '2026-11-11');

  // Diagramme : l'axe commence deux jours avant le 9 novembre ; un jour = 24 px.
  const bars = page.locator('svg[role="img"] rect.ath-gantt-bar');
  await expect(bars).toHaveCount(2);
  await expect(bars.nth(0)).toHaveAttribute('x', '48');
  await expect(bars.nth(0)).toHaveAttribute('width', '48');
  await expect(bars.nth(1)).toHaveAttribute('x', '96');
  await expect(page.locator('svg[role="img"] rect.ath-gantt-done')).toHaveAttribute('width', '24'); // 50 % de deux jours
  await expect(page.locator('svg[role="img"] .ath-gantt-milestone polygon')).toHaveCount(1);
  await expect(page.locator('svg[role="img"] path.ath-gantt-link')).toHaveCount(2);

  // Versions : l'ancienne Roadmap, dans le même écran.
  await page.getByRole('navigation', { name: 'Vues du planning' }).getByRole('link', { name: 'Versions' }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${key}/planning\\?vue=versions$`));
  await expect(page.getByText('Aucune version dans ce projet.')).toBeVisible();

  // Ancienne adresse conservée.
  await page.goto(`/p/${key}/roadmap`);
  await expect(page).toHaveURL(new RegExp(`/p/${key}/planning\\?vue=versions$`));
});

test('planning : lecture seule pour un utilisateur, aucun contrôle d’édition', async ({ page, request }) => {
  const key = await seed(request);
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto(`/p/${key}/planning`);
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('button', { name: /replanifier|lier|enregistrer/i })).toHaveCount(0);
});

test('planning : le Gantt passe axe-core dans chaque thème et chaque mode', async ({ page, request }) => {
  test.setTimeout(10 * 60_000);
  const key = await seed(request);
  await login(page);
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      const { csrf } = await (await page.request.get('/auth/session')).json() as { csrf: string };
      expect((await page.request.put('/v1/me/preferences', { data: { family: theme, theme: mode }, headers: { 'X-CSRF-Token': csrf } })).ok()).toBe(true);
      await page.evaluate(([t, m]) => { localStorage.setItem('athena.themeFamily', t!); localStorage.setItem('athena.theme', m!); }, [theme, mode]);
      await page.goto(`/p/${key}/planning`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      await expect(page.getByRole('table')).toBeVisible();
      await page.evaluate(axeSource);
      const found = await page.evaluate(async () => {
        const run = (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe.run;
        const result = await run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return result.violations.map((v) => `${v.id} : ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ; ')}`);
      });
      expect.soft(found, `${theme} ${mode}`).toEqual([]);
    }
  }
  const { csrf } = await (await page.request.get('/auth/session')).json() as { csrf: string };
  await page.request.put('/v1/me/preferences', { data: { family: null, theme: null }, headers: { 'X-CSRF-Token': csrf } });
  await page.evaluate(() => { localStorage.removeItem('athena.themeFamily'); localStorage.removeItem('athena.theme'); });
});
