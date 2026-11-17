import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { defaultLifecycle, lifecycleProblems, LIFECYCLE_CATEGORIES } from './lifecycle';
import { LifecycleService } from './lifecycle.service';

const suite = pgUp ? describe : describe.skip;
const asInput = () => { const d = defaultLifecycle(); return { states: d.states.map(({ key, name, category, hidden }) => ({ key, name, category, hidden })), transitions: d.transitions }; };
const admin: Actor = { id: 'sub-admin', roles: ['athena-team-member', 'athena-admin'] };
const pm: Actor = { id: 'sub-pm', roles: ['athena-team-member', 'athena-pm'] };
const otherPm: Actor = { id: 'sub-pm2', roles: ['athena-team-member', 'athena-pm'] };
const pmo: Actor = { id: 'sub-pmo', roles: ['athena-team-member', 'athena-pmo'] };

describe('cycle de vie : configuration livrée', () => {
  it('treize états en six catégories, et la configuration livrée est cohérente', () => {
    const d = defaultLifecycle();
    expect(d.states).toHaveLength(13);
    expect(new Set(d.states.map((s) => s.category))).toEqual(new Set(LIFECYCLE_CATEGORIES));
    expect(lifecycleProblems(asInput(), ['in_progress'])).toEqual([]);
  });
  it('refuse clé en double, catégorie vide, transition vers un état inconnu et état courant supprimé', () => {
    const base = asInput();
    expect(lifecycleProblems({ ...base, states: [...base.states, base.states[0]!] }, [])).toEqual(expect.arrayContaining([expect.stringContaining('en double')]));
    expect(lifecycleProblems({ ...base, states: base.states.filter((s) => s.category !== 'archived') }, [])).toEqual(expect.arrayContaining([expect.stringContaining('« archived »')]));
    expect(lifecycleProblems({ ...base, transitions: [{ from: 'idea', to: 'nope', roles: [] }] }, [])).toEqual(expect.arrayContaining([expect.stringContaining('état inconnu')]));
    expect(lifecycleProblems(base, ['ghost'])).toEqual(expect.arrayContaining([expect.stringContaining('masquez-le')]));
  });
});

suite('cycle de vie (intégration)', () => {
  let testDb: TestDb;
  let svc: LifecycleService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_lifecycle');
    const db = new Db(testDb.pool);
    svc = new LifecycleService(db);
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, `l${org.slice(0, 6)}`]);
      await c.query("insert into project (organization_id, key, name) values ($1,'LIF','Cycle')", [org]);
      await c.query("insert into project_member (organization_id, project_id, subject, role, added_by) select $1, id, 'sub-pm', 'manager', 'x' from project where key = 'LIF'", [org]);
    });
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('un projet existant est « en cours » ; les transitions offertes tiennent compte des droits', async () => {
    const view = await svc.forProject(org, 'LIF', pm);
    expect(view.state).toMatchObject({ key: 'in_progress', category: 'active' });
    expect(Object.fromEntries(view.next.map((n) => [n.to, n.permitted]))).toMatchObject({ closing: true, on_hold: true, cancelled: false });
    expect((await svc.forProject(org, 'LIF', otherPm)).next.every((n) => !n.permitted)).toBe(true);
  });

  it('transition interdite : 409 ; non autorisée : 403 ; annulation sans motif : 422', async () => {
    await expect(svc.transition(org, 'LIF', 'archived', '', admin)).rejects.toMatchObject({ code: 'conflict' });
    await expect(svc.transition(org, 'LIF', 'on_hold', '', otherPm)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.transition(org, 'LIF', 'cancelled', '', pmo)).rejects.toMatchObject({ code: 'validation' });
  });

  it('le chef suspend puis reprend ; le PMO annule avec un motif ; l’historique garde tout, dans l’ordre', async () => {
    await svc.transition(org, 'LIF', 'on_hold', 'Attente de budget', pm);
    expect((await svc.forProject(org, 'LIF', pm)).state.category).toBe('suspended');
    await svc.transition(org, 'LIF', 'in_progress', '', pm);
    const done = await svc.transition(org, 'LIF', 'cancelled', 'Programme arrêté', pmo);
    expect(done.state).toMatchObject({ key: 'cancelled', category: 'cancelled' });
    expect(done.history.map((h) => `${h.from}>${h.to}`)).toEqual(['in_progress>on_hold', 'on_hold>in_progress', 'in_progress>cancelled']);
    expect(done.history[0]).toMatchObject({ reason: 'Attente de budget', by: 'sub-pm' });
  });

  it('l’historique est en ajout seul, même pour l’application', async () => {
    const db = new Db(testDb.pool);
    await expect(db.tx(org, async (c) => { await c.query("update project_lifecycle_history set reason = 'x'"); })).rejects.toThrow();
    await expect(db.tx(org, async (c) => { await c.query('delete from project_lifecycle_history'); })).rejects.toThrow();
  });

  it('renommer un état ne casse rien ; supprimer l’état courant d’un projet est refusé ; retour aux états livrés', async () => {
    const input = asInput();
    input.states = input.states.map((s) => (s.key === 'cancelled' ? { ...s, name: 'Abandonné' } : s));
    const cfg = await svc.put(org, input, admin);
    expect(cfg.customized).toBe(true);
    expect((await svc.forProject(org, 'LIF', admin)).state).toMatchObject({ key: 'cancelled', name: 'Abandonné' });
    await expect(svc.put(org, { ...input, states: input.states.filter((s) => s.key !== 'cancelled' && s.key !== 'rejected') }, admin)).rejects.toMatchObject({ code: 'validation' });
    expect((await svc.reset(org, admin)).customized).toBe(false);
    expect((await svc.forProject(org, 'LIF', admin)).state.name).toBe('Annulé');
  });
});
