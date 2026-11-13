import { z } from 'zod';
import { compile } from '../atql/compile';
import { AtqlError } from '../atql/parser';
import type { SearchService } from '../atql/search.service';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { LinkService } from '../core/link.service';
import { audit } from '../core/tracker.service';

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('comment'), body: z.string().min(1).max(2000) }),
  z.object({ type: z.literal('transition'), name: z.string().min(1).max(200) }),
  z.object({ type: z.literal('update'), values: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])) }),
]);
export type Action = z.infer<typeof ActionSchema>;

const TRIGGERS = ['artifact.created', 'artifact.updated', 'artifact.transitioned', 'comment.created', 'code.linked'] as const;
const RuleSchema = z.object({
  name: z.string().min(1).max(200),
  trigger: z.enum([...TRIGGERS, 'schedule']),
  /** Pour `schedule` : période en minutes (5 à 10080). */
  everyMinutes: z.number().int().min(5).max(10_080).optional(),
  condition: z.string().max(1000).default(''),
  actions: z.array(ActionSchema).min(1).max(10),
}).refine((r) => r.trigger !== 'schedule' || (r.everyMinutes !== undefined && r.condition.trim() !== ''), { message: 'une règle planifiée exige everyMinutes et une condition ATQL' });

export const LIMITS = { maxDepth: 3, runsPerArtifactPerHour: 20 };
const SYSTEM = /^automation:([0-9a-f-]{36}):(\d+)$/;

export interface RuleView {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  condition: string;
  actions: Action[];
}

interface PendingEvent {
  id: string;
  type: string;
  payload: { key?: string; actor?: string };
  project_key: string | null;
}

/**
 * Moteur d'automatisation « quand / si / alors ».
 * Sécurité : les actions s'exécutent sous une identité `automation:<règle>:<profondeur>` au rôle minimal
 * (le workflow reste appliqué) ; garde anti-boucle par profondeur, par règle d'origine et par quota horaire.
 */
export class AutomationService {
  constructor(
    private readonly db: Db,
    private readonly artifacts: ArtifactService,
    private readonly links: LinkService,
    private readonly search: SearchService,
  ) {}

  async createRule(organizationId: string, projectKey: string, input: unknown, actor: Actor): Promise<string> {
    const parsed = RuleSchema.safeParse(input);
    if (!parsed.success) throw validation(parsed.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`));
    if (parsed.data.condition) {
      try { compile(parsed.data.condition, { currentUser: 'x' }); } catch (e) {
        if (e instanceof AtqlError) throw validation([`condition : ${e.message}`]);
        throw e;
      }
    }
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const id = (
        await c.query(
          'insert into automation_rule (organization_id, project_id, name, trigger_type, condition, actions, created_by, schedule_minutes) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
          [organizationId, project.id, parsed.data.name, parsed.data.trigger, parsed.data.condition, JSON.stringify(parsed.data.actions), actor.id, parsed.data.trigger === 'schedule' ? parsed.data.everyMinutes : null],
        )
      ).rows[0].id as string;
      await audit(c, organizationId, actor, 'automation.create', `automation:${id}`, { name: parsed.data.name });
      return id;
    });
  }

  async setEnabled(organizationId: string, ruleId: string, enabled: boolean, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query('update automation_rule set enabled = $2 where id = $1', [ruleId, enabled]);
      if (result.rowCount === 0) throw notFound('Règle');
      await audit(c, organizationId, actor, enabled ? 'automation.enable' : 'automation.disable', `automation:${ruleId}`);
    });
  }

  /** Clé du projet d'une règle (contrôle de droits des routes qui ne portent que l'identifiant de la règle). */
  async projectOf(organizationId: string, ruleId: string): Promise<string> {
    const row = (await this.db.tx(organizationId, (c) => c.query('select p.key from automation_rule r join project p on p.id = r.project_id where r.id::text = $1', [ruleId]))).rows[0];
    if (!row) throw notFound('Règle');
    return row.key as string;
  }

  async list(organizationId: string, projectKey: string): Promise<RuleView[]> {
    return this.db.tx(organizationId, async (c) =>
      (
        await c.query('select r.id, r.name, r.enabled, r.trigger_type, r.condition, r.actions from automation_rule r join project p on p.id = r.project_id where p.key = $1 order by r.created_at', [projectKey])
      ).rows.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, trigger: r.trigger_type, condition: r.condition, actions: r.actions })),
    );
  }

  async runs(organizationId: string, ruleId: string) {
    return this.db.tx(organizationId, async (c) =>
      (await c.query('select artifact_key as "artifactKey", status, detail, at from automation_run where rule_id = $1 order by at, id', [ruleId])).rows,
    );
  }

  /** Traite les événements en attente de l'organisation. Retourne le nombre d'exécutions réussies. */
  async process(organizationId: string, batch = 100): Promise<number> {
    const events = await this.db.tx(organizationId, async (c) =>
      (
        await c.query(
          `select o.id, o.type, o.payload, p.key as project_key from outbox_event o
           left join artifact a on a.id = o.aggregate_id left join project p on p.id = a.project_id
           where o.automation_processed_at is null and o.type = any($1) order by o.created_at, o.id limit $2`,
          [[...TRIGGERS], batch],
        )
      ).rows as PendingEvent[],
    );
    let done = 0;
    for (const event of events) {
      done += await this.processEvent(organizationId, event);
      await this.db.tx(organizationId, (c) => c.query('update outbox_event set automation_processed_at = now() where id = $1', [event.id]));
    }
    // Les événements d'autres types sont simplement marqués pour ne pas être relus.
    await this.db.tx(organizationId, (c) => c.query('update outbox_event set automation_processed_at = now() where automation_processed_at is null and not (type = any($1))', [[...TRIGGERS]]));
    return done;
  }

  /** Quota d'artefacts traités par exécution d'une règle planifiée. */
  static readonly SCHEDULE_BATCH = 100;

  /**
   * Exécute les règles planifiées échues : la condition ATQL désigne les artefacts à traiter (au plus
   * SCHEDULE_BATCH par passage). La date d'exécution est posée avant le traitement (pas de double exécution).
   */
  async runDue(organizationId: string): Promise<number> {
    const due = await this.db.tx(organizationId, async (c) =>
      (
        await c.query(
          `update automation_rule r set last_run_at = now() from project p
           where p.id = r.project_id and r.enabled and r.trigger_type = 'schedule'
             and (r.last_run_at is null or r.last_run_at + make_interval(mins => r.schedule_minutes) <= now())
           returning r.id, r.condition, r.actions, p.key as project_key`,
        )
      ).rows as Array<{ id: string; condition: string; actions: Action[]; project_key: string }>,
    );
    let done = 0;
    for (const rule of due) {
      const actor: Actor = { id: `automation:${rule.id}:1`, roles: ['athena-user'] };
      const hits = await this.search.search(organizationId, rule.project_key, rule.condition, actor.id, AutomationService.SCHEDULE_BATCH, 0).catch(() => null);
      if (!hits) continue;
      for (const hit of hits.hits) {
        const recent = await this.db.tx(organizationId, async (c) =>
          Number((await c.query("select count(*) n from automation_run where rule_id = $1 and artifact_key = $2 and status = 'done' and at > now() - interval '1 hour'", [rule.id, hit.key])).rows[0].n),
        );
        let status: 'done' | 'failed' | 'skipped' = 'done';
        let detail = '';
        if (recent >= LIMITS.runsPerArtifactPerHour) { status = 'skipped'; detail = 'quota horaire atteint'; }
        else {
          try { for (const action of rule.actions) await this.apply(organizationId, rule.project_key, hit.key, action, actor); } catch (error) { status = 'failed'; detail = (error as Error).message.slice(0, 300); }
        }
        await this.db.tx(organizationId, (c) =>
          c.query('insert into automation_run (organization_id, rule_id, event_id, artifact_key, status, detail) values ($1,$2,gen_random_uuid(),$3,$4,$5)', [organizationId, rule.id, hit.key, status, detail]),
        );
        if (status === 'done') done++;
      }
    }
    return done;
  }

  private async processEvent(org: string, event: PendingEvent): Promise<number> {
    const key = event.payload.key;
    if (!event.project_key || !key) return 0;
    const origin = SYSTEM.exec(event.payload.actor ?? '');
    const depth = origin ? Number(origin[2]) : 0;
    if (depth >= LIMITS.maxDepth) return 0; // garde anti-boucle : chaîne trop profonde
    const rules = await this.db.tx(org, async (c) =>
      (
        await c.query(
          `select r.id, r.name, r.condition, r.actions from automation_rule r join project p on p.id = r.project_id
           where p.key = $1 and r.enabled and r.trigger_type = $2 order by r.created_at`,
          [event.project_key, event.type],
        )
      ).rows as Array<{ id: string; name: string; condition: string; actions: Action[] }>,
    );
    let done = 0;
    for (const rule of rules) {
      if (origin && origin[1] === rule.id) continue; // une règle ne se redéclenche pas elle-même
      const outcome = await this.runRule(org, event, key, rule, depth);
      if (outcome === 'done') done++;
    }
    return done;
  }

  private async runRule(org: string, event: PendingEvent, key: string, rule: { id: string; condition: string; actions: Action[] }, depth: number): Promise<'done' | 'skipped' | 'failed'> {
    const record = (status: 'done' | 'skipped' | 'failed', detail = '') =>
      this.db.tx(org, (c) =>
        c.query('insert into automation_run (organization_id, rule_id, event_id, artifact_key, status, detail) values ($1,$2,$3,$4,$5,$6) on conflict do nothing', [org, rule.id, event.id, key, status, detail.slice(0, 300)]),
      ).then(() => status);

    const recent = await this.db.tx(org, async (c) =>
      Number((await c.query("select count(*) n from automation_run where rule_id = $1 and artifact_key = $2 and status = 'done' and at > now() - interval '1 hour'", [rule.id, key])).rows[0].n),
    );
    if (recent >= LIMITS.runsPerArtifactPerHour) return record('skipped', 'quota horaire atteint');

    const actor: Actor = { id: `automation:${rule.id}:${depth + 1}`, roles: ['athena-user'] };
    try {
      if (rule.condition) {
        const hit = await this.search.search(org, event.project_key!, `key = "${key}" AND (${rule.condition})`, actor.id, 1, 0);
        if (hit.total === 0) return record('skipped', 'condition non satisfaite');
      }
      for (const action of rule.actions) await this.apply(org, event.project_key!, key, action, actor);
      return record('done');
    } catch (error) {
      return record('failed', (error as Error).message);
    }
  }

  private async apply(org: string, project: string, key: string, action: Action, actor: Actor): Promise<void> {
    if (action.type === 'comment') {
      await this.links.addComment(org, project, key, action.body, actor);
      return;
    }
    const current = await this.artifacts.get(org, project, key);
    if (action.type === 'transition') await this.artifacts.transition(org, project, key, action.name, current.version, actor);
    else await this.artifacts.update(org, project, key, action.values, current.version, actor);
  }
}
