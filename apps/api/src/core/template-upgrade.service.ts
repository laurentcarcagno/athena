import type { PoolClient } from 'pg';
import { Db, type Actor } from './db';
import { DomainError, notFound, validation } from './errors';
import { compareVersions, type Criterion, type Normative } from './normative-template';
import type { TemplateService, TemplateSnapshot, TemplateTracker } from './template.service';
import { TrackerService, audit, type TrackerSpec } from './tracker.service';

export interface TrackerUpgrade {
  key: string; name: string; action: 'create' | 'update' | 'unchanged';
  /** Artefacts du tracker : tous voient leur `schema_version` évoluer si le tracker change. */
  items: number;
  fieldsAdded: Array<{ key: string; label: string; type: string; required: boolean }>;
  fieldsRelabeled: Array<{ key: string; from: string; to: string }>;
  /** Champs que le gabarit a retirés : conservés dans le projet (leurs valeurs sont des données). */
  fieldsKept: string[];
  statusesAdded: Array<{ key: string; name: string }>;
  statusesRenamed: Array<{ key: string; from: string; to: string }>;
  statusesRemoved: Array<{ key: string; name: string; items: number }>;
  transitionsAdded: string[];
}
export interface UpgradeReport {
  project: string; template: string; from: string | null; to: string;
  trackers: TrackerUpgrade[];
  rules: { added: string[]; updated: string[]; keptLocal: string[]; /** Règles retirées du gabarit, conservées dans le projet. */ retired: string[] };
  phases: { added: string[]; removed: string[]; current: string | null; nextCurrent: string | null };
  /** Éléments qui empêchent la montée (état supprimé qui porte encore des items). */
  blockers: string[];
  warnings: string[];
  /** Nombre total d'items concernés par une évolution de tracker. */
  itemsConcerned: number;
}
export interface TrackerDrift { key: string; name: string; fieldsAdded: string[]; statusesAdded: string[]; transitionsAdded: string[] }
export interface PhaseCriterion {
  label: string;
  /** `exit` : critère de sortie de la phase courante ; `entry` : critère d'entrée de la phase suivante. */
  stage: 'exit' | 'entry'; phase: string;
  manual: boolean; met: boolean; remaining: number;
  /** Critère manuel confirmé : par qui, quand, avec quelle note. */
  checkedBy?: string; checkedAt?: string; note?: string;
}
export const PHASE_DECISIONS = ['go', 'go_with_reserves', 'no_go'] as const;
export type PhaseDecision = (typeof PHASE_DECISIONS)[number];
/** Dates et décision d'une phase du projet (étude PPM § 2.3). Dates au format AAAA-MM-JJ. */
export interface PhaseRecord {
  plannedStart: string | null; plannedEnd: string | null; reviewPlannedOn: string | null; reviewHeldOn: string | null;
  decision: PhaseDecision | null; decidedBy: string | null; decidedAt: string | null; note: string;
}
export interface PhaseDates { plannedStart?: string | null; plannedEnd?: string | null; reviewPlannedOn?: string | null }
export interface PhaseHistoryEntry { phase: string; field: 'planned_end' | 'review_planned_on'; from: string | null; to: string | null; by: string; at: string }
const EMPTY_RECORD: PhaseRecord = { plannedStart: null, plannedEnd: null, reviewPlannedOn: null, reviewHeldOn: null, decision: null, decidedBy: null, decidedAt: null, note: '' };
const today = () => new Date().toISOString().slice(0, 10);

export interface PhaseCheck {
  key: string; name: string; review: string; next: string | null;
  /** Dates prévues, revue tenue et décision de la phase courante. */
  record: PhaseRecord;
  /**
   * Critères du passage : sortie de la phase courante puis entrée de la suivante. Un critère « tracker_status » est contrôlé
   * (`remaining` items à traiter) ; un critère manuel n'est rempli qu'une fois confirmé par une personne habilitée.
   */
  criteria: PhaseCriterion[];
  canAdvance: boolean;
}
export interface ProjectTemplateStatus {
  phaseCheck: PhaseCheck | null;
  templateKey: string | null; version: string | null; latest: string | null; upgradable: boolean; versions: string[];
  criticality: string | null; phase: string | null;
  /** Phases du gabarit épinglé avec leurs dates et décisions, puis celles que le gabarit a retirées (`offTemplate`). */
  phases: Array<{ key: string; name: string; review: string; offTemplate: boolean; record: PhaseRecord }>;
  /** Historique des dates prévues (ajout seul), du plus ancien au plus récent. */
  phaseHistory: PhaseHistoryEntry[];
  /** Écart du projet par rapport à la version du gabarit : ce qu'il a ajouté. */
  drift: { trackersAdded: string[]; trackers: TrackerDrift[]; total: number };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Montée de version d'un projet vers une version plus récente de son gabarit, avec rapport d'impact préalable. */
export class TemplateUpgradeService {
  constructor(private readonly db: Db, private readonly trackers: TrackerService, private readonly templates: TemplateService) {}

  private async projectRow(c: PoolClient, key: string) {
    const p = (await c.query('select id, template_key, template_version, criticality, current_phase from project where key = $1', [key])).rows[0];
    if (!p) throw notFound(`Projet ${key}`);
    return p as { id: string; template_key: string | null; template_version: string | null; criticality: string | null; current_phase: string | null };
  }

  /** Trackers du projet, sous la forme d'un gabarit (statuts, champs, transitions) et leur nombre d'items par statut. */
  private async projectTrackers(organizationId: string, projectKey: string) {
    return this.db.tx(organizationId, async (c) => {
      const keys = (await c.query('select t.key from tracker t join project p on p.id = t.project_id where p.key = $1 order by t.key', [projectKey])).rows.map((r) => r.key as string);
      const out = new Map<string, { name: string; fields: Array<{ key: string; label: string; type: string; required: boolean }>; statuses: Array<{ key: string; name: string; category: string; items: number }>; transitions: string[]; items: number }>();
      for (const key of keys) {
        const d = await this.trackers.getDefinition(c, projectKey, key);
        const counts = new Map((await c.query('select status_id, count(*)::int n from artifact where tracker_id = $1 group by status_id', [d.id])).rows.map((r) => [r.status_id as string, r.n as number]));
        out.set(key, {
          name: d.name, fields: d.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
          statuses: d.statuses.map((s) => ({ key: s.key, name: s.name, category: s.category, items: counts.get(s.id) ?? 0 })),
          transitions: d.transitions.map((t) => t.name), items: [...counts.values()].reduce((a, b) => a + b, 0),
        });
      }
      return out;
    });
  }

  /** Version du gabarit, rattachement du projet, phase et dérive (ce que le projet a ajouté au gabarit). */
  async status(organizationId: string, projectKey: string): Promise<ProjectTemplateStatus> {
    const p = await this.db.tx(organizationId, (c) => this.projectRow(c, projectKey));
    const empty = { trackersAdded: [], trackers: [], total: 0 };
    if (!p.template_key) return { phaseCheck: null, templateKey: null, version: null, latest: null, upgradable: false, versions: [], criticality: p.criticality, phase: p.current_phase, phases: [], phaseHistory: [], drift: empty };
    const versions = (await this.templates.versions(organizationId, p.template_key)).map((v) => v.version);
    const latest = versions.length ? versions[versions.length - 1]! : null;
    if (!p.template_version) return { phaseCheck: null, templateKey: p.template_key, version: null, latest, upgradable: false, versions, criticality: p.criticality, phase: p.current_phase, phases: [], phaseHistory: [], drift: empty };
    const snap = await this.templates.snapshot(organizationId, p.template_key, p.template_version);
    const records = await this.records(organizationId, p.id);
    const inTemplate = snap.normative.phases.map((x) => ({ key: x.key, name: x.name, review: x.review, offTemplate: false, record: records.get(x.key) ?? EMPTY_RECORD }));
    const offTemplate = [...records].filter(([k]) => !snap.normative.phases.some((x) => x.key === k)).map(([k, record]) => ({ key: k, name: k, review: '', offTemplate: true, record }));
    return {
      phaseCheck: await this.phaseCheck(organizationId, projectKey, snap, p.current_phase, records),
      templateKey: p.template_key, version: p.template_version, latest, upgradable: latest !== null && compareVersions(latest, p.template_version) > 0, versions,
      criticality: p.criticality, phase: p.current_phase, phases: [...inTemplate, ...offTemplate], phaseHistory: await this.phaseHistory(organizationId, p.id),
      drift: await this.drift(organizationId, projectKey, snap),
    };
  }

  /** Contrôle du passage : critères de sortie de la phase courante et critères d'entrée de la suivante (RID clos, confirmations…). */
  private async phaseCheck(organizationId: string, projectKey: string, snap: TemplateSnapshot, current: string | null, records: Map<string, PhaseRecord>): Promise<PhaseCheck | null> {
    const phases = snap.normative.phases;
    const i = phases.findIndex((x) => x.key === current);
    if (i < 0) return null;
    const phase = phases[i]!;
    const next = phases[i + 1];
    const wanted: Array<{ k: Criterion; stage: 'exit' | 'entry'; phase: string }> = [
      ...phase.exitCriteria.map((k) => ({ k, stage: 'exit' as const, phase: phase.key })),
      ...(next ? next.entryCriteria.map((k) => ({ k, stage: 'entry' as const, phase: next.key })) : []),
    ];
    const criteria = await this.db.tx(organizationId, async (c) => {
      const checks = (await c.query(
        `select x.phase, x.stage, x.label, x.note, x.checked_at, coalesce(u.display_name, u.username, x.checked_by) as who
           from phase_criterion_check x join project p on p.id = x.project_id
           left join user_account u on u.organization_id = x.organization_id and u.subject = x.checked_by
          where p.key = $1`, [projectKey])).rows as Array<{ phase: string; stage: string; label: string; note: string; checked_at: Date; who: string }>;
      const out: PhaseCriterion[] = [];
      for (const { k, stage, phase: of } of wanted) {
        if (k.kind === 'manual') {
          const done = checks.find((x) => x.phase === of && x.stage === stage && x.label === k.label);
          out.push({ label: k.label, stage, phase: of, manual: true, met: done !== undefined, remaining: done ? 0 : 1,
            ...(done ? { checkedBy: done.who, checkedAt: new Date(done.checked_at).toISOString(), note: done.note } : {}) });
          continue;
        }
        const remaining = Number((await c.query(
          `select count(*) n from artifact a join tracker t on t.id = a.tracker_id join project p on p.id = a.project_id join status s on s.id = a.status_id
           where p.key = $1 and t.key = $2 and s.key <> all($3::text[]) and ($4::text is null or a."values"->>$4 = $5)`,
          [projectKey, k.tracker, k.statuses, k.where?.field ?? null, k.where?.value ?? null])).rows[0].n);
        out.push({ label: k.label ?? `${k.tracker} : ${k.statuses.join(', ')}`, stage, phase: of, manual: false, met: remaining === 0, remaining });
      }
      return out;
    });
    return { key: phase.key, name: phase.name, review: phase.review, next: next?.key ?? null, record: records.get(phase.key) ?? EMPTY_RECORD, criteria, canAdvance: next !== undefined && criteria.every((x) => x.met) };
  }

  /** Confirme (ou annule) un critère manuel du passage en cours ; refuse un critère inconnu ou contrôlé automatiquement. */
  async checkCriterion(organizationId: string, projectKey: string, input: { stage: 'exit' | 'entry'; label: string; checked: boolean; note?: string }, actor: Actor): Promise<PhaseCheck> {
    const status = await this.status(organizationId, projectKey);
    const check = status.phaseCheck;
    if (!check) throw validation(['ce projet n’a pas de phase courante']);
    const target = check.criteria.find((x) => x.stage === input.stage && x.label === input.label);
    if (!target) throw validation([`critère inconnu pour ce passage : ${input.label}`]);
    if (!target.manual) throw validation(['ce critère est contrôlé automatiquement']);
    await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      if (input.checked) {
        await c.query(
          `insert into phase_criterion_check (organization_id, project_id, phase, stage, label, note, checked_by) values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (project_id, phase, stage, label) do update set note = excluded.note, checked_by = excluded.checked_by, checked_at = now()`,
          [organizationId, project.id, target.phase, input.stage, input.label, (input.note ?? '').trim(), actor.id]);
      } else {
        await c.query('delete from phase_criterion_check where project_id = $1 and phase = $2 and stage = $3 and label = $4', [project.id, target.phase, input.stage, input.label]);
      }
      await audit(c, organizationId, actor, input.checked ? 'project.phase_criterion.check' : 'project.phase_criterion.uncheck', `project:${projectKey}`,
        { phase: target.phase, stage: input.stage, label: input.label, note: input.note ?? '' });
    });
    return (await this.status(organizationId, projectKey)).phaseCheck!;
  }

  private async records(organizationId: string, projectId: string): Promise<Map<string, PhaseRecord>> {
    return this.db.tx(organizationId, async (c) => {
      const rows = (await c.query(
        `select x.phase, to_char(x.planned_start, 'YYYY-MM-DD') ps, to_char(x.planned_end, 'YYYY-MM-DD') pe,
                to_char(x.review_planned_on, 'YYYY-MM-DD') rp, to_char(x.review_held_on, 'YYYY-MM-DD') rh,
                x.decision, x.decided_at, x.note, coalesce(u.display_name, u.username, x.decided_by) as who
           from project_phase x left join user_account u on u.organization_id = x.organization_id and u.subject = x.decided_by
          where x.project_id = $1`, [projectId])).rows;
      return new Map(rows.map((r) => [r.phase as string, {
        plannedStart: r.ps, plannedEnd: r.pe, reviewPlannedOn: r.rp, reviewHeldOn: r.rh, decision: r.decision, decidedBy: r.decision ? r.who : null,
        decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null, note: r.note,
      } satisfies PhaseRecord]));
    });
  }

  private async phaseHistory(organizationId: string, projectId: string): Promise<PhaseHistoryEntry[]> {
    return this.db.tx(organizationId, async (c) => (await c.query(
      `select h.phase, h.field, to_char(h.old_value, 'YYYY-MM-DD') o, to_char(h.new_value, 'YYYY-MM-DD') n, h.changed_at,
              coalesce(u.display_name, u.username, h.changed_by) as who
         from project_phase_history h left join user_account u on u.organization_id = h.organization_id and u.subject = h.changed_by
        where h.project_id = $1 order by h.changed_at, h.id`, [projectId])).rows
      .map((r) => ({ phase: r.phase, field: r.field, from: r.o, to: r.n, by: r.who, at: new Date(r.changed_at).toISOString() })));
  }

  /**
   * Fixe les dates prévues d'une phase du gabarit épinglé (absent : inchangé ; null : effacé). Toute modification de `planned_end` ou de
   * `review_planned_on` ajoute une ligne à l'historique, avec son auteur.
   */
  async setPhaseDates(organizationId: string, projectKey: string, phase: string, input: PhaseDates, actor: Actor): Promise<ProjectTemplateStatus> {
    const p = await this.db.tx(organizationId, (c) => this.projectRow(c, projectKey));
    if (!p.template_key || !p.template_version) throw validation(['ce projet n’est pas rattaché à une version de gabarit']);
    const snap = await this.templates.snapshot(organizationId, p.template_key, p.template_version);
    if (!snap.normative.phases.some((x) => x.key === phase)) throw validation([`phase inconnue dans la version ${p.template_version} du gabarit : ${phase}`]);
    await this.db.tx(organizationId, async (c) => {
      const old = (await c.query(
        `select to_char(planned_start, 'YYYY-MM-DD') ps, to_char(planned_end, 'YYYY-MM-DD') pe, to_char(review_planned_on, 'YYYY-MM-DD') rp
           from project_phase where project_id = $1 and phase = $2 for update`, [p.id, phase])).rows[0] ?? { ps: null, pe: null, rp: null };
      const next = {
        ps: input.plannedStart === undefined ? old.ps : input.plannedStart,
        pe: input.plannedEnd === undefined ? old.pe : input.plannedEnd,
        rp: input.reviewPlannedOn === undefined ? old.rp : input.reviewPlannedOn,
      };
      if (next.ps && next.pe && next.pe < next.ps) throw validation(['plannedEnd : la fin prévue précède le début prévu']);
      await c.query(
        `insert into project_phase (organization_id, project_id, phase, planned_start, planned_end, review_planned_on, updated_by) values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (project_id, phase) do update set planned_start = excluded.planned_start, planned_end = excluded.planned_end,
           review_planned_on = excluded.review_planned_on, updated_by = excluded.updated_by, updated_at = now()`,
        [organizationId, p.id, phase, next.ps, next.pe, next.rp, actor.id]);
      for (const [field, from, to] of [['planned_end', old.pe, next.pe], ['review_planned_on', old.rp, next.rp]] as const) {
        if (from === to) continue;
        await c.query('insert into project_phase_history (organization_id, project_id, phase, field, old_value, new_value, changed_by) values ($1,$2,$3,$4,$5,$6,$7)',
          [organizationId, p.id, phase, field, from, to, actor.id]);
      }
      await audit(c, organizationId, actor, 'project.phase_dates', `project:${projectKey}`, { phase, ...input });
    });
    return this.status(organizationId, projectKey);
  }

  /**
   * Décision de gate sur la phase courante, puis passage à la phase suivante. `go` et `go_with_reserves` exigent les critères remplis ;
   * `go_with_reserves` et `no_go` exigent une note. `no_go` enregistre la décision sans changer de phase (`to` vaut alors `from`).
   * La décision et la date de revue tenue sont portées par la phase que l'on quitte.
   */
  async advancePhase(organizationId: string, projectKey: string, actor: Actor, input: { decision?: PhaseDecision; note?: string; heldOn?: string } = {}): Promise<{ from: string; to: string }> {
    const status = await this.status(organizationId, projectKey);
    const check = status.phaseCheck;
    if (!check) throw validation(['ce projet n’a pas de phase courante']);
    const decision = input.decision ?? 'go';
    const note = (input.note ?? '').trim();
    if (decision !== 'go' && note === '') throw validation([`note : une note est obligatoire pour la décision « ${decision} »`]);
    const advances = decision !== 'no_go';
    if (advances) {
      if (!check.next) throw validation(['la phase courante est la dernière']);
      const unmet = check.criteria.filter((x) => !x.met);
      if (unmet.length) throw new DomainError('Phase non terminée.', 'conflict', unmet.map((x) => `${x.label} (${x.remaining} restant(s))`));
    }
    await this.db.tx(organizationId, async (c) => {
      const p = await this.projectRow(c, projectKey);
      await c.query(
        `insert into project_phase (organization_id, project_id, phase, review_held_on, decision, decided_by, decided_at, note, updated_by) values ($1,$2,$3,$4,$5,$6,now(),$7,$6)
         on conflict (project_id, phase) do update set review_held_on = excluded.review_held_on, decision = excluded.decision, decided_by = excluded.decided_by,
           decided_at = excluded.decided_at, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()`,
        [organizationId, p.id, check.key, input.heldOn ?? today(), decision, actor.id, note]);
      if (advances) await c.query('update project set current_phase = $2 where key = $1', [projectKey, check.next]);
      await audit(c, organizationId, actor, advances ? 'project.phase_advance' : 'project.phase_no_go', `project:${projectKey}`, { from: check.key, to: advances ? check.next : check.key, decision, note });
    });
    return { from: check.key, to: advances ? check.next! : check.key };
  }

  /** Ce que le projet contient en plus de son gabarit : trackers, champs, états et transitions ajoutés. */
  private async drift(organizationId: string, projectKey: string, snap: TemplateSnapshot): Promise<ProjectTemplateStatus['drift']> {
    const actual = await this.projectTrackers(organizationId, projectKey);
    const byKey = new Map(snap.trackers.map((t) => [t.key, t]));
    const trackersAdded = [...actual.keys()].filter((k) => !byKey.has(k));
    const trackers: TrackerDrift[] = [];
    for (const [key, a] of actual) {
      const t = byKey.get(key);
      if (!t) continue;
      const d: TrackerDrift = {
        key, name: a.name,
        fieldsAdded: a.fields.filter((f) => !t.fields.some((x) => x.key === f.key)).map((f) => f.key),
        statusesAdded: a.statuses.filter((s) => !t.statuses.some((x) => x.key === s.key)).map((s) => s.key),
        transitionsAdded: a.transitions.filter((n) => !t.transitions.some((x) => x.name === n)),
      };
      if (d.fieldsAdded.length + d.statusesAdded.length + d.transitionsAdded.length > 0) trackers.push(d);
    }
    const total = trackersAdded.length + trackers.reduce((n, d) => n + d.fieldsAdded.length + d.statusesAdded.length + d.transitionsAdded.length, 0);
    return { trackersAdded, trackers, total };
  }

  /** Rapport d'impact : ne modifie rien. Sans version cible, la dernière version publiée. */
  async preview(organizationId: string, projectKey: string, target?: string): Promise<UpgradeReport> {
    const p = await this.db.tx(organizationId, (c) => this.projectRow(c, projectKey));
    if (!p.template_key || !p.template_version) throw validation(['ce projet n’est pas rattaché à une version de gabarit']);
    const to = await this.templates.snapshot(organizationId, p.template_key, target);
    if (compareVersions(to.version, p.template_version) <= 0) throw validation([`la version ${to.version} n’est pas postérieure à la version du projet (${p.template_version})`]);
    const from = await this.templates.snapshot(organizationId, p.template_key, p.template_version);
    const actual = await this.projectTrackers(organizationId, projectKey);
    const report: UpgradeReport = {
      project: projectKey, template: p.template_key, from: p.template_version, to: to.version, trackers: [],
      rules: { added: [], updated: [], keptLocal: [], retired: [] }, phases: { added: [], removed: [], current: p.current_phase, nextCurrent: p.current_phase },
      blockers: [], warnings: [], itemsConcerned: 0,
    };
    const fromTrackers = new Map(from.trackers.map((t) => [t.key, t]));
    for (const t of to.trackers) {
      const a = actual.get(t.key);
      if (!a) {
        report.trackers.push({ key: t.key, name: t.name, action: 'create', items: 0, fieldsAdded: t.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required ?? false })), fieldsRelabeled: [], fieldsKept: [], statusesAdded: t.statuses.map((s) => ({ key: s.key, name: s.name })), statusesRenamed: [], statusesRemoved: [], transitionsAdded: t.transitions.map((x) => x.name) });
        continue;
      }
      const old = fromTrackers.get(t.key);
      const u: TrackerUpgrade = { key: t.key, name: t.name, action: 'unchanged', items: a.items, fieldsAdded: [], fieldsRelabeled: [], fieldsKept: [], statusesAdded: [], statusesRenamed: [], statusesRemoved: [], transitionsAdded: [] };
      for (const f of t.fields) {
        const mine = a.fields.find((x) => x.key === f.key);
        if (!mine) u.fieldsAdded.push({ key: f.key, label: f.label, type: f.type, required: f.required ?? false });
        else if (mine.type !== f.type) report.warnings.push(`${t.key}.${f.key} : le type passe de ${mine.type} à ${f.type} dans le gabarit ; il n’est pas modifié (les valeurs stockées en dépendent)`);
        else if (mine.label !== f.label && old?.fields.find((x) => x.key === f.key)?.label === mine.label) u.fieldsRelabeled.push({ key: f.key, from: mine.label, to: f.label });
      }
      for (const f of old?.fields ?? []) if (!t.fields.some((x) => x.key === f.key) && a.fields.some((x) => x.key === f.key)) u.fieldsKept.push(f.key);
      for (const s of t.statuses) {
        const mine = a.statuses.find((x) => x.key === s.key);
        if (!mine) u.statusesAdded.push({ key: s.key, name: s.name });
        else if (mine.name !== s.name && old?.statuses.find((x) => x.key === s.key)?.name === mine.name) u.statusesRenamed.push({ key: s.key, from: mine.name, to: s.name });
      }
      for (const s of old?.statuses ?? []) {
        const mine = a.statuses.find((x) => x.key === s.key);
        if (mine && !t.statuses.some((x) => x.key === s.key)) {
          u.statusesRemoved.push({ key: s.key, name: mine.name, items: mine.items });
          if (mine.items > 0) report.blockers.push(`${t.key} : l’état « ${mine.name} » (${s.key}) est supprimé par le gabarit et porte ${mine.items} ticket(s) ; déplacez-les avant la montée`);
        }
      }
      u.transitionsAdded = t.transitions.filter((x) => !a.transitions.includes(x.name)).map((x) => x.name);
      if (u.fieldsAdded.length + u.fieldsRelabeled.length + u.statusesAdded.length + u.statusesRenamed.length + u.statusesRemoved.length + u.transitionsAdded.length > 0) u.action = 'update';
      if (u.action === 'update' && a.items > 0 && u.fieldsAdded.some((f) => f.required)) report.warnings.push(`${t.key} : les champs obligatoires ajoutés (${u.fieldsAdded.filter((f) => f.required).map((f) => f.key).join(', ')}) sont créés facultatifs car le tracker contient déjà des tickets`);
      report.trackers.push(u);
    }
    for (const t of from.trackers) if (!to.trackers.some((x) => x.key === t.key) && actual.has(t.key)) report.warnings.push(`${t.key} : tracker retiré du gabarit, conservé dans le projet`);
    report.itemsConcerned = report.trackers.filter((t) => t.action === 'update').reduce((n, t) => n + t.items, 0);

    const rules = await this.db.tx(organizationId, async (c) => (await c.query('select key, name, from_tracker_key, link_type_key, direction, min_count, status_filter, threshold from coverage_rule where project_id = $1', [p.id])).rows);
    const asRule = (r: Normative['rules'][number]) => ({ name: r.name, fromTracker: r.fromTracker, linkType: r.linkType, direction: r.direction, minCount: r.minCount, statuses: r.statuses, threshold: r.threshold });
    const row = (r: Record<string, unknown>) => ({ name: r.name, fromTracker: r.from_tracker_key, linkType: r.link_type_key, direction: r.direction, minCount: r.min_count, statuses: r.status_filter, threshold: r.threshold });
    for (const r of to.normative.rules) {
      const mine = rules.find((x) => x.key === r.key);
      const was = from.normative.rules.find((x) => x.key === r.key);
      if (!mine) report.rules.added.push(r.key);
      else if (same(row(mine), asRule(r))) continue;
      else if (was && same(row(mine), asRule(was))) report.rules.updated.push(r.key);
      else report.rules.keptLocal.push(r.key);
    }
    for (const r of from.normative.rules) if (!to.normative.rules.some((x) => x.key === r.key) && rules.some((x) => x.key === r.key)) report.rules.retired.push(r.key);
    report.phases.added = to.normative.phases.filter((x) => !from.normative.phases.some((y) => y.key === x.key)).map((x) => x.key);
    report.phases.removed = from.normative.phases.filter((x) => !to.normative.phases.some((y) => y.key === x.key)).map((x) => x.key);
    if (p.current_phase && !to.normative.phases.some((x) => x.key === p.current_phase)) {
      report.phases.nextCurrent = to.normative.phases[0]?.key ?? null;
      report.warnings.push(`la phase courante « ${p.current_phase} » n’existe plus dans la version ${to.version} ; le projet passe en phase « ${report.phases.nextCurrent ?? '—'} »`);
    }
    return report;
  }

  /**
   * Applique la montée : chaque tracker évolue par les évolutions de configuration habituelles (nouvelle `schema_version`,
   * événement `tracker.updated`, donc un commit de `tracker.yaml`). Bloquée tant qu'un état supprimé porte des items.
   */
  async apply(organizationId: string, projectKey: string, target: string | undefined, actor: Actor): Promise<UpgradeReport> {
    const report = await this.preview(organizationId, projectKey, target);
    if (report.blockers.length) throw new DomainError('Montée de version bloquée.', 'conflict', report.blockers);
    const to = await this.templates.snapshot(organizationId, report.template, report.to);
    const snapTracker = (key: string) => to.trackers.find((t) => t.key === key) as TemplateTracker;
    for (const u of report.trackers) {
      if (u.action === 'unchanged') continue;
      const t = snapTracker(u.key);
      if (u.action === 'create') { await this.trackers.createTracker(organizationId, { ...t, projectKey } as TrackerSpec, actor); continue; }
      for (const f of u.fieldsAdded) {
        const spec = t.fields.find((x) => x.key === f.key)!;
        await this.trackers.addField(organizationId, projectKey, u.key, { ...spec, required: spec.required && u.items === 0 }, actor);
      }
      for (const f of u.fieldsRelabeled) await this.trackers.updateField(organizationId, projectKey, u.key, f.key, { label: f.to }, actor);
      for (const s of u.statusesAdded) await this.trackers.addStatus(organizationId, projectKey, u.key, t.statuses.find((x) => x.key === s.key)!, actor);
      for (const s of u.statusesRenamed) await this.trackers.updateStatus(organizationId, projectKey, u.key, s.key, { name: s.to }, actor);
      for (const name of u.transitionsAdded) await this.trackers.addTransition(organizationId, projectKey, u.key, t.transitions.find((x) => x.name === name)!, actor);
      for (const s of u.statusesRemoved) await this.trackers.removeStatus(organizationId, projectKey, u.key, s.key, actor);
    }
    await this.db.tx(organizationId, async (c) => {
      const p = await this.projectRow(c, projectKey);
      for (const key of [...report.rules.added, ...report.rules.updated]) {
        const r = to.normative.rules.find((x) => x.key === key)!;
        await c.query(
          `insert into coverage_rule (organization_id, project_id, key, name, from_tracker_key, link_type_key, direction, min_count, status_filter, threshold)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           on conflict (project_id, key) where project_id is not null do update set name = excluded.name, from_tracker_key = excluded.from_tracker_key,
             link_type_key = excluded.link_type_key, direction = excluded.direction, min_count = excluded.min_count, status_filter = excluded.status_filter, threshold = excluded.threshold`,
          [organizationId, p.id, r.key, r.name, r.fromTracker, r.linkType, r.direction, r.minCount, r.statuses, JSON.stringify(r.threshold)],
        );
      }
      await c.query('update project set template_version = $2, current_phase = $3 where id = $1', [p.id, report.to, report.phases.nextCurrent]);
      await audit(c, organizationId, actor, 'project.template_upgrade', `project:${projectKey}`, { template: report.template, from: report.from, to: report.to });
    });
    return report;
  }
}
