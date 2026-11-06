import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchService } from '../atql/search.service';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { LinkService } from '../core/link.service';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { AutomationService, LIMITS } from './automation.service';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('automatisations (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let links: LinkService;
  let automation: AutomationService;
  let db: Db;
  const org = crypto.randomUUID();

  /** Traite les événements jusqu'à stabilité (les actions produisent de nouveaux événements). */
  async function settle(max = 12): Promise<number> {
    let total = 0;
    for (let i = 0; i < max; i++) {
      const n = await automation.process(org);
      total += n;
      const pending = Number((await db.tx(org, (c) => c.query("select count(*) n from outbox_event where automation_processed_at is null and type like 'artifact.%'"))).rows[0].n);
      if (n === 0 && pending === 0) break;
    }
    return total;
  }

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_automation');
    db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    automation = new AutomationService(db, artifacts, links, new SearchService(db));
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'auto']));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('valide les règles à la création', async () => {
    expect(await code(automation.createRule(org, 'ARI', { name: 'x', trigger: 'artifact.inconnu', actions: [{ type: 'comment', body: 'a' }] }, admin))).toMatch(/validation/);
    expect(await code(automation.createRule(org, 'ARI', { name: 'x', trigger: 'artifact.created', condition: 'status =', actions: [{ type: 'comment', body: 'a' }] }, admin))).toMatch(/validation.*condition/);
    expect(await code(automation.createRule(org, 'ARI', { name: 'x', trigger: 'artifact.created', actions: [] }, admin))).toMatch(/validation/);
    expect(await code(automation.createRule(org, 'NOPE', { name: 'x', trigger: 'artifact.created', actions: [{ type: 'comment', body: 'a' }] }, admin))).toMatch(/not_found/);
  });

  it('exécute quand / si / alors et enchaîne les règles', async () => {
    const escalate = await automation.createRule(org, 'ARI', {
      name: 'Escalade des bugs bloquants', trigger: 'artifact.created', condition: 'severity = bloquante',
      actions: [{ type: 'comment', body: 'Bug bloquant : escalade automatique.' }, { type: 'update', values: { assignee: 'sub-astreinte' } }],
    }, admin);
    await automation.createRule(org, 'ARI', {
      name: 'Démarrage automatique', trigger: 'artifact.updated', condition: 'assignee IS NOT EMPTY AND status = open',
      actions: [{ type: 'transition', name: 'Démarrer' }],
    }, admin);

    await artifacts.create(org, 'ARI', 'BUG', { title: 'Panne totale', severity: 'bloquante' }, admin);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Détail', severity: 'mineure' }, admin);
    await settle();

    const first = await artifacts.get(org, 'ARI', 'ARI-BUG-0001');
    expect(first.values['assignee']).toBe('sub-astreinte');
    expect(first.status).toBe('in_progress'); // règle 2 déclenchée par la mise à jour de la règle 1
    expect((await artifacts.get(org, 'ARI', 'ARI-BUG-0002')).status).toBe('open'); // condition non satisfaite
    expect((await links.comments(org, 'ARI', 'ARI-BUG-0001')).map((c) => c.body)).toEqual(['Bug bloquant : escalade automatique.']);
    expect((await automation.runs(org, escalate)).map((r) => r.status).sort()).toEqual(['done', 'skipped']);
  }, 60_000);

  it('applique le workflow et le rôle minimal : une action interdite échoue sans contourner les droits', async () => {
    await automation.createRule(org, 'ARI', { name: 'Livraison forcée', trigger: 'artifact.created', condition: 'title ~ "Livrable"', actions: [{ type: 'transition', name: 'Livrer' }] }, admin);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Livrable', severity: 'mineure' }, admin);
    await settle();
    expect((await artifacts.get(org, 'ARI', 'ARI-BUG-0003')).status).toBe('open');
    const rules = await automation.list(org, 'ARI');
    const runs = await automation.runs(org, rules.find((r) => r.name === 'Livraison forcée')!.id);
    expect(runs[0]).toMatchObject({ status: 'failed' });
  }, 60_000);

  it('arrête deux règles qui se renvoient l’une à l’autre (profondeur et quota)', async () => {
    await automation.createRule(org, 'ARI', { name: 'Ping', trigger: 'artifact.updated', condition: 'title ~ "pingpong" AND severity = mineure', actions: [{ type: 'update', values: { severity: 'majeure' } }] }, admin);
    await automation.createRule(org, 'ARI', { name: 'Pong', trigger: 'artifact.updated', condition: 'title ~ "pingpong" AND severity = majeure', actions: [{ type: 'update', values: { severity: 'mineure' } }] }, admin);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'pingpong', severity: 'mineure' }, admin);
    await artifacts.update(org, 'ARI', 'ARI-BUG-0004', { assignee: 'x' }, 1, admin); // déclenche Ping
    await settle(20);
    const revisions = Number((await db.tx(org, (c) => c.query("select count(*) n from artifact_revision r join artifact a on a.id = r.artifact_id where a.key = 'ARI-BUG-0004'"))).rows[0].n);
    // Chaîne bornée par la profondeur (création, mise à jour, au plus une révision par niveau et par règle déclenchée).
    expect(revisions).toBeLessThanOrEqual(3 + LIMITS.maxDepth * 2);
    expect(revisions).toBeGreaterThan(2); // les règles se sont bien enchaînées avant d'être arrêtées
    const pending = await db.tx(org, (c) => c.query("select count(*) n from outbox_event where automation_processed_at is null"));
    expect(Number(pending.rows[0].n)).toBe(0);
  }, 90_000);

  it('désactive une règle', async () => {
    const [rule] = await automation.list(org, 'ARI');
    await automation.setEnabled(org, rule!.id, false, admin);
    expect((await automation.list(org, 'ARI'))[0]!.enabled).toBe(false);
    expect(await code(automation.setEnabled(org, crypto.randomUUID(), true, admin))).toMatch(/not_found/);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Autre bloquant', severity: 'bloquante' }, admin);
    const before = await automation.runs(org, rule!.id);
    await settle();
    expect((await automation.runs(org, rule!.id)).length).toBe(before.length); // règle désactivée : aucune exécution
  }, 60_000);

  it('exécute une règle planifiée sur les artefacts désignés par sa condition, sans double exécution', async () => {
    expect(await code(automation.createRule(org, 'ARI', { name: 's', trigger: 'schedule', actions: [{ type: 'comment', body: 'a' }] }, admin))).toMatch(/validation.*planifiée/);
    expect(await code(automation.createRule(org, 'ARI', { name: 's', trigger: 'schedule', everyMinutes: 1, condition: 'status = open', actions: [{ type: 'comment', body: 'a' }] }, admin))).toMatch(/validation/);
    const stale = await artifacts.create(org, 'ARI', 'BUG', { title: 'Ancien', severity: 'mineure' }, admin);
    const fresh = await artifacts.create(org, 'ARI', 'BUG', { title: 'Récent', severity: 'mineure' }, admin);
    await testDb.exec("update artifact set updated_at = now() - interval '10 days' where key = $1", [stale.key]);
    const id = await automation.createRule(org, 'ARI', { name: 'Relance', trigger: 'schedule', everyMinutes: 60, condition: `title ~ "Ancien" AND updated < daysAgo(7)`, actions: [{ type: 'comment', body: 'Relance automatique' }] }, admin);
    expect(await automation.runDue(org)).toBe(1);
    expect((await links.comments(org, 'ARI', stale.key)).map((c) => c.body)).toEqual(['Relance automatique']);
    expect(await links.comments(org, 'ARI', fresh.key)).toEqual([]);
    expect(await automation.runDue(org)).toBe(0); // pas encore échue
    await testDb.exec("update automation_rule set last_run_at = now() - interval '2 hours' where id = $1", [id]);
    expect(await automation.runDue(org)).toBe(1);
    expect((await automation.runs(org, id)).map((r) => r.status)).toEqual(['done', 'done']);
  });
});
