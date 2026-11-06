import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { Db } from './db';
import { DomainError } from './errors';
import { PinService, type PinEntry } from './pin.service';

const suite = pgUp ? describe : describe.skip;
const entry = (kind: PinEntry['kind'], ref: string, label = ref, project = 'ARI'): PinEntry => ({ kind, project, ref, label });

suite('favoris et récents', () => {
  let testDb: TestDb;
  let pins: PinService;
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_pins');
    const db = new Db(testDb.pool);
    pins = new PinService(db);
    for (const [id, key] of [[orgA, 'pins-a'], [orgB, 'pins-b']] as const) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, key]));
  });
  afterAll(async () => { await testDb?.drop(); });

  it('note les ouvertures : les plus récentes d’abord, sans doublon, avec le dernier libellé', async () => {
    await pins.visit(orgA, 'alice', entry('project', 'ARI', 'ARI'));
    await pins.visit(orgA, 'alice', entry('tracker', 'BUG', 'ARI · BUG'));
    await pins.visit(orgA, 'alice', entry('item', 'ARI-BUG-0001'));
    await pins.visit(orgA, 'alice', entry('project', 'ARI', 'Ariane'));
    const { recents, favorites } = await pins.list(orgA, 'alice');
    expect(favorites).toEqual([]);
    expect(recents.map((r) => [r.kind, r.label])).toEqual([['project', 'Ariane'], ['item', 'ARI-BUG-0001'], ['tracker', 'ARI · BUG']]);
  });

  it('ne garde que les huit derniers récents affichés et élague au-delà de trente', async () => {
    for (let n = 1; n <= 35; n += 1) await pins.visit(orgA, 'bob', entry('item', `ARI-BUG-${String(n).padStart(4, '0')}`));
    const { recents } = await pins.list(orgA, 'bob');
    expect(recents).toHaveLength(8);
    expect(recents[0]!.ref).toBe('ARI-BUG-0035');
    const stored = (await testDb.pool.query("select 1")).rowCount;
    expect(stored).toBe(1);
    const count = await new Db(testDb.pool).tx(orgA, async (c) => Number((await c.query("select count(*) n from user_pin where subject = 'bob'")).rows[0].n));
    expect(count).toBe(30);
  });

  it('épingle, ordonne et désépingle ; un favori n’est plus un récent et n’est jamais élagué', async () => {
    await pins.setFavorite(orgA, 'carol', entry('project', 'ARI', 'Ariane'), true);
    await pins.setFavorite(orgA, 'carol', entry('tracker', 'BUG', 'ARI · BUG'), true);
    await pins.setFavorite(orgA, 'carol', entry('view', 'BUG:v1', 'Mes ouverts'), true);
    await pins.visit(orgA, 'carol', entry('item', 'ARI-BUG-0007'));
    let list = await pins.list(orgA, 'carol');
    expect(list.favorites.map((f) => f.label)).toEqual(['Ariane', 'ARI · BUG', 'Mes ouverts']);
    expect(list.recents.map((r) => r.ref)).toEqual(['ARI-BUG-0007']);
    await pins.reorder(orgA, 'carol', [list.favorites[2]!.id, list.favorites[0]!.id, list.favorites[1]!.id]);
    list = await pins.list(orgA, 'carol');
    expect(list.favorites.map((f) => f.label)).toEqual(['Mes ouverts', 'Ariane', 'ARI · BUG']);
    await pins.visit(orgA, 'carol', entry('project', 'ARI', 'Ariane')); // ouvrir un favori ne le déplace pas
    expect((await pins.list(orgA, 'carol')).favorites.map((f) => f.label)).toEqual(['Mes ouverts', 'Ariane', 'ARI · BUG']);
    await pins.setFavorite(orgA, 'carol', entry('project', 'ARI', 'Ariane'), false);
    list = await pins.list(orgA, 'carol');
    expect(list.favorites.map((f) => f.label)).toEqual(['Mes ouverts', 'ARI · BUG']);
    expect(list.recents.map((r) => r.ref)).toEqual(['ARI', 'ARI-BUG-0007']);
  });

  it('chaque utilisateur et chaque organisation ne voient que leurs éléments', async () => {
    await pins.setFavorite(orgA, 'dave', entry('project', 'ARI', 'Ariane'), true);
    expect((await pins.list(orgA, 'erin')).favorites).toEqual([]);
    expect((await pins.list(orgB, 'dave')).favorites).toEqual([]);
    const mine = (await pins.list(orgA, 'dave')).favorites[0]!.id;
    const error = await pins.reorder(orgA, 'erin', [mine]).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError); // l’identifiant d’un autre utilisateur est refusé
  });
});
