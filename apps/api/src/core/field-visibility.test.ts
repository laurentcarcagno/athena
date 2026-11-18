import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { FieldTypeRegistry } from './field-types';
import { checkVisibleWhen, isFieldVisible, visibleWhenOf } from './field-visibility';
import { TrackerService } from './tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'root', roles: ['athena-admin'] };
const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x) as { code?: string; details?: string[] } | null; return e ? `${e.code}:${(e.details ?? []).join(' ')}` : 'ok'; };

describe('règle de visibilité conditionnelle (pure)', () => {
  const field = (config: Record<string, unknown>) => ({ config });
  it('sans condition : toujours visible ; avec condition : selon la valeur du champ pilote (texte, nombre, liste)', () => {
    expect(isFieldVisible(field({}), {})).toBe(true);
    const f = field({ visibleWhen: { field: 'severity', in: ['majeure', 'bloquante'] } });
    expect(isFieldVisible(f, { severity: 'majeure' })).toBe(true);
    expect(isFieldVisible(f, { severity: 'mineure' })).toBe(false);
    expect(isFieldVisible(f, {})).toBe(false); // pilote non renseigné : masqué
    expect(isFieldVisible(field({ visibleWhen: { field: 'tags', in: ['a'] } }), { tags: ['b', 'a'] })).toBe(true);
    expect(isFieldVisible(field({ visibleWhen: { field: 'n', in: ['3'] } }), { n: 3 })).toBe(true);
  });
  it('contrôle à la création : pilote existant, pas soi-même, pas conditionnel, forme valide', () => {
    const existing = [{ key: 'severity', config: {} }, { key: 'cond', config: { visibleWhen: { field: 'severity', in: ['x'] } } }];
    expect(checkVisibleWhen('cause', { visibleWhen: { field: 'severity', in: ['majeure'] } }, existing)).toEqual([]);
    expect(checkVisibleWhen('cause', undefined, existing)).toEqual([]);
    expect(checkVisibleWhen('cause', { visibleWhen: { field: 'cause', in: ['x'] } }, existing)[0]).toMatch(/lui-même|dépendre de lui/);
    expect(checkVisibleWhen('cause', { visibleWhen: { field: 'absent', in: ['x'] } }, existing)[0]).toMatch(/n'existe pas/);
    expect(checkVisibleWhen('cause', { visibleWhen: { field: 'cond', in: ['x'] } }, existing)[0]).toMatch(/conditionnel/);
    expect(checkVisibleWhen('cause', { visibleWhen: { field: 'severity', in: [] } }, existing)[0]).toMatch(/de 1 à 50/);
    expect(checkVisibleWhen('cause', { visibleWhen: 'mal formé' }, existing)[0]).toMatch(/forme attendue/);
    expect(visibleWhenOf({ visibleWhen: { field: 'a', in: [1, 2] } })).toEqual({ field: 'a', in: ['1', '2'] });
  });
});

suite('visibilité conditionnelle : obligation et création (intégration)', () => {
  let testDb: TestDb; let trackers: TrackerService; let artifacts: ArtifactService;
  const org = crypto.randomUUID();
  beforeAll(async () => {
    testDb = await createTestDb('athena_test_visibility');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    await db.tx(org, (c) => c.query("insert into organization (id, key, name) values ($1,'vis','vis')", [org]));
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, {
      projectKey: 'ARI', key: 'INC', name: 'Incidents', typeKey: 'task',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
        { key: 'kind', label: 'Nature', type: 'text' },
      ],
      statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }, { key: 'done', name: 'Fait', category: 'done' }],
      transitions: [{ name: 'Clore', from: 'open', to: 'done', validators: [{ type: 'required_fields', fields: ['cause'] }] }],
    }, admin);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('refuse un champ dont le pilote est inconnu ou conditionnel, accepte un pilote valide', async () => {
    expect(await code(trackers.addField(org, 'ARI', 'INC', { key: 'cause', label: 'Cause', type: 'text', config: { visibleWhen: { field: 'absent', in: ['panne'] } } }, admin))).toMatch(/validation:.*n'existe pas/);
    expect(await code(trackers.addField(org, 'ARI', 'INC', { key: 'cause', label: 'Cause', type: 'text', config: { visibleWhen: { field: 'kind', in: ['panne'] } } }, admin))).toBe('ok');
    expect(await code(trackers.addField(org, 'ARI', 'INC', { key: 'detail', label: 'Détail', type: 'text', config: { visibleWhen: { field: 'cause', in: ['x'] } } }, admin))).toMatch(/conditionnel/);
  });

  it('un champ obligatoire masqué n’est pas exigé à la création ni à la transition ; visible, il l’est', async () => {
    // rendre « cause » obligatoire : impossible sur un tracker non vide, donc on le crée obligatoire sur un tracker neuf
    await trackers.createTracker(org, {
      projectKey: 'ARI', key: 'PAN', name: 'Pannes', typeKey: 'task',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
        { key: 'kind', label: 'Nature', type: 'text' },
        { key: 'cause', label: 'Cause', type: 'text', required: true, config: { visibleWhen: { field: 'kind', in: ['panne'] } } },
      ],
      statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }, { key: 'done', name: 'Fait', category: 'done' }],
      transitions: [{ name: 'Clore', from: 'open', to: 'done', validators: [{ type: 'required_fields', fields: ['cause'] }] }],
    }, admin);
    const hidden = await artifacts.create(org, 'ARI', 'PAN', { title: 'Question', kind: 'demande' }, admin);
    expect(hidden.key).toMatch(/PAN/); // « cause » masqué : non exigé
    const shown = await code(artifacts.create(org, 'ARI', 'PAN', { title: 'Panne moteur', kind: 'panne' }, admin));
    expect(shown).toMatch(/validation:.*cause : obligatoire/); // visible : exigé
    const ok = await artifacts.create(org, 'ARI', 'PAN', { title: 'Panne moteur', kind: 'panne', cause: 'joint' }, admin);
    expect(ok.values['cause']).toBe('joint');
    // transition « Clore » : le validateur exige « cause » seulement quand il est visible
    expect((await artifacts.transition(org, 'ARI', hidden.key, 'Clore', hidden.version, admin)).status).toBe('done');
  });
});
