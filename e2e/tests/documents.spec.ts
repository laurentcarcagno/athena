import { expect, test } from '@playwright/test';
import { adminHeaders, indexUrd, login } from '../support/docs';

test('documents : ouvrir un document en lecture seule, chercher une UID, adresse stable par exigence', async ({ page, request }) => {
  await indexUrd(request);
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI');
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page).toHaveURL(/\/p\/ARI\/documents$/);
  await page.getByRole('link', { name: 'Exigences utilisateur' }).click();
  await expect(page.getByRole('note')).toContainText('Lecture seule : modifier dans StrictDoc.');
  await expect(page.getByRole('heading', { name: /Authentification/ })).toBeVisible();
  // l'énoncé est assaini : aucune balise script ne subsiste
  await expect(page.getByText('Chaque connexion est journalisée')).toBeVisible();
  expect(await page.locator('.ath-doc__content script').count()).toBe(0);
  expect(await page.getByText('alert(1)').count()).toBe(0);

  await page.getByLabel('UID ou texte').fill('URD-2');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await page.getByRole('list', { name: /résultat/ }).getByRole('link', { name: 'URD-2' }).click();
  await expect(page).toHaveURL(/\/p\/ARI\/documents\/urd\.docs-urd#URD-2$/);
  await expect(page.locator('#URD-2')).toHaveAttribute('aria-current', 'location');

  // une adresse stable par exigence se rouvre directement sur l'exigence
  await page.goto('/p/ARI/documents/urd.docs-urd#URD-1');
  await expect(page.locator('#URD-1')).toHaveAttribute('aria-current', 'location');
  await expect(page.locator('#URD-1 .ath-mono').first()).toHaveText('URD-1');
});
