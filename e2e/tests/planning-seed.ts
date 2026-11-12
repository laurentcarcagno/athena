import { expect, type APIRequestContext } from '@playwright/test';

export const API = 'http://127.0.0.1:3001/v1';

/** Jeton d'accès de admin.dev (flux direct, client de développement). */
export async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('http://localhost:8080/realms/athena/protocol/openid-connect/token', {
    form: { grant_type: 'password', client_id: 'athena-dev-cli', username: 'admin.dev', password: 'dev-only-admin' },
  });
  return (await response.json()).access_token as string;
}

/**
 * Projet de planning daté (dates fixes : semaine du lundi 9 novembre 2026) : Conception (9-10, 50 %), Réalisation (saisie trop tôt,
 * repoussée par le lien « précède »), jalon Livraison, plus une phase parente de deux enfants. Rend la clé du projet.
 * `fixedKey` : clé imposée (captures visuelles, idempotent) ; sinon une clé unique par appel.
 */
export async function seedPlanning(request: APIRequestContext, fixedKey?: string): Promise<{ key: string; tasks: Record<string, string> }> {
  const headers = { Authorization: `Bearer ${await adminToken(request)}` };
  const key = fixedKey ?? `PL${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const created = await request.post(`${API}/projects`, { headers, data: { key, name: 'Planning e2e' } });
  if (fixedKey && created.status() === 409) return { key, tasks: {} };
  expect(created.status()).toBe(201);
  expect((await request.post(`${API}/projects/${key}/trackers`, { headers, data: {
    key: 'TSK', name: 'Tâches', typeKey: 'task',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'start', label: 'Début', type: 'date', semanticRole: 'start_date' },
      { key: 'due', label: 'Échéance', type: 'date', semanticRole: 'due_date' },
      { key: 'progress', label: 'Avancement', type: 'number', semanticRole: 'progress' },
      { key: 'remaining', label: 'Reste à faire', type: 'number', semanticRole: 'remaining' },
    ],
    statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }, { key: 'doing', name: 'En cours', category: 'in_progress' }, { key: 'done', name: 'Terminé', category: 'done' }],
    transitions: [{ name: 'Démarrer', from: 'todo', to: 'doing' }, { name: 'Terminer', from: 'doing', to: 'done' }, { name: 'Rouvrir', from: null, to: 'todo' }],
  } })).status()).toBe(201);
  const make = async (values: Record<string, unknown>) => {
    const response = await request.post(`${API}/projects/${key}/trackers/TSK/artifacts`, { headers, data: { values } });
    expect(response.status()).toBe(201);
    return (await response.json()).key as string;
  };
  const a = await make({ title: 'Conception', start: '2026-11-09', due: '2026-11-10', progress: 50, remaining: 1 });
  const b = await make({ title: 'Réalisation', start: '2026-11-10', due: '2026-11-10', progress: 0, remaining: 1 });
  const m = await make({ title: 'Livraison', due: '2026-11-17' });
  const phase = await make({ title: 'Phase de tests', start: '2026-11-12', due: '2026-11-12' });
  const t1 = await make({ title: 'Tests unitaires', start: '2026-11-12', due: '2026-11-13' });
  const t2 = await make({ title: 'Tests d’intégration', start: '2026-11-16', due: '2026-11-17' });
  const link = async (from: string, to: string, type: string, lagDays?: number) => {
    const response = await request.post(`${API}/projects/${key}/artifacts/${from}/links`, { headers, data: { to, type, ...(lagDays ? { lagDays } : {}) } });
    expect(response.status(), await response.text()).toBeLessThan(300);
  };
  await link(a, b, 'precedes');
  await link(b, m, 'precedes');
  const parent = await request.post(`${API}/projects/${key}/link-types`, { headers, data: { key: 'parent', outwardLabel: 'a pour parent', inwardLabel: 'a pour enfant', hierarchical: true } });
  expect(parent.status(), await parent.text()).toBeLessThan(300);
  await link(t1, phase, 'parent');
  await link(t2, phase, 'parent');
  return { key, tasks: { a, b, m, phase, t1, t2 } };
}
