import { expect, test } from '@playwright/test';
import { URD, adminHeaders, indexUrd, login } from '../support/docs';

/**
 * Critère de sortie du Lot 5 : une action de sprint cite une exigence de l'URD et signale sa modification.
 * L'exigence est modifiée dans le document puis ré-indexée : le lien devient suspect, un humain l'acquitte.
 */
test('une action de sprint cite une exigence de l’URD, signale sa modification, puis le lien est acquitté', async ({ page, request }) => {
  const headers = await adminHeaders(request);
  const api = 'http://127.0.0.1:3001/v1/projects/ARI';
  await indexUrd(request, URD, 'a1b2c3d4e5f6a7b8');

  // une action de sprint : tracker de type « action », un item, un sprint qui le contient
  expect((await request.post(`${api}/trackers`, { headers, data: { key: 'ACT', name: 'Actions de sprint', typeKey: 'action', fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }], statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }], transitions: [] } })).status()).toBe(201);
  const item = (await (await request.post(`${api}/trackers/ACT/artifacts`, { headers, data: { values: { title: 'Revoir l’authentification' } } })).json()).key as string;
  const sprint = (await (await request.post(`${api}/sprints`, { headers, data: { name: 'Sprint doc', startsOn: '2026-11-02', endsOn: '2026-11-13' } })).json()).id as string;
  expect((await request.post(`${api}/sprints/${sprint}/items`, { headers, data: { artifact: item } })).status()).toBe(204);

  await login(page, 'admin.dev', 'dev-only-admin');
  await page.goto(`/p/ARI/a/${item}`);
  await page.getByRole('tab', { name: 'Liens' }).click();
  await page.getByLabel('Citer une exigence (UID ou titre)').fill('URD-1');
  await page.getByRole('button', { name: 'Citer URD-1' }).click();
  const cited = page.getByRole('list', { name: 'Exigences documentaires citées' });
  await expect(cited.getByText('URD-1')).toBeVisible();
  await expect(cited.getByText('Suspect')).toHaveCount(0);

  // l'exigence est modifiée dans StrictDoc puis le document est ré-indexé
  await indexUrd(request, URD.replace("L'utilisateur doit pouvoir se connecter.", "L'utilisateur doit pouvoir se connecter avec un second facteur."), 'b2c3d4e5f6a7b8c9');
  await page.reload();
  await page.getByRole('tab', { name: 'Liens' }).click();
  await expect(cited.getByText('Suspect')).toBeVisible();

  // le document montre l'action parmi les citations de l'exigence, lien suspect compris
  await page.goto('/p/ARI/documents/urd.docs-urd#URD-1');
  await page.locator('#URD-1').getByRole('button', { name: '1 citation' }).click();
  const panel = page.getByRole('region', { name: 'Tickets citant URD-1' });
  await expect(panel.getByRole('link', { name: item })).toBeVisible();
  await expect(panel.getByText('Lien suspect')).toBeVisible();

  // acquittement par un humain
  await page.goto(`/p/ARI/a/${item}`);
  await page.getByRole('tab', { name: 'Liens' }).click();
  await page.getByRole('button', { name: 'Acquitter URD-1' }).click();
  await expect(cited.getByText('Suspect')).toHaveCount(0);
});
