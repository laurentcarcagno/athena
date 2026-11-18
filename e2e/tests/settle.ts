import type { Page } from '@playwright/test';

/**
 * Page « calme » : chargée, requêtes de données terminées. `networkidle` ne convient plus : le flux temps réel `/v1/me/events` (SSE) reste ouvert
 * sur chaque page et n'est jamais « idle ». On attend donc le chargement puis un court silence réseau hors de ce flux.
 */
export async function settle(page: Page, quietMs = 700): Promise<void> {
  await page.waitForLoadState('load');
  let last = Date.now();
  const touch = (url: string) => { if (!url.includes('/v1/me/events')) last = Date.now(); };
  const onRequest = (r: { url: () => string }) => touch(r.url());
  page.on('request', onRequest);
  page.on('requestfinished', onRequest);
  try { while (Date.now() - last < quietMs) await page.waitForTimeout(100); } finally { page.off('request', onRequest); page.off('requestfinished', onRequest); }
}
