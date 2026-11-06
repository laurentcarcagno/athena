import { LayoutSchema } from './layout';
import { z } from 'zod';
import { Db, type Actor } from './db';
import { conflict, notFound, validation } from './errors';
import { bugTemplate, requirementTemplate } from './templates';
import { TrackerService, audit, type TrackerSpec } from './tracker.service';
import { NormativeSchema, VERSION, compareVersions, emptyNormative, nextMinor, normativeProblems, templateToYaml, yamlToTemplate, type Normative, type TemplateDefinition } from './normative-template';

const TrackerKey = z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'clé en majuscules, 2 à 10 caractères');
const Role = z.string().max(60);

/** Un tracker d'un template : même forme qu'un tracker, sans le projet. */
export const TemplateTrackerSchema = z.object({
  layout: LayoutSchema.nullish(),
  /** Type de tracker d'organisation (T-0097). */
  typeKey: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/).nullish(),
  key: TrackerKey,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  fields: z.array(z.object({
    key: z.string().min(1).max(60), label: z.string().min(1).max(100), type: z.string(),
    config: z.record(z.string(), z.unknown()).optional(), required: z.boolean().optional(),
    semanticRole: z.enum(['title', 'description', 'status', 'assignee', 'due_date', 'estimate']).optional(), isContent: z.boolean().optional(),
    readRoles: z.array(Role).max(20).optional(), writeRoles: z.array(Role).max(20).optional(),
  })).max(100),
  statuses: z.array(z.object({ key: z.string().min(1), name: z.string().min(1), category: z.enum(['todo', 'in_progress', 'done']) })).min(1).max(50),
  transitions: z.array(z.object({
    name: z.string().min(1), from: z.string().nullable(), to: z.string(),
    conditions: z.array(z.unknown()).optional(), validators: z.array(z.unknown()).optional(), postActions: z.array(z.unknown()).optional(),
  })).max(200),
});
export type TemplateTracker = z.infer<typeof TemplateTrackerSchema>;

export interface TrackerTemplateView { key: string; name: string; description: string; builtin: boolean; modified: boolean; tracker: TemplateTracker }
export interface TemplateView {
  key: string; name: string; description: string; builtin: boolean; modified: boolean; trackers: TemplateTracker[];
  /** Éléments normatifs propres au gabarit (vide pour un gabarit historique) et héritage. */
  normative: Normative; parent: { key: string; version?: string } | null;
  /** Dernière version publiée (nulle tant que rien n'est publié) et brouillon : `draft` si des modifications ne sont pas publiées. */
  version: string | null; status: 'draft' | 'published'; versions: string[];
}
/** Gabarit publié : instantané autonome et immuable (héritage résolu). */
export interface TemplateSnapshot {
  key: string; name: string; description: string; version: string;
  parent: { key: string; version: string } | null;
  trackers: TemplateTracker[]; normative: Normative;
}

const legacy = (v: Pick<TemplateView, 'key' | 'name' | 'description' | 'builtin' | 'modified' | 'trackers'>): TemplateView =>
  ({ ...v, normative: emptyNormative(), parent: null, version: null, status: 'draft', versions: [] });

const strip = ({ projectKey: _p, ...rest }: TrackerSpec): TemplateTracker => JSON.parse(JSON.stringify(rest)) as TemplateTracker;

/** Templates livrés avec Athena : ils ne sont que des données, comme les templates de l'organisation. */
export function builtinTemplates(): TemplateView[] {
  return [
    legacy({ key: 'vide', name: 'Projet vide', description: 'Aucun tracker : à définir ensuite.', builtin: true, modified: false, trackers: [] }),
    legacy({ key: 'bugs', name: 'Suivi de bugs', description: 'Un tracker de bugs avec sévérité, responsable et cause racine.', builtin: true, modified: false, trackers: [strip(bugTemplate(''))] }),
    legacy({ key: 'qualite', name: 'Qualité : exigences et bugs', description: 'Un tracker d’exigences et un tracker de bugs.', builtin: true, modified: false, trackers: [strip(requirementTemplate('')), strip(bugTemplate(''))] }),
  ];
}

/** Templates de tracker livrés : un tracker complet, à reprendre tel quel ou à modifier. */
export function builtinTrackerTemplates(): TrackerTemplateView[] {
  const task: TemplateTracker = {
    key: 'TASK', name: 'Tâches',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'description', label: 'Description', type: 'richtext', semanticRole: 'description' },
      { key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee', isContent: false },
      { key: 'due', label: 'Échéance', type: 'date', semanticRole: 'due_date', isContent: false },
      { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate', isContent: false },
    ],
    statuses: [{ key: 'todo', name: 'À faire', category: 'todo' }, { key: 'doing', name: 'En cours', category: 'in_progress' }, { key: 'done', name: 'Terminé', category: 'done' }],
    transitions: [{ name: 'Démarrer', from: 'todo', to: 'doing' }, { name: 'Terminer', from: 'doing', to: 'done' }, { name: 'Rouvrir', from: null, to: 'todo' }],
  };
  return [
    { key: 'bug', name: 'Bugs', description: 'Sévérité, responsable, versions et cause racine ; revue avant résolution.', builtin: true, modified: false, tracker: strip(bugTemplate('')) },
    { key: 'exigence', name: 'Exigences', description: 'Énoncé, priorité et identifiant documentaire ; approbation puis vérification.', builtin: true, modified: false, tracker: strip(requirementTemplate('')) },
    { key: 'tache', name: 'Tâches', description: 'Tâche simple : à faire, en cours, terminé.', builtin: true, modified: false, tracker: task },
  ];
}

export class TemplateService {
  constructor(private readonly db: Db, private readonly trackers: TrackerService) {}

  /** Un template livré modifié par l'organisation est remplacé par sa version enregistrée (même clé) ; les autres lignes sont les templates de l'organisation. */
  async list(organizationId: string): Promise<TemplateView[]> {
    const { rows, versions } = await this.db.tx(organizationId, async (c) => ({
      rows: (await c.query('select key, name, description, trackers, normative, parent_key, parent_version, version, status from project_template order by lower(name)')).rows
        .map((r) => ({
          key: r.key as string, name: r.name as string, description: r.description as string, trackers: r.trackers as TemplateTracker[],
          normative: NormativeSchema.parse(r.normative ?? {}), parent: r.parent_key ? { key: r.parent_key as string, ...(r.parent_version ? { version: r.parent_version as string } : {}) } : null,
          version: (r.version as string | null) ?? null, status: r.status as 'draft' | 'published',
        })),
      versions: (await c.query('select template_key, version from project_template_version')).rows as Array<{ template_key: string; version: string }>,
    }));
    const versionsOf = (key: string) => versions.filter((v) => v.template_key === key).map((v) => v.version).sort(compareVersions);
    const shipped = builtinTemplates();
    const overrides = new Map(rows.map((r) => [r.key, r]));
    return [
      ...shipped.map((b) => { const o = overrides.get(b.key); return o ? { ...o, builtin: true, modified: true, versions: versionsOf(o.key) } : b; }),
      ...rows.filter((r) => !shipped.some((b) => b.key === r.key)).map((r) => ({ ...r, builtin: false, modified: false, versions: versionsOf(r.key) })),
    ];
  }

  async listTrackerTemplates(organizationId: string): Promise<TrackerTemplateView[]> {
    const rows = await this.db.tx(organizationId, async (c) => (await c.query('select key, name, description, tracker from tracker_template order by lower(name)')).rows
      .map((r) => ({ key: r.key as string, name: r.name as string, description: r.description as string, tracker: r.tracker as TemplateTracker })));
    const shipped = builtinTrackerTemplates();
    const overrides = new Map(rows.map((r) => [r.key, r]));
    return [
      ...shipped.map((b) => { const o = overrides.get(b.key); return o ? { ...o, builtin: true, modified: true } : b; }),
      ...rows.filter((r) => !shipped.some((b) => b.key === r.key)).map((r) => ({ ...r, builtin: false, modified: false })),
    ];
  }

  /** Modifie un template de tracker, y compris un template livré (enregistré alors comme version de l'organisation). */
  async updateTrackerTemplate(organizationId: string, key: string, input: { name: string; description?: string; tracker: TemplateTracker }, actor: Actor): Promise<void> {
    this.trackers.validateSpec({ ...input.tracker, projectKey: '' } as TrackerSpec);
    if (!(await this.listTrackerTemplates(organizationId)).some((t) => t.key === key)) throw notFound(`Template de tracker ${key}`);
    await this.db.tx(organizationId, async (c) => {
      const updated = await c.query('update tracker_template set name = $2, description = $3, tracker = $4, updated_at = now() where key = $1', [key, input.name, input.description ?? '', JSON.stringify(input.tracker)]);
      if (updated.rowCount === 0) {
        await c.query('insert into tracker_template (organization_id, key, name, description, tracker, created_by, updated_at) values ($1,$2,$3,$4,$5,$6, now())',
          [organizationId, key, input.name, input.description ?? '', JSON.stringify(input.tracker), actor.id]);
      }
      await audit(c, organizationId, actor, 'tracker_template.update', `tracker-template:${key}`, { tracker: input.tracker.key });
    });
  }

  async createTrackerTemplate(organizationId: string, input: { key: string; name: string; description?: string; tracker: TemplateTracker }, actor: Actor): Promise<void> {
    this.trackers.validateSpec({ ...input.tracker, projectKey: '' } as TrackerSpec);
    if ((await this.listTrackerTemplates(organizationId)).some((t) => t.key === input.key)) throw conflict(`Un template de tracker « ${input.key} » existe déjà.`);
    await this.db.tx(organizationId, async (c) => {
      await c.query('insert into tracker_template (organization_id, key, name, description, tracker, created_by) values ($1,$2,$3,$4,$5,$6)',
        [organizationId, input.key, input.name, input.description ?? '', JSON.stringify(input.tracker), actor.id]);
      await audit(c, organizationId, actor, 'tracker_template.create', `tracker-template:${input.key}`, { tracker: input.tracker.key });
    });
  }

  async removeTrackerTemplate(organizationId: string, key: string, actor: Actor): Promise<void> {
    const shipped = builtinTrackerTemplates().some((t) => t.key === key);
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query('delete from tracker_template where key = $1', [key]);
      if (result.rowCount === 0) throw shipped ? conflict('Ce template de tracker livré avec Athena est déjà dans son état d’origine : il ne peut pas être supprimé.') : notFound(`Template de tracker ${key}`);
      await audit(c, organizationId, actor, shipped ? 'tracker_template.reset' : 'tracker_template.delete', `tracker-template:${key}`);
    });
  }

  /** Trackers désignés par des clés de templates de tracker, dans l'ordre demandé. */
  async trackersFromTemplates(organizationId: string, keys: string[]): Promise<TemplateTracker[]> {
    const all = await this.listTrackerTemplates(organizationId);
    return keys.map((k) => {
      const found = all.find((t) => t.key === k);
      if (!found) throw notFound(`Template de tracker ${k}`);
      return found.tracker;
    });
  }

  async get(organizationId: string, key: string): Promise<TemplateView> {
    const found = (await this.list(organizationId)).find((t) => t.key === key);
    if (!found) throw notFound(`Template ${key}`);
    return found;
  }

  async create(organizationId: string, input: { key: string; name: string; description?: string; trackers: TemplateTracker[]; normative?: Normative }, actor: Actor): Promise<void> {
    if (builtinTemplates().some((t) => t.key === input.key)) throw conflict('Cette clé est réservée à un template livré avec Athena.');
    const keys = input.trackers.map((t) => t.key);
    if (new Set(keys).size !== keys.length) throw validation(['deux trackers du template ont la même clé']);
    for (const t of input.trackers) this.trackers.validateSpec({ ...t, projectKey: '' } as TrackerSpec);
    if ((await this.list(organizationId)).some((t) => t.key === input.key)) throw conflict(`Un template « ${input.key} » existe déjà.`);
    const normative = this.checkNormative(input.trackers, input.normative);
    await this.db.tx(organizationId, async (c) => {
      await c.query('insert into project_template (organization_id, key, name, description, trackers, normative, created_by) values ($1,$2,$3,$4,$5,$6,$7)',
        [organizationId, input.key, input.name, input.description ?? '', JSON.stringify(input.trackers), JSON.stringify(normative), actor.id]);
      await audit(c, organizationId, actor, 'project_template.create', `template:${input.key}`, { trackers: keys });
    });
  }

  /** Construit les trackers d'un template à partir de ceux d'un projet existant. */
  async trackersOf(organizationId: string, projectKey: string, only?: string[]): Promise<TemplateTracker[]> {
    return this.db.tx(organizationId, async (c) => {
      const list = (await c.query('select t.key from tracker t join project p on p.id = t.project_id where p.key = $1 order by t.key', [projectKey])).rows.map((r) => r.key as string);
      if (list.length === 0) throw validation([`le projet ${projectKey} n’a aucun tracker`]);
      const wanted = only ?? list;
      const unknown = wanted.filter((k) => !list.includes(k));
      if (unknown.length) throw validation([`trackers inconnus : ${unknown.join(', ')}`]);
      const out: TemplateTracker[] = [];
      for (const key of wanted) {
        const d = await this.trackers.getDefinition(c, projectKey, key);
        const keyOf = (id: string | null) => (id === null ? null : d.statuses.find((s) => s.id === id)!.key);
        out.push(TemplateTrackerSchema.parse(JSON.parse(JSON.stringify({
          key: d.key, name: d.name, ...(d.layout ? { layout: d.layout } : {}), ...(d.typeKey ? { typeKey: d.typeKey } : {}),
          fields: d.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, config: f.config, required: f.required, ...(f.isContent === false ? { isContent: false } : {}), ...(f.semanticRole ? { semanticRole: f.semanticRole } : {}), ...(f.readRoles ? { readRoles: f.readRoles } : {}), ...(f.writeRoles ? { writeRoles: f.writeRoles } : {}) })),
          statuses: [...d.statuses].sort((a, b) => a.position - b.position).map((s) => ({ key: s.key, name: s.name, category: s.category })),
          transitions: d.transitions.map((t) => ({ name: t.name, from: keyOf(t.fromStatusId), to: keyOf(t.toStatusId)!, conditions: t.conditions, validators: t.validators, postActions: t.postActions })),
        }))));
      }
      return out;
    });
  }

  async remove(organizationId: string, key: string, actor: Actor): Promise<void> {
    const shipped = builtinTemplates().some((t) => t.key === key);
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query('delete from project_template where key = $1', [key]);
      if (result.rowCount === 0) throw shipped ? conflict('Ce template livré avec Athena est déjà dans son état d’origine : il ne peut pas être supprimé.') : notFound(`Template ${key}`);
      await audit(c, organizationId, actor, shipped ? 'project_template.reset' : 'project_template.delete', `template:${key}`);
    });
  }

  /** Modifie un template de projet, y compris un template livré (enregistré alors comme version de l'organisation). */
  async update(organizationId: string, key: string, input: { name: string; description?: string; trackers: TemplateTracker[]; normative?: Normative }, actor: Actor): Promise<void> {
    const keys = input.trackers.map((t) => t.key);
    if (new Set(keys).size !== keys.length) throw validation(['deux trackers du template ont la même clé']);
    for (const t of input.trackers) this.trackers.validateSpec({ ...t, projectKey: '' } as TrackerSpec);
    const current = (await this.list(organizationId)).find((t) => t.key === key);
    if (!current) throw notFound(`Template ${key}`);
    const normative = this.checkNormative(input.trackers, input.normative ?? current.normative);
    await this.db.tx(organizationId, async (c) => {
      // Toute modification repasse le gabarit en brouillon : les projets restent sur leur version publiée.
      const updated = await c.query("update project_template set name = $2, description = $3, trackers = $4, normative = $5, status = 'draft', updated_at = now() where key = $1", [key, input.name, input.description ?? '', JSON.stringify(input.trackers), JSON.stringify(normative)]);
      if (updated.rowCount === 0) {
        await c.query('insert into project_template (organization_id, key, name, description, trackers, normative, created_by, updated_at) values ($1,$2,$3,$4,$5,$6,$7, now())',
          [organizationId, key, input.name, input.description ?? '', JSON.stringify(input.trackers), JSON.stringify(normative), actor.id]);
      }
      await audit(c, organizationId, actor, 'project_template.update', `template:${key}`, { trackers: keys });
    });
  }

  /** Valide le modèle normatif d'un gabarit : un gabarit incohérent (phase sans revue, livrable inconnu…) est refusé. */
  private checkNormative(trackers: TemplateTracker[], input: Normative | undefined): Normative {
    const parsed = NormativeSchema.safeParse(input ?? {});
    if (!parsed.success) throw validation(parsed.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`));
    const problems = normativeProblems(trackers, parsed.data);
    if (problems.length) throw validation(problems);
    return parsed.data;
  }

  /** Versions publiées, de la plus ancienne à la plus récente. */
  async versions(organizationId: string, key: string): Promise<Array<{ version: string; publishedBy: string; publishedAt: string }>> {
    const rows = await this.db.tx(organizationId, async (c) => (await c.query('select version, published_by, published_at from project_template_version where template_key = $1', [key])).rows);
    return rows.map((r) => ({ version: r.version as string, publishedBy: r.published_by as string, publishedAt: (r.published_at as Date).toISOString() }))
      .sort((a, b) => compareVersions(a.version, b.version));
  }

  /** Instantané publié d'un gabarit (dernière version par défaut). */
  async snapshot(organizationId: string, key: string, version?: string): Promise<TemplateSnapshot> {
    const rows = await this.db.tx(organizationId, async (c) => (await c.query('select version, snapshot from project_template_version where template_key = $1', [key])).rows);
    const sorted = rows.sort((a, b) => compareVersions(a.version as string, b.version as string));
    const row = version ? sorted.find((r) => r.version === version) : sorted[sorted.length - 1];
    if (!row) throw notFound(version ? `Version ${version} du template ${key}` : `Aucune version publiée du template ${key}`);
    return row.snapshot as TemplateSnapshot;
  }

  /** Publie le gabarit : fige une version immuable. Sans numéro, la version suivante (1.0, puis 1.1, 1.2…). */
  async publish(organizationId: string, key: string, version: string | undefined, actor: Actor): Promise<TemplateSnapshot> {
    const view = await this.get(organizationId, key);
    if (version !== undefined && !VERSION.test(version)) throw validation(['numéro de version invalide (ex. 1.0, 2.1)']);
    const last = view.versions.length ? view.versions[view.versions.length - 1]! : null;
    const next = version ?? nextMinor(last);
    if (last !== null && compareVersions(next, last) <= 0) throw conflict(`La version ${next} n’est pas postérieure à la dernière version publiée (${last}).`);
    const snapshot: TemplateSnapshot = { key, name: view.name, description: view.description, version: next, parent: null, trackers: view.trackers, normative: this.checkNormative(view.trackers, view.normative) };
    await this.db.tx(organizationId, async (c) => {
      await c.query('insert into project_template_version (organization_id, template_key, version, snapshot, published_by) values ($1,$2,$3,$4,$5)', [organizationId, key, next, JSON.stringify(snapshot), actor.id]);
      const updated = await c.query("update project_template set version = $2, status = 'published' where key = $1", [key, next]);
      if (updated.rowCount === 0) throw conflict('Ce template livré avec Athena n’a pas de modifications à publier.');
      await audit(c, organizationId, actor, 'project_template.publish', `template:${key}`, { version: next });
    });
    return snapshot;
  }

  /** Définition propre du gabarit, échangeable en YAML (export pour la gestion de configuration ou une autre instance). */
  async exportYaml(organizationId: string, key: string): Promise<string> {
    const v = await this.get(organizationId, key);
    const def: TemplateDefinition = { key: v.key, name: v.name, description: v.description, ...(v.parent ? { parent: v.parent } : {}), trackers: v.trackers, normative: v.normative };
    return templateToYaml(def);
  }

  /** Importe un gabarit YAML : crée le brouillon, ou remplace celui de même clé. */
  async importYaml(organizationId: string, text: string, actor: Actor): Promise<{ key: string; created: boolean }> {
    let doc: ReturnType<typeof yamlToTemplate>;
    try { doc = yamlToTemplate(text); } catch (e) { throw validation([(e as Error).message]); }
    const trackers = doc.trackers.map((t) => {
      const parsed = TemplateTrackerSchema.safeParse(t);
      if (!parsed.success) throw validation([`tracker invalide : ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}`]);
      return parsed.data;
    });
    const exists = (await this.list(organizationId)).some((t) => t.key === doc.key && !t.builtin);
    const input = { name: doc.name, description: doc.description, trackers, normative: doc.normative };
    if (exists) await this.update(organizationId, doc.key, input, actor);
    else await this.create(organizationId, { key: doc.key, ...input }, actor);
    return { key: doc.key, created: !exists };
  }

  /** Crée un projet, avec les trackers du template choisi (de sa version publiée si elle existe : le projet y reste rattaché). */
  async createProject(organizationId: string, key: string, name: string, templateKey: string | undefined, actor: Actor, options: { version?: string; criticality?: string } = {}): Promise<{ trackers: string[]; templateVersion: string | null }> {
    const view = templateKey ? await this.get(organizationId, templateKey) : undefined;
    const pinned = view && (options.version !== undefined || view.version !== null) ? await this.snapshot(organizationId, view.key, options.version) : undefined;
    const source = pinned ?? view;
    const categories = source?.normative.criticality?.categories.map((c) => c.key) ?? [];
    if (options.criticality !== undefined && !categories.includes(options.criticality)) throw validation([`catégorie de criticité inconnue : ${options.criticality}`]);
    await this.trackers.createProject(organizationId, key, name, actor);
    const created: string[] = [];
    for (const t of source?.trackers ?? []) {
      await this.trackers.createTracker(organizationId, { ...t, projectKey: key } as TrackerSpec, actor);
      created.push(t.key);
    }
    if (view) await this.applyTemplate(organizationId, key, view.key, pinned?.version ?? null, source!.normative, options.criticality ?? null);
    return { trackers: created, templateVersion: pinned?.version ?? null };
  }

  /** Rattache le projet à son gabarit et en applique les règles de couverture ; la première phase devient la phase courante. */
  private async applyTemplate(organizationId: string, projectKey: string, templateKey: string, version: string | null, n: Normative, criticality: string | null): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('update project set template_key = $2, template_version = $3, criticality = $4, current_phase = $5 where key = $1 returning id', [projectKey, templateKey, version, criticality, n.phases[0]?.key ?? null])).rows[0];
      for (const r of n.rules) {
        await c.query(
          `insert into coverage_rule (organization_id, project_id, key, name, from_tracker_key, link_type_key, direction, min_count, status_filter, threshold)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing`,
          [organizationId, project.id, r.key, r.name, r.fromTracker, r.linkType, r.direction, r.minCount, r.statuses, JSON.stringify(r.threshold)],
        );
      }
    });
  }
}
