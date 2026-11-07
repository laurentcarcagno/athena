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

  // Remise en état : les autres scénarios attendent les commentaires activés.
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('checkbox', { name: 'Commentaire' }).check();
  await expect(page.getByRole('checkbox', { name: 'Commentaire' })).toBeChecked();
});

test('mentions : autocomplétion au clavier, rendu assaini, notification et entrée dans Mon travail', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };

  await login(page, 'user.dev', 'dev-only-user');
  await expect(page.getByText('Ariane')).toBeVisible(); // données chargées : le compte est enregistré côté serveur
  // Un autre compte mentionne user.dev.
  const mentioned = await request.post('http://127.0.0.1:3001/v1/projects/ARI/artifacts/ARI-BUG-0001/comments', { headers, data: { body: '@user.dev à toi <b>gras</b>' } });
  expect(mentioned.status()).toBe(201);
  expect(((await mentioned.json()) as { mentions: string[] }).mentions).toEqual(['user.dev']);

  await page.goto('/me');
  await expect(page.getByRole('heading', { name: 'Mentions' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ARI-BUG-0001' }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Notifications, \d+ non lue/ }).click();
  await expect(page.getByText('vous a mentionné').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Écrire une mention avec l'autocomplétion, au clavier.
  await page.goto('/p/ARI/a/ARI-BUG-0001');
  await page.getByRole('tab', { name: 'Commentaires' }).click();
  const box = page.getByRole('combobox', { name: 'Commentaire' });
  await box.click();
  await page.keyboard.type('Merci @admin');
  const option = page.getByRole('option', { name: /admin\.dev/ });
  await expect(option).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(box).toHaveValue('Merci @admin.dev ');
  await page.keyboard.type('<i>x</i>');
  await page.getByRole('button', { name: 'Ajouter', exact: false }).last().click();
  const shown = page.locator('.ath-comment__body', { hasText: 'Merci @admin.dev' }).last();
  await expect(shown).toBeVisible();
  await expect(shown.locator('.ath-mention')).toHaveText('@admin.dev');
  await expect(shown.locator('i')).toHaveCount(0); // le balisage reste du texte
  await expect(shown).toContainText('<i>x</i>');
});
