import { expect, test, type Page } from '@playwright/test';

/** Lot 11 (ADR-0005) : parcours corrigés après l'audit d'ergonomie. */
async function login(page: Page, user = 'admin.dev', password = 'dev-only-admin') {
  await page.goto('/');
  await page.waitForURL(/localhost:8080\/realms\/athena/);
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(/localhost:3000/);
}

test('rapports : les onglets sont sous l’en-tête, visibles et cliquables ; le titre suit le rapport (T-0143)', async ({ page }) => {
  await login(page);
  await page.goto('/p/ARI/rapports');
  await expect(page.locator('h1')).toHaveText('Avancement');
  const tabs = page.getByRole('navigation', { name: /rapports/i });
  const header = page.locator('main .ath-pageheader');
  expect((await tabs.boundingBox())!.y).toBeGreaterThan((await header.boundingBox())!.y + (await header.boundingBox())!.height - 1);
  // Le point central de l'onglet « Activité » appartient bien à l'onglet (rien ne le recouvre).
  const activity = tabs.getByRole('link', { name: 'Activité' });
  const box = (await activity.boundingBox())!;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.textContent?.trim(), [box.x + box.width / 2, box.y + box.height / 2])).toBe('Activité');
  await activity.click();
  await expect(page).toHaveURL(/\/rapports\/activite$/);
  await expect(page.locator('h1')).toHaveText(/Activité/);
});

test('téléphone (390 px) : la fiche garde la largeur de l’écran, ses onglets défilent dans leur rangée (T-0143)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/p/ARI/a/ARI-BUG-0001');
  await expect(page.locator('main .ath-tabs').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const tabs = page.locator('main .ath-tabs').first();
  expect(await tabs.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test('utilisateur : création de tracker et configuration d’un tracker disent qui peut agir, sans bascule silencieuse (T-0144)', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI/trackers/new');
  await expect(page.getByRole('heading', { name: 'Seuls un administrateur ou un chef de projet peuvent ajouter un tracker.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Retour aux trackers' })).toBeVisible();
  // Un simple utilisateur n'a aucune section de Paramètres : le message le dit et ramène au projet.
  await page.goto('/p/ARI/parametres/trackers/BUG');
  await expect(page.getByRole('link', { name: 'Retour au projet' })).toBeVisible();
});

test('assurance produit : une section de Paramètres hors de son rôle est dite réservée, sans bascule silencieuse (T-0144)', async ({ page }) => {
  await login(page, 'qa.dev', 'dev-only-qa');
  await page.goto('/p/ARI/parametres/trackers/BUG');
  await expect(page.getByRole('heading', { name: 'La section Trackers est réservée aux administrateurs et aux chefs de projet.' })).toBeVisible();
  await expect(page).toHaveURL(/\/parametres\/trackers\/BUG$/);
});

test('assurance produit : commente un ticket comme un utilisateur, sans voir les contrôles de gestion (décision du 2026-11-13)', async ({ page }) => {
  await login(page, 'qa.dev', 'dev-only-qa');
  await page.goto('/p/ARI/a/ARI-BUG-0001?onglet=activity');
  await page.locator('#comment').fill('Revue assurance produit : conforme au plan qualité.');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText('Revue assurance produit : conforme au plan qualité.')).toBeVisible();
  await page.goto('/p/ARI/planning');
  await expect(page.getByRole('button', { name: 'Lier à…' })).toHaveCount(0); // ni planning ni configuration
});

test('automatisations : un administrateur crée une règle depuis un modèle, elle apparaît active (T-0145)', async ({ page }) => {
  await login(page);
  await page.goto('/p/ARI/parametres/automatisations');
  await expect(page.getByText(/Une automatisation agit seule/)).toBeVisible();
  await page.getByRole('button', { name: 'Utiliser le modèle : Relance des tickets bloqués' }).click();
  await expect(page.getByLabel('Quand')).toHaveValue('schedule');
  await page.getByRole('button', { name: 'Créer l’automatisation' }).click();
  await expect(page.getByText('Automatisation « Relance des tickets bloqués » créée et active.')).toBeVisible();
  const row = page.getByRole('row', { name: /Relance des tickets bloqués/ });
  await expect(row.getByText('Active', { exact: true })).toBeVisible();
  await expect(row.getByText('À intervalle régulier')).toBeVisible();
});

test('tracker sur téléphone : la liste commence dans le premier écran ; « Filtres » déplie les réglages (T-0147)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/p/ARI/t/BUG/tableau');
  const first = page.getByRole('link', { name: 'ARI-BUG-0001' });
  await expect(first).toBeVisible();
  expect((await first.boundingBox())!.y).toBeLessThan(844);
  const toggle = page.getByRole('button', { name: /^Filtres/ });
  await expect(page.getByRole('combobox', { name: 'Sévérité' })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('combobox', { name: 'Sévérité' })).toBeVisible();
});

test('fiche : enregistrement automatique annoncé ; « + Ajouter » mène au champ (T-0148)', async ({ page }) => {
  await login(page);
  await page.goto('/p/ARI/a/ARI-BUG-0001');
  await expect(page.getByText('✓ Enregistrement automatique')).toBeVisible();
  const facts = page.getByRole('definition').filter({ has: page.getByRole('button', { name: /^Ajouter : / }) }).first();
  const button = facts.getByRole('button', { name: /^Ajouter : / });
  const term = ((await button.getAttribute('aria-label')) ?? '').replace('Ajouter : ', '');
  await button.click();
  if (!['Sprint', 'Parent', 'Bloqué par'].includes(term)) await expect(page.getByLabel(new RegExp(`^${term}`))).toBeFocused();
});

test('recherche simple : un mot trouve le ticket, une clé ouvre sa fiche (T-0149)', async ({ page }) => {
  await login(page);
  await page.goto('/recherche');
  await expect(page.locator('h1')).toHaveText('Recherche');
  const box = page.getByRole('textbox', { name: 'Rechercher un ticket' });
  await box.fill('démarrage');
  await box.press('Enter');
  await expect(page).toHaveURL(/q=text/); // la recherche est appliquée (avant elle, la page liste déjà tous les tickets)
  await expect(page.getByRole('link', { name: 'ARI-BUG-0001' })).toBeVisible();
  await box.fill('ari-bug-0001');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/p\/ARI\/a\/ARI-BUG-0001/);
});

test('Organiser : glisser une carte et changer sa largeur, retrouvés au rechargement (T-0154)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 }); // les sept cartes tiennent à l'écran : glisser exige source et cible visibles
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/');
  const cards = page.locator('section[aria-label="Tableau de bord"] .ath-dashcard');
  const card = (name: string) => page.locator(`section[aria-label="Tableau de bord"] .ath-dashcard[aria-label="${name}"]`);
  const layout = async () => {
    const r = await (await page.request.get('/v1/me/dashboard')).json() as { isDefault: boolean; widgets: Array<{ id: string; x: number; y: number; w: number; h: number }> };
    const pick = (id: string) => { const { x, y, w, h } = r.widgets.find((c) => c.id === id)!; return { x, y, w, h }; };
    return { isDefault: r.isDefault, recents: pick('recents') };
  };
  await expect(cards).toHaveCount(7);
  const before = await layout();
  expect(before.isDefault).toBe(true);
  await page.getByRole('button', { name: 'Organiser' }).click();
  await card('Récents').dragTo(card('Mes tickets'));
  await page.getByRole('button', { name: 'Réglages de Récents' }).click();
  await page.getByRole('region', { name: 'Réglages de Récents' }).getByLabel('Largeur').selectOption('L');
  await expect(card('Récents')).toHaveClass(/ath-dashcard--L/);
  // Position et largeur dans le brouillon, lues sur les classes de la grille (colonne, ligne, largeur à partir de 1).
  const drafted = await card('Récents').evaluate((el) => {
    const n = (re: RegExp) => Number(re.exec(el.className)?.[1]);
    return { x: n(/ath-gx-(\d+)/) - 1, y: n(/ath-gy-(\d+)/) - 1, w: n(/ath-gw-(\d+)/) };
  });
  expect(drafted.w).toBe(8); // taille L : 8 colonnes sur 12
  expect([drafted.x, drafted.y]).not.toEqual([before.recents.x, before.recents.y]); // la carte a bougé
  await page.getByRole('button', { name: 'Enregistrer' }).click(); // rien n'est enregistré avant « Enregistrer » (ADR-0007)
  await expect(page.getByRole('button', { name: 'Organiser' })).toBeVisible();
  const saved = await layout();
  expect(saved.isDefault).toBe(false);
  expect(saved.recents).toMatchObject(drafted); // la position et la largeur enregistrées sont celles du brouillon
  await page.reload();
  expect((await layout()).recents).toEqual(saved.recents);
  await expect(card('Récents')).toHaveClass(/ath-dashcard--L/);
  // Remise à l'état initial.
  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Rétablir la disposition par défaut' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(cards).toHaveCount(7);
  // La réinitialisation est faite côté serveur : on attend qu'elle soit lue, sans supposer son instant.
  await expect.poll(async () => (await layout()).isDefault).toBe(true);
  expect((await layout()).recents).toEqual(before.recents);
});

test('carte graphique : ajouter un anneau des tickets par statut, puis le retirer (T-0156)', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/p/ARI');
  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Ajouter Graphique sur une recherche…' }).click(); // tiroir « Catalogue »
  await page.getByLabel('Titre de la carte').fill('Tickets par statut');
  await page.getByLabel('Répartir par').selectOption({ label: 'Statut' });
  await page.getByRole('button', { name: 'Ajouter le graphique' }).click();
  const chart = page.locator('.ath-dashcard[aria-label="Tickets par statut"]');
  await expect(chart.getByRole('img', { name: /tickets :/ })).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.reload();
  await expect(chart.getByRole('img', { name: /tickets :/ })).toBeVisible();
  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Masquer Tickets par statut' }).click();
  await expect(chart).toHaveCount(0);
  await page.getByRole('button', { name: 'Annuler' }).click(); // le brouillon n'est pas enregistré : la carte reste pour la suite des essais
  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Rétablir la disposition par défaut' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(chart).toHaveCount(0);
});
