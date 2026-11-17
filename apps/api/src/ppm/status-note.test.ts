import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { StatusNoteInput, StatusNoteService, worstLevel } from './status-note.service';

const suite = pgUp ? describe : describe.skip;
const pm: Actor = { id: 'sub-pm', roles: ['athena-team-member', 'athena-pm'] };

describe('météo : validation et pire niveau', () => {
  it('délai, périmètre et risque sont obligatoires ; ressources et coût facultatifs ; commentaire borné', () => {
    expect(StatusNoteInput.safeParse({ schedule: 'ok', scope: 'ok' }).success).toBe(false);
    expect(StatusNoteInput.safeParse({ schedule: 'ok', scope: 'attention', risk: 'critical' }).success).toBe(true);
    expect(StatusNoteInput.safeParse({ schedule: 'bof', scope: 'ok', risk: 'ok' }).success).toBe(false);
    expect(StatusNoteInput.safeParse({ schedule: 'ok', scope: 'ok', risk: 'ok', comment: 'x'.repeat(2001) }).success).toBe(false);
  });
  it('le pire niveau ignore les axes non renseignés', () => {
    expect(worstLevel({ schedule: 'ok', scope: 'ok', risk: 'ok', resources: null, cost: null })).toBe('ok');
    expect(worstLevel({ schedule: 'ok', scope: 'attention', risk: 'ok', resources: null, cost: null })).toBe('attention');
    expect(worstLevel({ schedule: 'attention', scope: 'ok', risk: 'ok', resources: 'critical', cost: null })).toBe('critical');
  });
});

suite('météo du projet (intégration)', () => {
  let testDb: TestDb;
  let svc: StatusNoteService;
  let db: Db;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_status_note');
    db = new Db(testDb.pool);
    svc = new StatusNoteService(db);
    await db.tx(org, async (c) => {
      await c.query("insert into organization (id, key, name) values ($1,'sn','sn')", [org]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-pm','chef','Chef Projet','c@example.test')", [org]);
      await c.query("insert into project (organization_id, key, name) values ($1,'MET','Météo')", [org]);
    });
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('sans note, la liste est vide ; chaque écriture ajoute une ligne, la plus récente en tête', async () => {
    expect(await svc.list(org, 'MET')).toEqual([]);
    await svc.write(org, 'MET', StatusNoteInput.parse({ schedule: 'ok', scope: 'ok', risk: 'ok' }), pm);
    const second = await svc.write(org, 'MET', StatusNoteInput.parse({ schedule: 'attention', scope: 'ok', risk: 'critical', comment: 'Lanceur décalé' }), pm);
    expect(second).toMatchObject({ schedule: 'attention', risk: 'critical', resources: null, cost: null, comment: 'Lanceur décalé', authorName: 'Chef Projet' });
    const all = await svc.list(org, 'MET');
    expect(all.map((n) => n.risk)).toEqual(['critical', 'ok']);
  });

  it('l’historique est en ajout seul : ni modification ni suppression', async () => {
    await expect(db.tx(org, (c) => c.query("update project_status_note set comment = 'x'"))).rejects.toThrow();
    await expect(db.tx(org, (c) => c.query('delete from project_status_note'))).rejects.toThrow();
  });

  it('projet inconnu : introuvable', async () => {
    await expect(svc.list(org, 'NOPE')).rejects.toMatchObject({ code: 'not_found' });
  });
});
