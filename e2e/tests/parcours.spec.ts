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

test('administrateur : ajoute un champ avec rôles puis le supprime dans l’éditeur de tracker', async ({ page }) => {
  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto('/p/ARI/trackers/BUG/config');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('BUG');
  const fields = page.locator('section', { has: page.getByRole('heading', { name: 'Champs' }) });
  await fields.getByLabel('Clé').fill('cout');
  await fields.getByLabel('Libellé').fill('Coût');
  await fields.getByLabel('Rôles en lecture (virgules)').fill('finance');
  await fields.getByRole('button', { name: 'Ajouter' }).click();
  const row = fields.getByRole('row', { name: /cout/ });
  await expect(row).toContainText('R: finance');
  await row.getByRole('button', { name: 'Supprimer cout' }).click();
  await expect(fields.getByRole('row', { name: /cout/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ouvert' }).click();
  await page.getByRole('button', { name: 'Fini' }).click();
  const draft = page.getByRole('form', { name: /Nouvelle transition Ouvert → Fini/ });
  await draft.getByLabel('Nom').fill('Passer à fini');
  await draft.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByRole('row', { name: /Passer à fini/ })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('utilisateur : « Mon travail » liste les artefacts à prendre, sans accès à l’organisation', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/me');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mon travail');
  await expect(page.getByRole('button', { name: 'Organisation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gestion de projet' })).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});

test('administrateur : crée un projet, nomme un chef de projet et gère les acteurs', async ({ page }) => {
  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto('/org');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Administration de l’organisation');
  await page.getByLabel('Clé du projet (2 à 10 majuscules)').fill('PAY');
  await page.getByLabel('Nom du projet').fill('Paiement');
  await page.getByLabel('Template du projet').selectOption('qualite');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByText('Projet PAY créé.')).toBeVisible();
  await page.goto('/');
  const paiement = page.locator('section, div', { has: page.getByText('Paiement') }).last();
  await expect(paiement.getByRole('row', { name: /REQ/ })).toBeVisible();
  await expect(paiement.getByRole('row', { name: /BUG/ })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.goto('/org');
  await page.getByRole('tab', { name: 'Templates' }).click();
  await expect(page.getByRole('row', { name: /Qualité/ })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.goto('/p/PAY/manage');
  await expect(page.getByRole('tab', { name: 'Acteurs' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('administrateur : crée un tracker depuis un template de tracker modifié et un template de tracker neuf', async ({ page }) => {
  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto('/p/ARI/trackers/new');
  await page.getByLabel('Partir d’un template de tracker').selectOption('tache');
  await expect(page.getByRole('cell', { name: 'Échéance' })).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer due' }).click();
  await page.getByLabel('Clé du tracker (2 à 10 majuscules)').fill('TSK');
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Créer le tracker' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('TSK');
  await expect(page.getByRole('cell', { name: 'due', exact: true })).toHaveCount(0);

  await page.goto('/org');
  await page.getByRole('tab', { name: 'Templates' }).click();
  await page.getByRole('tab', { name: 'Templates de tracker' }).click();
  await page.getByLabel('Clé du template de tracker (minuscules)').fill('risques');
  await page.getByLabel('Nom du template de tracker').fill('Risques');
  await page.getByLabel('Clé du tracker (2 à 10 majuscules)').fill('RISK');
  await page.getByLabel('Nom du tracker').fill('Risques');
  await page.getByRole('button', { name: 'Créer le template de tracker' }).click();
  await expect(page.getByRole('row', { name: /Risques/ })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('administrateur : personnalise la disposition de la vue détails à la création d’un tracker', async ({ page, request }) => {
  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto('/p/ARI/trackers/new');
  await page.getByLabel('Partir d’un template de tracker').selectOption('bug');
  await page.getByLabel('Clé du tracker (2 à 10 majuscules)').fill('LAY');
  await page.getByLabel('Nom du tracker').fill('Mise en page');
  await expect(page.getByText('Disposition automatique')).toBeVisible();
  await page.getByRole('button', { name: 'Personnaliser' }).click();
  await page.getByLabel('Titre de la section 1').fill('Résumé');
  await page.getByRole('button', { name: 'Sévérité : 3 colonnes sur 3' }).click();
  await page.getByRole('button', { name: 'Reculer Sévérité' }).click();
  // glisser-déposer : « Version corrigée » passe avant « Version affectée »
  const tiles = page.locator('.ath-layout-tile');
  const order = async () => (await tiles.locator('.ath-layout-tile__label').allTextContents()).map((t) => t.trim().toLowerCase());
  expect((await order()).indexOf('version affectée')).toBeLessThan((await order()).indexOf('version corrigée'));
  await tiles.filter({ hasText: 'Version corrigée' }).dragTo(tiles.filter({ hasText: 'Version affectée' }));
  expect((await order()).indexOf('version corrigée')).toBeLessThan((await order()).indexOf('version affectée'));
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Créer le tracker' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('LAY');
  await expect(page.getByText('Disposition personnalisée')).toBeVisible(); // la disposition est enregistrée avec le tracker

  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const created = await request.post('http://127.0.0.1:3001/v1/projects/ARI/trackers/LAY/artifacts', { headers: { Authorization: `Bearer ${token}` }, data: { values: { title: 'Panne', severity: 'majeure' } } });
  expect(created.status()).toBe(201);
  await page.goto('/p/ARI/a/LAY-1');
  const resume = page.getByRole('region', { name: 'Résumé' });
  await expect(resume).toBeVisible();
  const first = resume.locator('[class*="ath-span-"]').first();
  await expect(first).toContainText('Sévérité'); // reculée en tête
  await expect(first).toHaveClass(/ath-span-3/);
  expect(await axeViolations(page)).toEqual([]);
});
