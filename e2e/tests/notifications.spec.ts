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
}

test('suivre un item, être notifié d’un commentaire, lire au clavier, marquer lu, régler les événements', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };

  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/a/ARI-BUG-0001');
  await expect(page.getByLabel('Titre (obligatoire)')).toBeVisible();
  // Celui qui commente ou crée un item le suit déjà (autres scénarios) : on part d'un état neutre.
  const unfollow = page.getByRole('button', { name: 'Ne plus suivre' }).first();
  const follow = page.getByRole('button', { name: 'Suivre', exact: true }).first();
  await expect(unfollow.or(follow)).toBeVisible();
  if (await unfollow.isVisible()) { await unfollow.click(); await expect(follow).toBeVisible(); }
  await follow.click();
  await expect(unfollow).toBeVisible();

  // Un autre utilisateur commente : l’abonné reçoit une notification, jamais l’auteur du commentaire.
  const commented = await request.post('http://127.0.0.1:3001/v1/projects/ARI/artifacts/ARI-BUG-0001/comments', { headers, data: { body: 'À relire avant la revue' } });
  expect(commented.status()).toBe(201);

  await page.reload();
  const bell = page.getByRole('button', { name: /^Notifications, \d+ non lue/ });
  await expect(bell).toBeVisible();

  // Ouverture et fermeture au clavier.
  await bell.focus();
  await page.keyboard.press('Enter');
  const list = page.getByRole('list', { name: 'Liste des notifications' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('link', { name: 'ARI-BUG-0001' }).first()).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(bell).toBeFocused();

  // Marquer lu.
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Tout marquer comme lu' }).click();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // Réglages : désactiver les commentaires, qui ne notifient alors plus.
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('checkbox', { name: 'Commentaire' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Commentaire' })).not.toBeChecked();
  expect((await request.post('http://127.0.0.1:3001/v1/projects/ARI/artifacts/ARI-BUG-0001/comments', { headers, data: { body: 'Silence' } })).status()).toBe(201);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
});
