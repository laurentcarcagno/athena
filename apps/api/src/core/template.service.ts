import { TemplateTrackerSchema, type TemplateTracker } from './template-tracker';
import { z } from 'zod';
import { Db, type Actor } from './db';
import { DomainError, conflict, notFound, validation } from './errors';
import { bugTemplate, requirementTemplate } from './templates';
import { TrackerService, audit, type TrackerSpec } from './tracker.service';
import { BUILTIN_NORMATIVE, builtinNormative } from './templates/index';
import { chainProblems, resolveLayers, type Layer } from './template-inherit';
import { NormativeSchema, VERSION, compareVersions, emptyNormative, nextMinor, normativeProblems, templateToYaml, yamlToTemplate, type Normative, type TemplateDefinition } from './normative-template';

export { TemplateTrackerSchema, type TemplateTracker };

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

const BUILTIN_PUBLISHED_AT = '2026-11-06T00:00:00.000Z';
const lastOf = <T>(xs: T[]): T => xs[xs.length - 1]!;
const builtinSnapshot = (key: string, version?: string): TemplateSnapshot | undefined => {
  const b = builtinNormative(key);
  const v = b && (version ? b.versions.find((x) => x.version === version) : lastOf(b.versions));
  return b && v ? { key, name: b.name, description: b.description, version: v.version, parent: null, trackers: v.trackers, normative: v.normative } : undefined;
};
/** Version livrée d'un gabarit normatif (utilisée aussi hors du service, ex. pour lire les catégories d'un projet). */
export { builtinSnapshot };
const builtinReadOnly = () => conflict('Ce gabarit est livré avec Athena et ne se modifie pas : créez un gabarit dérivé.');

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
    const normativeViews: TemplateView[] = BUILTIN_NORMATIVE.map((b) => ({
      key: b.key, name: b.name, description: b.description, builtin: true, modified: false, trackers: lastOf(b.versions).trackers, normative: lastOf(b.versions).normative,
      parent: null, version: lastOf(b.versions).version, status: 'published' as const, versions: b.versions.map((v) => v.version),
    }));
    return [
      ...shipped.map((b) => { const o = overrides.get(b.key); return o ? { ...o, builtin: true, modified: true, versions: versionsOf(o.key) } : b; }),
      ...normativeViews,
      ...rows.filter((r) => !shipped.some((b) => b.key === r.key) && !builtinNormative(r.key)).map((r) => ({ ...r, builtin: false, modified: false, versions: versionsOf(r.key) })),
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
    if (!(await this.listTrackerTemplates(organizationId)).some((t) => t.key === key)) throw notFound(`Gabarit de tracker ${key}`);
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
    if ((await this.listTrackerTemplates(organizationId)).some((t) => t.key === input.key)) throw conflict(`Un gabarit de tracker « ${input.key} » existe déjà.`);
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
      if (result.rowCount === 0) throw shipped ? conflict('Ce gabarit de tracker livré avec Athena est déjà dans son état d’origine : il ne peut pas être supprimé.') : notFound(`Gabarit de tracker ${key}`);
      await audit(c, organizationId, actor, shipped ? 'tracker_template.reset' : 'tracker_template.delete', `tracker-template:${key}`);
    });
  }

  /** Trackers désignés par des clés de templates de tracker, dans l'ordre demandé. */
  async trackersFromTemplates(organizationId: string, keys: string[]): Promise<TemplateTracker[]> {
    const all = await this.listTrackerTemplates(organizationId);
    return keys.map((k) => {
      const found = all.find((t) => t.key === k);
      if (!found) throw notFound(`Gabarit de tracker ${k}`);
      return found.tracker;
    });
  }

  async get(organizationId: string, key: string): Promise<TemplateView> {
    const found = (await this.list(organizationId)).find((t) => t.key === key);
    if (!found) throw notFound(`Gabarit ${key}`);
    return found;
  }

  async create(organizationId: string, input: { key: string; name: string; description?: string; trackers: TemplateTracker[]; normative?: Normative; parent?: { key: string; version?: string } | null }, actor: Actor): Promise<void> {
    if (builtinTemplates().some((t) => t.key === input.key) || builtinNormative(input.key)) throw conflict('Cette clé est réservée à un gabarit livré avec Athena.');
    const keys = input.trackers.map((t) => t.key);
    if (new Set(keys).size !== keys.length) throw validation(['deux trackers du gabarit ont la même clé']);
    for (const t of input.trackers) this.trackers.validateSpec({ ...t, projectKey: '' } as TrackerSpec);
    if ((await this.list(organizationId)).some((t) => t.key === input.key)) throw conflict(`Un gabarit « ${input.key} » existe déjà.`);
    const parent = input.parent ?? null;
    const normative = (await this.check(organizationId, input.key, input.trackers, input.normative, parent)).normative;
    await this.db.tx(organizationId, async (c) => {
      await c.query('insert into project_template (organization_id, key, name, description, trackers, normative, parent_key, parent_version, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [organizationId, input.key, input.name, input.description ?? '', JSON.stringify(input.trackers), JSON.stringify(normative), parent?.key ?? null, parent?.version ?? null, actor.id]);
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
    if (builtinNormative(key)) throw builtinReadOnly();
    const shipped = builtinTemplates().some((t) => t.key === key);
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query('delete from project_template where key = $1', [key]);
      if (result.rowCount === 0) throw shipped ? conflict('Ce gabarit livré avec Athena est déjà dans son état d’origine : il ne peut pas être supprimé.') : notFound(`Gabarit ${key}`);
      await audit(c, organizationId, actor, shipped ? 'project_template.reset' : 'project_template.delete', `template:${key}`);
    });
  }

  /** Modifie un template de projet, y compris un template livré (enregistré alors comme version de l'organisation). */
  async update(organizationId: string, key: string, input: { name: string; description?: string; trackers: TemplateTracker[]; normative?: Normative; parent?: { key: string; version?: string } | null }, actor: Actor): Promise<void> {
    if (builtinNormative(key)) throw builtinReadOnly();
    const keys = input.trackers.map((t) => t.key);
    if (new Set(keys).size !== keys.length) throw validation(['deux trackers du gabarit ont la même clé']);
    for (const t of input.trackers) this.trackers.validateSpec({ ...t, projectKey: '' } as TrackerSpec);
    const current = (await this.list(organizationId)).find((t) => t.key === key);
    if (!current) throw notFound(`Gabarit ${key}`);
    const parent = input.parent === undefined ? current.parent : input.parent;
    const normative = (await this.check(organizationId, key, input.trackers, input.normative ?? current.normative, parent)).normative;
    await this.db.tx(organizationId, async (c) => {
      // Toute modification repasse le gabarit en brouillon : les projets restent sur leur version publiée.
      const updated = await c.query("update project_template set name = $2, description = $3, trackers = $4, normative = $5, parent_key = $6, parent_version = $7, status = 'draft', updated_at = now() where key = $1", [key, input.name, input.description ?? '', JSON.stringify(input.trackers), JSON.stringify(normative), parent?.key ?? null, parent?.version ?? null]);
      if (updated.rowCount === 0) {
        await c.query('insert into project_template (organization_id, key, name, description, trackers, normative, created_by, updated_at) values ($1,$2,$3,$4,$5,$6,$7, now())',
          [organizationId, key, input.name, input.description ?? '', JSON.stringify(input.trackers), JSON.stringify(normative), actor.id]);
      }
      await audit(c, organizationId, actor, 'project_template.update', `template:${key}`, { trackers: keys });
    });
  }

  /** Couche du parent (dernière version publiée ou version épinglée), après contrôle des cycles et de la profondeur. */
  private async parentLayer(organizationId: string, key: string, parent: { key: string; version?: string } | null): Promise<{ layer: Layer; version: string } | null> {
    if (parent === null) return null;
    const views = new Map((await this.list(organizationId)).map((t) => [t.key, t]));
    const chain = [key];
    for (let cur: string | undefined = parent.key; cur !== undefined && chain.length <= 12; cur = views.get(cur)?.parent?.key) chain.push(cur);
    const bad = chainProblems(chain);
    if (bad.length) throw validation(bad);
    if (!views.has(parent.key)) throw notFound(`Gabarit parent ${parent.key}`);
    const snap = await this.snapshot(organizationId, parent.key, parent.version).catch((e: unknown) => {
      if (e instanceof DomainError && e.code === 'not_found') throw validation([`le gabarit parent ${parent.key} n’a pas de version publiée${parent.version ? ` ${parent.version}` : ''}`]);
      throw e;
    });
    return { layer: { trackers: snap.trackers, normative: snap.normative }, version: snap.version };
  }

  /** Valide un gabarit (modèle, héritage, cohérence du résultat fusionné) : incohérent, il est refusé avec la liste des écarts. */
  private async check(organizationId: string, key: string, trackers: TemplateTracker[], input: Normative | undefined, parent: { key: string; version?: string } | null): Promise<{ normative: Normative; resolved: Layer; parentVersion: string | null }> {
    const parsed = NormativeSchema.safeParse(input ?? {});
    if (!parsed.success) throw validation(parsed.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`));
    const p = await this.parentLayer(organizationId, key, parent);
    const { resolved, problems } = resolveLayers(p?.layer ?? null, { trackers, normative: parsed.data });
    if (problems.length) throw validation(problems);
    return { normative: parsed.data, resolved, parentVersion: p?.version ?? null };
  }

  /** Gabarit résolu (héritage fusionné) tel qu'il serait publié maintenant : aperçu de l'éditeur. */
  async resolve(organizationId: string, key: string): Promise<{ trackers: TemplateTracker[]; normative: Normative; parent: { key: string; version: string } | null }> {
    const v = await this.get(organizationId, key);
    const { resolved, parentVersion } = await this.check(organizationId, key, v.trackers, v.normative, v.parent);
    return { trackers: resolved.trackers, normative: resolved.normative, parent: v.parent ? { key: v.parent.key, version: parentVersion! } : null };
  }

  /** Versions publiées, de la plus ancienne à la plus récente. */
  async versions(organizationId: string, key: string): Promise<Array<{ version: string; publishedBy: string; publishedAt: string }>> {
    const shipped = builtinNormative(key);
    if (shipped) return shipped.versions.map((v) => ({ version: v.version, publishedBy: 'athena', publishedAt: BUILTIN_PUBLISHED_AT }));
    const rows = await this.db.tx(organizationId, async (c) => (await c.query('select version, published_by, published_at from project_template_version where template_key = $1', [key])).rows);
    return rows.map((r) => ({ version: r.version as string, publishedBy: r.published_by as string, publishedAt: (r.published_at as Date).toISOString() }))
      .sort((a, b) => compareVersions(a.version, b.version));
  }

  /** Instantané publié d'un gabarit (dernière version par défaut). */
  async snapshot(organizationId: string, key: string, version?: string): Promise<TemplateSnapshot> {
    if (builtinNormative(key)) {
      const shipped = builtinSnapshot(key, version);
      if (!shipped) throw notFound(`Version ${version} du gabarit ${key}`);
      return shipped;
    }
    const rows = await this.db.tx(organizationId, async (c) => (await c.query('select version, snapshot from project_template_version where template_key = $1', [key])).rows);
    const sorted = rows.sort((a, b) => compareVersions(a.version as string, b.version as string));
    const row = version ? sorted.find((r) => r.version === version) : sorted[sorted.length - 1];
    if (!row) throw notFound(version ? `Version ${version} du gabarit ${key}` : `Aucune version publiée du gabarit ${key}`);
    return row.snapshot as TemplateSnapshot;
  }

  /** Publie le gabarit : fige une version immuable. Sans numéro, la version suivante (1.0, puis 1.1, 1.2…). */
  async publish(organizationId: string, key: string, version: string | undefined, actor: Actor): Promise<TemplateSnapshot> {
    if (builtinNormative(key)) throw builtinReadOnly();
    const view = await this.get(organizationId, key);
    if (version !== undefined && !VERSION.test(version)) throw validation(['numéro de version invalide (ex. 1.0, 2.1)']);
    const last = view.versions.length ? view.versions[view.versions.length - 1]! : null;
    const next = version ?? nextMinor(last);
    if (last !== null && compareVersions(next, last) <= 0) throw conflict(`La version ${next} n’est pas postérieure à la dernière version publiée (${last}).`);
    const checked = await this.check(organizationId, key, view.trackers, view.normative, view.parent);
    const snapshot: TemplateSnapshot = { key, name: view.name, description: view.description, version: next, parent: view.parent ? { key: view.parent.key, version: checked.parentVersion! } : null, trackers: checked.resolved.trackers, normative: checked.resolved.normative };
    await this.db.tx(organizationId, async (c) => {
      await c.query('insert into project_template_version (organization_id, template_key, version, snapshot, published_by) values ($1,$2,$3,$4,$5)', [organizationId, key, next, JSON.stringify(snapshot), actor.id]);
      const updated = await c.query("update project_template set version = $2, status = 'published' where key = $1", [key, next]);
      if (updated.rowCount === 0) throw conflict('Ce gabarit livré avec Athena n’a pas de modifications à publier.');
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
    const input = { name: doc.name, description: doc.description, trackers, normative: doc.normative, parent: doc.parent ?? null };
    if (exists) await this.update(organizationId, doc.key, input, actor);
    else await this.create(organizationId, { key: doc.key, ...input }, actor);
    return { key: doc.key, created: !exists };
  }

  /** Crée un projet, avec les trackers du template choisi (de sa version publiée si elle existe : le projet y reste rattaché). */
  async createProject(organizationId: string, key: string, name: string, templateKey: string | undefined, actor: Actor, options: { version?: string; criticality?: string } = {}): Promise<{ trackers: string[]; templateVersion: string | null }> {
    const view = templateKey ? await this.get(organizationId, templateKey) : undefined;
    const pinned = view && (options.version !== undefined || view.version !== null) ? await this.snapshot(organizationId, view.key, options.version) : undefined;
    const source = pinned ?? (view?.parent ? { ...(await this.resolve(organizationId, view.key)) } : view);
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
