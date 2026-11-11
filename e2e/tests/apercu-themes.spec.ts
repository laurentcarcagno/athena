import { test } from '@playwright/test';

/** Aperçus des thèmes pour relecture humaine (lancé à la demande : APERCU=1). Captures dans e2e/visuel/apercu/. */
test.skip(!process.env.APERCU, 'aperçus : APERCU=1');

test('aperçus des thèmes', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  // Page de connexion (thème Keycloak généré, T-0139), en clair et en sombre selon le système.
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `visuel/apercu/connexion-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('#username').fill('admin.dev');
  await page.locator('#password').fill('dev-only-admin');
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ['hemeria', 'contrast', 'catppuccin', 'nord', 'gruvbox']) {
    for (const mode of ['light', 'dark']) {
      await page.evaluate(([t, m]) => { localStorage.setItem('athena.themeFamily', t!); localStorage.setItem('athena.theme', m!); }, [theme, mode]);
      await page.goto('/p/ARI/t/BUG/tableau');
      await page.locator(`html[data-theme="${theme}"]`).waitFor();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `visuel/apercu/${theme}-${mode}.png` });
    }
  }
});
