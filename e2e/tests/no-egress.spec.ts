import { expect, test, type Page } from '@playwright/test';
import { settle } from './settle';

/** Hôtes internes de la recette : l'application, l'API et le fournisseur d'identité local (Keycloak du poste de développement). */
const INTERNAL = new Set(['localhost', '127.0.0.1']);

/** Surveille toute requête qui sort de l'origine de l'application ou des hôtes internes ; elle est consignée (observation seule : une route Playwright perturbe les redirections d'identité). */
function watchEgress(page: Page): string[] {
  const out: string[] = [];
  const external = (u: string) => { const url = new URL(u); return !['data:', 'blob:', 'about:'].includes(url.protocol) && !INTERNAL.has(url.hostname); };
  // consignation de toute requête, navigations comprises (une redirection vers l'extérieur est aussi une sortie)
  page.on('request', (request) => { if (external(request.url())) out.push(`${request.method()} ${new URL(request.url()).origin}`); });
  return out;
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('preuve : le garde du navigateur consigne une requête vers un hôte public', async ({ page }) => {
  const egress = watchEgress(page);
  await login(page, 'admin.dev', 'dev-only-admin');
  await page.evaluate(() => fetch('https://telemetrie.public-site.net/collect').catch(() => undefined));
  await page.evaluate(() => { const img = new Image(); img.src = 'https://cdn.public-site.net/logo.png'; document.body.append(img); });
  await expect.poll(() => egress.length).toBeGreaterThanOrEqual(2);
  expect(egress).toEqual(expect.arrayContaining(['GET https://telemetrie.public-site.net', 'GET https://cdn.public-site.net']));
});

test('aucune requête ne sort de l’origine sur les pages principales', async ({ page }) => {
  const egress = watchEgress(page);
  await login(page, 'admin.dev', 'dev-only-admin');
  // Après la connexion, toute requête du navigateur reste sur l'origine de l'application (API et identité relayées par elle) :
  // aucun autre hôte, pas même local.
  const origins = new Set<string>();
  page.on('request', (request) => { const u = new URL(request.url()); if (!['data:', 'blob:', 'about:'].includes(u.protocol)) origins.add(u.origin); });
  for (const path of ['/', '/p/ARI', '/p/ARI/trackers', '/p/ARI/rapports/tracabilite', '/p/ARI/planification', '/p/ARI/rapports/activite', '/p/ARI/membres', '/p/ARI/recherche', '/org', '/aide', '/projets', '/profil', '/notifications']) {
    await page.goto(path);
    await settle(page);
    await expect(page.locator('main, [role="main"], #root').first()).toBeVisible();
  }
  expect(egress, `requêtes sortantes : ${egress.join(', ')}`).toEqual([]);
  expect([...origins]).toEqual(['http://localhost:3000']);
});
