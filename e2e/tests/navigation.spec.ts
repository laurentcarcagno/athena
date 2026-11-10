import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

// Critère du lot 1 : tout item s'atteint en au plus 3 actions, sans écrire de requête ATQL.
test('Projets, tracker, item : trois actions, puis retour au projet par le fil d’Ariane', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await expect(page.getByText('Ariane')).toBeVisible();
  await page.getByRole('link', { name: 'Ariane', exact: true }).click(); // 1 : le projet (les trackers de la page Projets sont repliés depuis le lot 8)
  await page.getByRole('group', { name: 'Projet ARI' }).getByRole('button', { name: /^BUG · / }).click(); // 2 : le tracker, au rail (ADR-0003)
  await expect(page).toHaveURL(/\/p\/ARI\/t\/BUG\/tableau/);
  await page.getByRole('link', { name: 'ARI-BUG-0001' }).click(); // 3 : l'item s'ouvre à droite
  await expect(page.getByRole('complementary', { name: 'Détail de l’item' })).toBeVisible();
  await expect(page).toHaveURL(/i=ARI-BUG-0001/);
  await page.getByRole('navigation', { name: 'Fil d’Ariane' }).getByRole('link', { name: 'ARI' }).click(); // 1 action pour revenir
  await expect(page).toHaveURL(/\/p\/ARI$/);
  await expect(page.getByRole('group', { name: 'Projet ARI' }).getByRole('button', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page');
});

test('J / K parcourent la liste, Échap ferme le panneau, l’ancienne adresse de recherche redirige', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/t/BUG/tableau');
  await expect(page.getByRole('link', { name: 'ARI-BUG-0001' })).toBeVisible();
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/i=ARI-BUG-0001/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Détail de l’item' })).toHaveCount(0);
  await page.goto('/p/ARI?q=status%3Dopen');
  await expect(page).toHaveURL(/\/p\/ARI\/recherche\?q=/);
});

test('colonnes du tableau et sélecteur de frères du fil d’Ariane', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/t/BUG/tableau');
  await page.getByRole('button', { name: 'Colonnes' }).click();
  await page.getByRole('checkbox', { name: 'Sévérité' }).click();
  await expect(page.getByRole('checkbox', { name: 'Sévérité' })).toBeChecked(); // état piloté par l'adresse : il se met à jour juste après le clic
  await expect(page.getByRole('columnheader', { name: /Sévérité/ })).toBeVisible();
  await expect(page).toHaveURL(/cols=/);
  await page.getByRole('button', { name: 'Changer de tracker' }).click();
  await expect(page.getByRole('list', { name: 'Changer de tracker' }).getByRole('link', { name: 'BUG' })).toBeVisible();
});

test.describe('téléphone (375 px) : tiroir du rail', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('le rail est fermé, s’ouvre en tiroir, se ferme à la navigation ; la page ne déborde pas', async ({ page }) => {
    await login(page, 'user.dev', 'dev-only-user');
    await page.goto('/p/ARI/recherche');
    await expect(page.getByRole('link', { name: 'ARI-BUG-0001' })).toBeVisible();
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noOverflow()).toBe(true);
    const rail = page.locator('#rail');
    await expect(rail).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(rail).toBeVisible();
    const box = (await rail.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBeLessThanOrEqual(375 * 0.86 + 1);
    expect(box.height).toBeGreaterThanOrEqual(699);
    await page.keyboard.press('Escape');
    await expect(rail).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    await rail.getByRole('button', { name: 'Projets' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(rail).toBeHidden();
    expect(await noOverflow()).toBe(true);
  });
});


// T-0110 (ADR-0003) : sous 768 px, la navigation du projet passe par le sélecteur de section, les destinations globales par la barre basse.
test.describe('téléphone (390 px) : sélecteur de section et barre basse', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('cibles de 44 px, navigations sur une ligne, aucune page qui déborde, sections atteintes en 2 actions', async ({ page }) => {
    await login(page, 'user.dev', 'dev-only-user');
    await page.goto('/p/ARI/t/BUG/tableau');
    const picker = page.getByRole('navigation', { name: 'Sections du projet ARI' });
    const bar = page.getByRole('navigation', { name: 'Navigation rapide' });
    await expect(picker.getByRole('button', { name: /ARI · Trackers/ })).toBeVisible();
    await expect(bar).toBeVisible();
    await expect(page.locator('#rail')).toBeHidden();
    const heights = async (scope: ReturnType<Page['getByRole']>) => Promise.all((await scope.locator('a, button').all()).map(async (el) => (await el.boundingBox())!.height));
    for (const h of await heights(bar)) expect(h).toBeGreaterThanOrEqual(44);
    for (const h of await heights(picker)) expect(h).toBeGreaterThanOrEqual(44);
    // Les vues du tracker tiennent sur une ligne (elles défilent dans leur cadre si besoin)
    const tops = await Promise.all((await page.getByRole('navigation', { name: 'Vues du tracker' }).getByRole('link').all()).map(async (l) => (await l.boundingBox())!.y));
    expect(new Set(tops.map(Math.round)).size).toBe(1);
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noOverflow()).toBe(true);
    // La barre basse ne masque pas la fin de la page : le contenu réserve au moins sa hauteur en bas
    const barHeight = (await bar.boundingBox())!.height;
    const reserved = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('contenu')!).paddingBottom));
    expect(reserved).toBeGreaterThanOrEqual(barHeight);
    await picker.getByRole('button', { name: /ARI · Trackers/ }).click(); // 1
    for (const h of await heights(picker)) expect(h).toBeGreaterThanOrEqual(44);
    await picker.getByRole('link', { name: 'Rapports' }).click(); // 2
    await expect(page).toHaveURL(/\/p\/ARI\/rapports\/avancement$/);
    await expect(picker.getByRole('button', { name: /ARI · Rapports/ })).toHaveAttribute('aria-expanded', 'false');
    expect(await noOverflow()).toBe(true);
    await bar.getByRole('button', { name: 'Chercher' }).click();
    await expect(page.getByRole('combobox', { name: 'Aller à… ou rechercher un ticket (clé ou titre), tous projets' })).toBeFocused();
  });

  test('sur poste de travail, ni sélecteur ni barre basse', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, 'user.dev', 'dev-only-user');
    await page.goto('/p/ARI');
    await expect(page.getByRole('group', { name: 'Projet ARI' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sections du projet ARI' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Navigation rapide' })).toBeHidden();
  });
});
