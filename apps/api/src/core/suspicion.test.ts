import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { FieldTypeRegistry } from './field-types';
import { LinkService } from './link.service';
import { LinkTypeService } from './link-type.service';
import { TemplateService } from './template.service';
import { requirementTemplate } from './templates';
import { TrackerService, type TrackerSpec } from './tracker.service';

const actor: Actor = { id: 'u1', roles: ['athena-team-member', 'athena-admin'] };
const suite = pgUp ? describe : describe.skip;

/** Exigence dont `priority` et `assignee` ne sont pas des champs de contenu. */
const spec = (): TrackerSpec => ({
  ...requirementTemplate('ARI'),
  fields: [
    { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
    { key: 'statement', label: 'Énoncé', type: 'richtext', required: true, semanticRole: 'description' },
    { key: 'priority', label: 'Priorité', type: 'select', config: { options: ['basse', 'haute'] }, isContent: false },
    { key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee', isContent: false },
  ],
});

suite('suspicion des liens', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let links: LinkService;
  let linkTypes: LinkTypeService;
  let trackers: TrackerService;
  let templates: TemplateService;
  const org = crypto.randomUUID();

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_suspicion');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    links = new LinkService(db);
    linkTypes = new LinkTypeService(db);
    templates = new TemplateService(db, trackers);
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'susp']));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, spec(), actor);
  });
  afterAll(async () => { await testDb?.drop(); });

  /** Deux exigences liées ; renvoie la cible (celle dont la modification rend le lien suspect) et l'identifiant du lien. */
  async function pair(type: string): Promise<{ target: { key: string; version: number }; suspect: () => Promise<boolean> }> {
    const source = await artifacts.create(org, 'ARI', 'REQ', { title: 'Source', statement: 's' }, actor);
    const target = await artifacts.create(org, 'ARI', 'REQ', { title: 'Cible', statement: 's' }, actor);
    await links.link(org, 'ARI', source.key, target.key, type, actor);
    return { target: { key: target.key, version: 1 }, suspect: async () => (await links.list(org, 'ARI', source.key))[0]!.suspect };
  }

  it('les champs sont de contenu par défaut ; priorité et responsable en sont exclus ici', async () => {
    const def = await new Db(testDb.pool).tx(org, (c) => trackers.getDefinition(c, 'ARI', 'REQ'));
    expect(def.fields.map((f) => [f.key, f.isContent])).toEqual([['title', true], ['statement', true], ['priority', false], ['assignee', false]]);
  });

  it('modifier un champ hors contenu ne rend pas le lien suspect, modifier un champ de contenu le fait', async () => {
    const { target, suspect } = await pair('refines');
    const v2 = await artifacts.update(org, 'ARI', target.key, { priority: 'haute', assignee: 'alice' }, 1, actor);
    expect(await suspect()).toBe(false);
    await artifacts.update(org, 'ARI', target.key, { statement: 'Énoncé révisé' }, v2.version, actor);
    expect(await suspect()).toBe(true);
  });

  it('un changement d’état ne rend jamais un lien suspect', async () => {
    const { target, suspect } = await pair('refines');
    await artifacts.transition(org, 'ARI', target.key, 'Approuver', 1, actor);
    expect(await suspect()).toBe(false);
  });

  it('un type qui ne propage pas la suspicion (« bloque ») laisse le lien intact même si le contenu change', async () => {
    const { target, suspect } = await pair('blocks');
    await artifacts.update(org, 'ARI', target.key, { statement: 'Énoncé révisé' }, 1, actor);
    expect(await suspect()).toBe(false);
    // Le réglage se change par type : « bloque » propage maintenant, « raffine » ne propage plus.
    await linkTypes.update(org, 'blocks', { outwardLabel: 'bloque', inwardLabel: 'est bloqué par', hierarchical: false, propagatesSuspect: true, pairs: [] }, actor);
    const second = await pair('blocks');
    await artifacts.update(org, 'ARI', second.target.key, { statement: 'Autre révision' }, 1, actor);
    expect(await second.suspect()).toBe(true);
    expect((await linkTypes.list(org)).find((t) => t.key === 'blocks')).toMatchObject({ propagatesSuspect: true, modified: true });
  });

  it('le drapeau d’un champ se change après coup et s’applique aussitôt', async () => {
    await trackers.updateField(org, 'ARI', 'REQ', 'priority', { isContent: true }, actor);
    const { target, suspect } = await pair('refines');
    await artifacts.update(org, 'ARI', target.key, { priority: 'basse' }, 1, actor);
    expect(await suspect()).toBe(true);
    await trackers.updateField(org, 'ARI', 'REQ', 'priority', { isContent: false }, actor);
  });

  it('la restauration d’une révision obéit à la même règle', async () => {
    const { target, suspect } = await pair('refines');
    const edited = await artifacts.update(org, 'ARI', target.key, { priority: 'haute' }, 1, actor);
    expect(await suspect()).toBe(false);
    const restored = await artifacts.restore(org, 'ARI', target.key, 1, edited.version, actor); // retour à la version 1 : seule la priorité change
    expect(restored.version).toBe(3);
    expect(await suspect()).toBe(false);
  });

  it('les gabarits reprennent le drapeau (seulement quand il est décoché)', async () => {
    const [fromProject] = await templates.trackersOf(org, 'ARI', ['REQ']);
    const flags = Object.fromEntries(fromProject!.fields.map((f) => [f.key, f.isContent]));
    expect(flags).toEqual({ title: undefined, statement: undefined, priority: false, assignee: false });
  });
});
