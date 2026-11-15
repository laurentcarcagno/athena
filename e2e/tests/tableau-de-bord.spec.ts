import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const axeSource = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Audit axe-core dans le navigateur réel, contraste compris. */
async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
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

const TITLES = ['Mes tickets', 'Mes tâches en retard', 'À approuver', 'Mentions', 'Échéances de la semaine', 'Projets favoris', 'Récents'];

interface Placed { id: string; x: number; y: number; w: number; h: number }
/** Disposition enregistrée (ou par défaut) lue sur l'API : la position de chaque carte, indépendante de l'ordre du DOM et du repli des cartes vides. */
async function layoutOf(page: Page): Promise<{ isDefault: boolean; boxes: Record<string, Omit<Placed, 'id'>> }> {
  const r = await (await page.request.get('/v1/me/dashboard')).json() as { isDefault: boolean; widgets: Placed[] };
  return { isDefault: r.isDefault, boxes: Object.fromEntries(r.widgets.map(({ id, x, y, w, h }) => [id, { x, y, w, h }])) };
}

// T-0122 (ADR-0003 § 2.1) : tableau de bord personnel, disposition par défaut sans réglage, puis personnalisation durable.
test('tableau de bord : disposition par défaut, masquer et réordonner survivent au rechargement, réinitialiser la rétablit', async ({ page }) => {
  await login(page, 'user.dev', 'dev-only-user');
  await page.goto('/me');
  // Toutes les cartes de la disposition (une carte vide est résumée dans « Rien d'urgent » mais reste dans la grille, T-0153).
  const groups = page.locator('section[aria-label="Tableau de bord"] .ath-dashcard');
  const titles = async () => (await groups.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))).sort();
  await expect(groups).toHaveCount(7);
  expect(await titles()).toEqual([...TITLES].sort());
  const initial = await layoutOf(page);
  expect(initial.isDefault).toBe(true);
  expect(Object.keys(initial.boxes)).toHaveLength(7);
  const assigned = initial.boxes.assigned!;

  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Masquer Récents' }).click();
  // Déplacer au clavier (T-0154) : saisir la carte par sa poignée, flèche, poser.
  await page.getByRole('button', { name: 'Déplacer la carte Mes tickets' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  // Dans le brouillon, la grille n'est pas repliée : la position lue sur la carte est celle qui sera enregistrée.
  const moved = await page.locator('.ath-dashcard[aria-label="Mes tickets"]').evaluate((el) => {
    const n = (re: RegExp) => Number(re.exec(el.className)?.[1]);
    return { x: n(/ath-gx-(\d+)/) - 1, y: n(/ath-gy-(\d+)/) - 1, w: n(/ath-gw-(\d+)/) };
  });
  expect(moved.x).toBe(assigned.x + 1);
  expect(moved.y).toBe(assigned.y);
  await page.getByRole('button', { name: 'Enregistrer' }).click(); // rien n'est enregistré avant « Enregistrer » (ADR-0007)
  await expect(groups).toHaveCount(6);
  const saved = await layoutOf(page);
  expect(saved.isDefault).toBe(false);
  expect(saved.boxes.recents).toBeUndefined();
  expect(saved.boxes.assigned).toMatchObject(moved);

  await page.reload();
  await expect(groups).toHaveCount(6);
  expect(await titles()).toEqual(TITLES.filter((t) => t !== 'Récents').sort());
  expect(await layoutOf(page)).toEqual(saved); // positions et tailles identiques après rechargement
  expect(await axeViolations(page)).toEqual([]);

  await page.getByRole('button', { name: 'Organiser' }).click();
  await page.getByRole('button', { name: 'Rétablir la disposition par défaut' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(groups).toHaveCount(7);
  expect(await layoutOf(page)).toEqual(initial);
  await page.reload();
  await expect(groups).toHaveCount(7);
  expect(await titles()).toEqual([...TITLES].sort());
  expect(await layoutOf(page)).toEqual(initial); // la disposition par défaut est rétablie, position par position
});
