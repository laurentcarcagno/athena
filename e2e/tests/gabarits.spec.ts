import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

/** Crée un projet depuis la page Organisation : gabarit, version et catégorie de criticité choisis dans le formulaire. */
async function createFrom(page: Page, key: string, name: string, template: string, criticality: string) {
  await page.goto('/org');
  await page.getByRole('button', { name: '+ Nouveau projet' }).click(); // T-0151 : création à la demande
  await page.getByLabel(/^Clé du projet/).fill(key);
  await page.getByLabel('Nom du projet').fill(name);
  await page.getByLabel(/^Gabarit/).selectOption(template);
  await expect(page.getByLabel('Version du gabarit')).toBeVisible();
  await page.getByLabel('Catégorie de criticité').selectOption(criticality);
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByText(`Projet ${key} créé.`)).toBeVisible();
}

test('un projet créé depuis le gabarit Spatial reçoit trackers, phase et règles, puis passe à la conformité', async ({ page }) => {
  await login(page, 'admin.dev', 'dev-only-admin');
  await createFrom(page, 'SPA1', 'Satellite', 'spatial', 'B');
  await page.goto('/p/SPA1');
  const card = page.getByRole('heading', { name: 'Gabarit et phase' }).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ath-card ")][1]');
  await expect(card.getByText('spatial 1.1')).toBeVisible();
  await expect(card.getByRole('region', { name: 'Phase en cours' }).getByText('Exigences', { exact: true })).toBeVisible();
  await expect(card.getByRole('region', { name: 'Frise des gates' }).getByText('Exigences', { exact: true })).toBeVisible();
  await expect(card.getByText('Tous les RID de la revue SRR sont clos')).toBeVisible();
  await expect(card.getByText('Aucun écart : le projet correspond à sa version du gabarit.')).toBeVisible();
  await page.goto('/p/SPA1/trackers');
  for (const name of ['Review Item Discrepancies (RID)', 'Anomalies logicielles (SPR)', 'Exigences logicielles (TS)']) await expect(page.getByText(name).first()).toBeVisible();
  await page.goto('/p/SPA1/tracabilite');
  await expect(page.getByRole('heading', { name: /Exigences logicielles tracées vers la RB/ })).toBeVisible();

  await page.goto('/p/SPA1/conformite');
  await page.getByRole('button', { name: 'Importer des clauses' }).click();
  const csv = 'référence,titre,texte\n5.1,Plan de développement,Texte\n5.2,Revue de conception,Texte\n';
  await page.getByLabel('Fichier CSV').setInputFiles({ name: 'ecss.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('form', { name: 'Importer les clauses d’une norme' }).getByRole('button', { name: 'Importer' }).click();
  await expect(page.getByText('2 créée(s), 0 mise(s) à jour, 0 inchangée(s), 0 en erreur.').first()).toBeVisible();
  await expect(page.getByText('0 % de clauses applicables couvertes')).toBeVisible();

  await page.getByRole('button', { name: 'Tailoring de la clause 5.2' }).click();
  const form = page.getByRole('form', { name: 'Tailoring de la clause 5.2' });
  await form.getByLabel('Applicabilité').selectOption('not_applicable');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(form.getByRole('alert')).toContainText('La justification est obligatoire');
  await form.getByLabel('Justification').fill('Hors périmètre en catégorie B');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Hors périmètre en catégorie B')).toBeVisible();
});

test('un projet créé depuis le gabarit Défense reçoit ses trackers et ses règles', async ({ page }) => {
  await login(page, 'admin.dev', 'dev-only-admin');
  await createFrom(page, 'DEF1', 'Programme', 'defense', 'C');
  await page.goto('/p/DEF1/trackers');
  for (const name of ['Faits techniques', 'Dérogations et concessions', 'Exigences client (STB)']) await expect(page.getByText(name).first()).toBeVisible();
  await page.goto('/p/DEF1/tracabilite');
  await expect(page.getByRole('heading', { name: /Faits techniques rattachés à un article de configuration/ })).toBeVisible();
});

test('dérivation d’un gabarit livré : éditeur par étapes jusqu’à la publication', async ({ page }) => {
  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto('/org');
  await page.getByRole('tab', { name: 'Gabarits' }).click();
  await page.getByRole('button', { name: 'Dériver Spatial (ECSS)' }).click();
  await expect(page.getByRole('button', { name: 'Étape suivante' })).toBeDisabled();
  await page.getByLabel('Clé', { exact: true }).fill('spatial-b-e2e');
  await page.getByLabel('Nom', { exact: true }).fill('Spatial — catégorie B');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Étape suivante' }).click();
  await expect(page.getByRole('form', { name: /Formulaire d’un ticket/ }).first()).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Étape suivante' }).click();
  await page.getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByText('Version 1.0 publiée.')).toBeVisible();
});
