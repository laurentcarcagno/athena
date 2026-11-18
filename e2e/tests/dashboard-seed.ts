import type { Page } from '@playwright/test';

/** L'accueil est vide par défaut : ces specs posent d'abord sept cartes types, comme le ferait une personne avec Organiser. */
const SEVEN = [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done' },
  { id: 'mylate', kind: 'search', query: 'assignee = currentUser() AND late()' },
  { id: 'approvals', kind: 'approvals' },
  { id: 'mentions', kind: 'mentions' },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)' },
  { id: 'favorites', kind: 'favorites' },
  { id: 'recents', kind: 'recents' },
];

export async function seedSevenCards(page: Page): Promise<void> {
  const { csrf } = await (await page.request.get('/auth/session')).json() as { csrf?: string };
  const res = await page.request.put('/v1/me/dashboard', { data: { widgets: SEVEN }, headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
  if (!res.ok()) throw new Error(`disposition de départ refusée : ${res.status()}`);
}
