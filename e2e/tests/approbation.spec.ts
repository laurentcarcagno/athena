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

test('circuit d’approbation : défini sur le tracker, décision nominative confirmée, invalidation par modification', async ({ page, request }) => {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  const headers = { Authorization: `Bearer ${token}` };
  const api = 'http://127.0.0.1:3001/v1';

  await login(page, 'user.dev', 'dev-only-user');
  await expect(page.getByText('Ariane')).toBeVisible(); // la liste des projets est chargée : le compte est enregistré côté serveur
  const users = (await (await request.get(`${api}/users`, { headers })).json()) as Array<{ subject: string; username: string }>;
  const reviewer = users.find((u) => u.username === 'user.dev')!.subject;
  const flow = await request.put(`${api}/projects/ARI/trackers/BUG/approval-flow`, { headers, data: { enabled: true, steps: [{ name: 'Relecture technique', kind: 'review', approvers: [reviewer], minApprovals: 1 }] } });
  expect(flow.status()).toBe(200);
  const created = await request.post(`${api}/projects/ARI/trackers/BUG/artifacts`, { headers, data: { values: { title: 'À approuver', severity: 'mineure' } } });
  const key = (await created.json()).key as string;

  try {
    await page.goto(`/p/ARI/a/${key}`);
    await page.getByRole('tab', { name: 'Approbation' }).click();
    await expect(page.getByText('En attente')).toBeVisible();
    await expect(page.getByText('Désignés : User Dev')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await page.getByLabel('Commentaire de la décision').fill('Relu et conforme');
    await page.getByRole('button', { name: 'Approuver', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approuver' }).click(); // confirmation
    await expect(page.getByText('Approuvé par User Dev')).toBeVisible();
    await expect(page.getByText('— Relu et conforme')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approuver', exact: true })).toHaveCount(0);

    // Une modification du contenu invalide la décision et le dit.
    const version = ((await (await request.get(`${api}/projects/ARI/artifacts/${key}`, { headers })).json()) as { version: number }).version;
    expect((await request.patch(`${api}/projects/ARI/artifacts/${key}`, { headers, data: { values: { title: 'À approuver (modifié)' }, version } })).status()).toBe(200);
    await page.reload();
    await page.getByRole('tab', { name: 'Approbation' }).click();
    await expect(page.getByText(/L’item a été modifié \(version \d+\) : la décision précédente est invalidée/)).toBeVisible();
    await expect(page.getByText('En attente')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approuver', exact: true })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  } finally {
    await request.put(`${api}/projects/ARI/trackers/BUG/approval-flow`, { headers, data: { enabled: false, steps: [{ name: 'Relecture technique', kind: 'review', approvers: [reviewer], minApprovals: 1 }] } });
  }
});
