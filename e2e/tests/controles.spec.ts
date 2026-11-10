import { expect, test, type Locator, type Page } from '@playwright/test';

/** T-0133 (ADR-0004) : hauteurs de contrôle et anneau de focus mesurés dans le navigateur. */
async function login(page: Page) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill('admin.dev');
  await page.locator('#password').fill('dev-only-admin');
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

const height = (l: Locator) => l.evaluate((el) => Math.round(el.getBoundingClientRect().height));
const outline = (l: Locator) => l.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth}`; });

test('contrôles de formulaire : même hauteur, focus visible de 2 px au clavier', async ({ page }) => {
  await login(page);
  await page.goto('/p/ARI/t/BUG/tableau');
  const select = page.getByRole('combobox', { name: 'Sévérité' });
  const input = page.getByRole('textbox', { name: 'Recherche dans le tracker' });
  const button = page.getByRole('button', { name: '+ Nouveau ticket' });
  await expect(select).toBeVisible();
  expect(await height(select)).toBe(32);
  expect(await height(input)).toBe(32);
  expect(await height(button)).toBe(32);

  for (const control of [select, input, page.getByRole('checkbox', { name: 'Liens suspects' })]) {
    await control.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(control).toBeFocused();
    expect(await outline(control)).toBe('solid 2px');
  }
});
