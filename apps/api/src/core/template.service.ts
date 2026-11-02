import { LayoutSchema } from './layout';
import { z } from 'zod';
import { Db, type Actor } from './db';
import { conflict, notFound, validation } from './errors';
import { bugTemplate, requirementTemplate } from './templates';
import { TrackerService, audit, type TrackerSpec } from './tracker.service';

const TrackerKey = z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'clé en majuscules, 2 à 10 caractères');
const Role = z.string().max(60);

/** Un tracker d'un template : même forme qu'un tracker, sans le projet. */
export const TemplateTrackerSchema = z.object({
  layout: LayoutSchema.nullish(),
  key: TrackerKey,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  fields: z.array(z.object({
    key: z.string().min(1).max(60), label: z.string().min(1).max(100), type: z.string(),
    config: z.record(z.string(), z.unknown()).optional(), required: z.boolean().optional(),
    semanticRole: z.enum(['title', 'description', 'status', 'assignee', 'due_date', 'estimate']).optional(),
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
export interface TemplateView { key: string; name: string; description: string; builtin: boolean; modified: boolean; trackers: TemplateTracker[] }

const strip = ({ projectKey: _p, ...rest }: TrackerSpec): TemplateTracker => JSON.parse(JSON.stringify(rest)) as TemplateTracker;

/** Templates livrés avec Athena : ils ne sont que des données, comme les templates de l'organisation. */
export function builtinTemplates(): TemplateView[] {
  return [
    { key: 'vide', name: 'Projet vide', description: 'Aucun tracker : à définir ensuite.', builtin: true, modified: false, trackers: [] },
    { key: 'bugs', name: 'Suivi de bugs', description: 'Un tracker de bugs avec sévérité, responsable et cause racine.', builtin: true, modified: false, trackers: [strip(bugTemplate(''))] },
    { key: 'qualite', name: 'Qualité : exigences et bugs', description: 'Un tracker d’exigences et un tracker de bugs.', builtin: true, modified: false, trackers: [strip(requirementTemplate('')), strip(bugTemplate(''))] },
  ];
}

/** Templates de tracker livrés : un tracker complet, à reprendre tel quel ou à modifier. */
export function builtinTrackerTemplates(): TrackerTemplateView[] {
  const task: TemplateTracker = {
    key: 'TASK', name: 'Tâches',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'description', label: 'Description', type: 'richtext', semanticRole: 'description' },
      { key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee' },
      { key: 'due', label: 'Échéance', type: 'date', semanticRole: 'due_date' },
      { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate' },
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
    const rows = await this.db.tx(organizationId, async (c) => (await c.query('select key, name, description, trackers from project_template order by lower(name)')).rows
      .map((r) => ({ key: r.key as string, name: r.name as string, description: r.description as string, trackers: r.trackers as TemplateTracker[] })));
    const shipped = builtinTemplates();
    const overrides = new Map(rows.map((r) => [r.key, r]));
    return [
      ...shipped.map((b) => { const o = overrides.get(b.key); return o ? { ...o, builtin: true, modified: true } : b; }),
      ...rows.filter((r) => !shipped.some((b) => b.key === r.key)).map((r) => ({ ...r, builtin: false, modified: false })),
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

  async create(organizationId: string, input: { key: string; name: string; description?: string; trackers: TemplateTracker[] }, actor: Actor): Promise<void> {
    if (builtinTemplates().some((t) => t.key === input.key)) throw conflict('Cette clé est réservée à un template livré avec Athena.');
    const keys = input.trackers.map((t) => t.key);
    if (new Set(keys).size !== keys.length) throw validation(['deux trackers du template ont la même clé']);
    for (const t of input.trackers) this.trackers.validateSpec({ ...t, projectKey: '' } as TrackerSpec);
    if ((await this.list(organizationId)).some((t) => t.key === input.key)) throw conflict(`Un template « ${input.key} » existe déjà.`);
    await this.db.tx(organizationId, async (c) => {
      await c.query('insert into project_template (organization_id, key, name, description, trackers, created_by) values ($1,$2,$3,$4,$5,$6)',
        [organizationId, input.key, input.name, input.description ?? '', JSON.stringify(input.trackers), actor.id]);
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
          key: d.key, name: d.name, ...(d.layout ? { layout: d.layout } : {}),
          fields: d.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, config: f.config, required: f.required, ...(f.semanticRole ? { semanticRole: f.semanticRole } : {}), ...(f.readRoles ? { readRoles: f.readRoles } : {}), ...(f.writeRoles ? { writeRoles: f.writeRoles } : {}) })),
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
  async update(organizationId: string, key: string, input: { name: string; description?: string; trackers: TemplateTracker[] }, actor: Actor): Promise<void> {
    const keys = input.trackers.map((t) => t.key);
    if (new Set(keys).size !== keys.length) throw validation(['deux trackers du template ont la même clé']);
    for (const t of input.trackers) this.trackers.validateSpec({ ...t, projectKey: '' } as TrackerSpec);
    if (!(await this.list(organizationId)).some((t) => t.key === key)) throw notFound(`Template ${key}`);
    await this.db.tx(organizationId, async (c) => {
      const updated = await c.query('update project_template set name = $2, description = $3, trackers = $4, updated_at = now() where key = $1', [key, input.name, input.description ?? '', JSON.stringify(input.trackers)]);
      if (updated.rowCount === 0) {
        await c.query('insert into project_template (organization_id, key, name, description, trackers, created_by, updated_at) values ($1,$2,$3,$4,$5,$6, now())',
          [organizationId, key, input.name, input.description ?? '', JSON.stringify(input.trackers), actor.id]);
      }
      await audit(c, organizationId, actor, 'project_template.update', `template:${key}`, { trackers: keys });
    });
  }

  /** Crée un projet, avec les trackers du template choisi. Le template est vérifié avant toute écriture. */
  async createProject(organizationId: string, key: string, name: string, templateKey: string | undefined, actor: Actor): Promise<{ trackers: string[] }> {
    const template = templateKey ? await this.get(organizationId, templateKey) : undefined;
    await this.trackers.createProject(organizationId, key, name, actor);
    const created: string[] = [];
    for (const t of template?.trackers ?? []) {
      await this.trackers.createTracker(organizationId, { ...t, projectKey: key } as TrackerSpec, actor);
      created.push(t.key);
    }
    return { trackers: created };
  }
}
