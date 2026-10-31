import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const axeSource = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Audit axe-core dans le navigateur réel, contraste compris. */
async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
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

test('connexion Keycloak, liste des projets, ouverture d’un artefact et transition', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await expect(page.getByText('Ariane')).toBeVisible();
  await page.getByRole('link', { name: /Bugs|BUG/ }).first().click();
  await expect(page.getByText('BUG-1')).toBeVisible();
  await page.getByText('BUG-1').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('BUG-1');
  await expect(page.getByText('Crash au démarrage').first()).toBeVisible();
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByText('Fini').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Terminer' })).toHaveCount(0);
});

test('une session non authentifiée est redirigée vers Keycloak', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await expect(page.locator('#username')).toBeVisible();
});

test('accessibilité réelle (contraste inclus) : projets, liste et fiche', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await expect(page.getByText('Ariane')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('link', { name: /Bugs|BUG/ }).first().click();
  await expect(page.getByText('BUG-1')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByText('BUG-1').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('BUG-1');
  expect(await axeViolations(page)).toEqual([]);
});

test('pièces jointes : envoi, liste, téléchargement identique, suppression', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/a/BUG-1');
  await page.getByRole('tab', { name: 'Pièces jointes' }).click();
  await expect(page.getByText('Aucune pièce jointe.')).toBeVisible();
  await page.locator('#attachment-file').setInputFiles({ name: 'capture.txt', mimeType: 'text/plain', buffer: Buffer.from('contenu de test') });
  const link = page.getByRole('link', { name: 'capture.txt' });
  await expect(link).toBeVisible();
  const download = page.waitForEvent('download');
  await link.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('capture.txt');
  expect((await import('node:fs')).readFileSync((await file.path())!, 'utf8')).toBe('contenu de test');
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Aucune pièce jointe.')).toBeVisible();
});
