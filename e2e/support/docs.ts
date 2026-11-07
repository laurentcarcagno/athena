import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const URD = `[DOCUMENT]
TITLE: Exigences utilisateur

[[SECTION]]
TITLE: Connexion

[REQUIREMENT]
UID: URD-1
TITLE: Authentification
STATEMENT: >>>
L'utilisateur doit pouvoir se connecter.
<<<

[REQUIREMENT]
UID: URD-2
TITLE: Journalisation
STATEMENT: >>>
Chaque connexion est journalisée <script>alert(1)</script>dans le journal d'audit.
<<<

[[/SECTION]]
`;

export async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

export async function adminHeaders(request: APIRequestContext) {
  const token = (await (await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', { form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' } })).json()).access_token as string;
  return { Authorization: `Bearer ${token}` };
}

export async function indexUrd(request: APIRequestContext, content = URD, sha = 'a1b2c3d4e5f6a7b8') {
  const response = await request.post('http://127.0.0.1:3001/v1/projects/ARI/docs/urd/index', { headers: await adminHeaders(request), data: { files: [{ path: 'docs/urd.sdoc', content }], gitSha: sha } });
  expect(response.status()).toBeLessThan(300);
}
