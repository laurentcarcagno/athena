def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert old in s, (path, old[:70])
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf-8').write(s)

edit('src/core/tracker.service.ts', [
    ("  async getDefinition(c: PoolClient,", """  /**
   * Évolutions de configuration d'un tracker (plan § 15.3). Chaque évolution incrémente `schema_version`, est
   * auditée et produit un événement `tracker.updated` (donc un commit de `tracker.yaml` dans l'historique).
   * Les évolutions destructrices (suppression, changement de type) ne sont pas proposées : elles exigent une
   * migration de données prévisualisée.
   */
  async addField(organizationId: string, projectKey: string, trackerKey: string, field: FieldSpec, actor: Actor): Promise<void> {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(field.key)) throw validation(['clé de champ invalide (minuscules, chiffres, tiret bas)']);
    if (!this.fieldTypes.has(field.type)) throw validation([`type de champ inconnu : ${field.type}`]);
    await this.mutate(organizationId, projectKey, trackerKey, actor, `champ ${field.key}`, async (c, tracker) => {
      const used = Number((await c.query('select count(*) n from artifact where tracker_id = $1', [tracker])).rows[0].n);
      if (field.required && used > 0) throw conflict('Un champ obligatoire ne peut pas être ajouté à un tracker qui contient déjà des artefacts.');
      const position = Number((await c.query('select coalesce(max(position) + 1, 0) n from field_definition where tracker_id = $1', [tracker])).rows[0].n);
      await c.query(
        'insert into field_definition (organization_id, tracker_id, key, label, type, config, required, position, semantic_role) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [organizationId, tracker, field.key, field.label, field.type, JSON.stringify(field.config ?? {}), field.required ?? false, position, field.semanticRole ?? null],
      );
    });
  }

  async addStatus(organizationId: string, projectKey: string, trackerKey: string, status: StatusSpec, actor: Actor): Promise<void> {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) throw validation(['clé de statut invalide']);
    await this.mutate(organizationId, projectKey, trackerKey, actor, `statut ${status.key}`, async (c, tracker) => {
      const position = Number((await c.query('select coalesce(max(position) + 1, 0) n from status where tracker_id = $1', [tracker])).rows[0].n);
      await c.query('insert into status (organization_id, tracker_id, key, name, category, position) values ($1,$2,$3,$4,$5,$6)', [organizationId, tracker, status.key, status.name, status.category, position]);
    });
  }

  async addTransition(organizationId: string, projectKey: string, trackerKey: string, t: TransitionSpec, actor: Actor): Promise<void> {
    await this.mutate(organizationId, projectKey, trackerKey, actor, `transition ${t.name}`, async (c, tracker) => {
      const ids = new Map((await c.query('select key, id from status where tracker_id = $1', [tracker])).rows.map((r) => [r.key as string, r.id as string]));
      if (t.from !== null && !ids.has(t.from)) throw validation([`statut source inconnu : ${t.from}`]);
      if (!ids.has(t.to)) throw validation([`statut cible inconnu : ${t.to}`]);
      await c.query(
        'insert into transition (organization_id, tracker_id, name, from_status_id, to_status_id, conditions, validators, post_actions) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [organizationId, tracker, t.name, t.from === null ? null : ids.get(t.from), ids.get(t.to), JSON.stringify(t.conditions ?? []), JSON.stringify(t.validators ?? []), JSON.stringify(t.postActions ?? [])],
      );
    });
  }

  private async mutate(
    organizationId: string, projectKey: string, trackerKey: string, actor: Actor, what: string,
    change: (c: PoolClient, trackerId: string) => Promise<void>,
  ): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const tracker = (await c.query('select t.id from tracker t join project p on p.id = t.project_id where p.key = $1 and t.key = $2 for update of t', [projectKey, trackerKey])).rows[0];
      if (!tracker) throw notFound(`Tracker ${projectKey}/${trackerKey}`);
      await change(c, tracker.id as string);
      const version = (await c.query('update tracker set schema_version = schema_version + 1 where id = $1 returning schema_version', [tracker.id])).rows[0].schema_version as number;
      await outbox(c, organizationId, 'tracker', tracker.id as string, 'tracker.updated', { key: trackerKey, project: projectKey, actor: actor.id, change: what, schemaVersion: version });
      await audit(c, organizationId, actor, 'tracker.update', `tracker:${projectKey}/${trackerKey}`, { change: what, schemaVersion: version });
    });
  }

  async getDefinition(c: PoolClient,"""),
    ("import { DomainError, notFound, validation } from './errors';", "import { DomainError, conflict, notFound, validation } from './errors';"),
])

edit('src/history/history-sync.ts', [
    ("if (event.type === 'tracker.created' && event.project_key) return this.commitTracker(organizationId, orgKey, event);", "if ((event.type === 'tracker.created' || event.type === 'tracker.updated') && event.project_key) return this.commitTracker(organizationId, orgKey, event);"),
    ("message: `tracker ${trackerKey}: création\\n\\nAthena-Event-Id:", "message: `tracker ${trackerKey}: ${event.type === 'tracker.created' ? 'création' : `configuration (${String((event.payload as Record<string, unknown>)['change'] ?? 'mise à jour')})`}\\n\\nAthena-Event-Id:"),
])

ROUTES = """  @Roles('athena-admin')
  @Post(':project/trackers/:tracker/fields')
  async addField(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(z.object({
      key: z.string(), label: z.string().min(1).max(100), type: z.string(), config: z.record(z.unknown()).optional(),
      required: z.boolean().optional(), semanticRole: z.enum(['title', 'description', 'status', 'assignee', 'due_date', 'estimate']).optional(),
    }), body);
    await this.trackers.addField(organizationId, project, tracker, input, actor);
    return { added: input.key };
  }

  @Roles('athena-admin')
  @Post(':project/trackers/:tracker/statuses')
  async addStatus(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(z.object({ key: z.string(), name: z.string().min(1).max(100), category: z.enum(['todo', 'in_progress', 'done']) }), body);
    await this.trackers.addStatus(organizationId, project, tracker, input, actor);
    return { added: input.key };
  }

  @Roles('athena-admin')
  @Post(':project/trackers/:tracker/transitions')
  async addTransition(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(z.object({
      name: z.string().min(1).max(100), from: z.string().nullable(), to: z.string(),
      conditions: z.array(z.unknown()).optional(), validators: z.array(z.unknown()).optional(), postActions: z.array(z.unknown()).optional(),
    }), body);
    await this.trackers.addTransition(organizationId, project, tracker, input, actor);
    return { added: input.name };
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get(':project/trackers/:tracker')"""
edit('src/core/core.controller.ts', [
    ("  @Roles('athena-team-member', 'athena-admin')\n  @Get(':project/trackers/:tracker')", ROUTES),
])

s = open('src/history/baselines.test.ts', encoding='utf-8').read().rstrip()
s = s[:-3] + """
  it('versionne les évolutions de configuration du tracker dans tracker.yaml', async () => {
    const db = new Db(testDb.pool);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    await trackers.addField(org, 'ARI', 'BUG', { key: 'environment', label: 'Environnement', type: 'text' }, alice);
    await trackers.addStatus(org, 'ARI', 'BUG', { key: 'wontfix', name: 'Abandonné', category: 'done' }, alice);
    await trackers.addTransition(org, 'ARI', 'BUG', { name: 'Abandonner', from: 'open', to: 'wontfix' }, alice);
    await sync.runOnce();
    const def = parse(await gitlab.fileContent(repoId, 'trackers/BUG/tracker.yaml', 'main'));
    expect(def.schemaVersion).toBe(4);
    expect(def.fields.map((f: { key: string }) => f.key)).toContain('environment');
    expect(def.transitions.find((t: { name: string }) => t.name === 'Abandonner')).toMatchObject({ from: 'open', to: 'wontfix' });
    const commits = await gitlab.commits(repoId, 'trackers/BUG/tracker.yaml', 'main');
    expect(commits[0]!.message).toContain('configuration (transition Abandonner)');
    expect(commits[0]).toMatchObject({ author_name: 'Alice Martin' });
  }, 60_000);
});
"""
open('src/history/baselines.test.ts', 'w', encoding='utf-8').write(s)
print('ok')
