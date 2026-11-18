import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';

export const CriterionInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{1,29}$/), label: z.string().trim().min(1).max(100), weight: z.number().gt(0).max(1000),
  scaleMin: z.number().finite(), scaleMax: z.number().finite(), direction: z.enum(['higher', 'lower']),
}).refine((c) => c.scaleMax > c.scaleMin, { message: 'scaleMax doit dépasser scaleMin', path: ['scaleMax'] });
export const ModelInput = z.object({ criteria: z.array(CriterionInput).min(1).max(12) });
export const ScoreInput = z.object({ ticket: z.string().trim().min(1).max(60), criterion: z.string().regex(/^[a-z][a-z0-9_-]{1,29}$/), value: z.number().finite() });

export interface ScoringCriterion { key: string; label: string; weight: number; scaleMin: number; scaleMax: number; direction: 'higher' | 'lower' }
export interface ScoringModel { id: string; version: number; criteria: ScoringCriterion[]; createdAt: string }
export interface RankedRequest {
  key: string; project: string; title: string;
  /** Score de 0 à 100 sur les critères renseignés ; nul sans aucune note. */
  score: number | null;
  /** Part du poids total des critères qui sont renseignés ; en dessous de 70 % la demande est « incomplète ». */
  completeness: number; incomplete: boolean;
  /** Contribution de chaque critère noté à la somme pondérée (points de score). */
  contributions: Array<{ criterion: string; points: number }>;
  converted: 'converted' | 'refused' | null;
  /** Jours entre la création de la demande et la décision (conversion ou refus) ; null tant qu'elle n'est pas décidée. */
  decisionDays: number | null;
}

/** Score pondéré normalisé : Σ (poids × valeur normalisée) / Σ poids des critères renseignés. Valeur normalisée = (v − min) / (max − min), inversée pour « plus c'est bas, mieux c'est ». */
export function scoreOf(criteria: readonly ScoringCriterion[], values: ReadonlyMap<string, number>): { score: number | null; completeness: number; contributions: Array<{ criterion: string; points: number }> } {
  const total = criteria.reduce((n, c) => n + c.weight, 0);
  const scored = criteria.filter((c) => values.has(c.key));
  const weight = scored.reduce((n, c) => n + c.weight, 0);
  if (scored.length === 0 || total === 0) return { score: null, completeness: 0, contributions: [] };
  const contributions = scored.map((c) => {
    const raw = (Math.min(Math.max(values.get(c.key)!, c.scaleMin), c.scaleMax) - c.scaleMin) / (c.scaleMax - c.scaleMin);
    return { criterion: c.key, points: Math.round(((c.direction === 'lower' ? 1 - raw : raw) * c.weight / weight) * 10000) / 100 };
  });
  return { score: Math.round(contributions.reduce((n, x) => n + x.points, 0) * 100) / 100, completeness: Math.round((weight / total) * 100), contributions };
}

/**
 * Priorisation des demandes (lot 25, B41) : modèle de scoring versionné par portefeuille ; changer les poids crée une nouvelle version, les notes de l'ancienne restent lisibles.
 * Un critère non noté est exclu du calcul et la demande affiche sa complétude (« incomplète » sous 70 %).
 */
export class ScoringService {
  constructor(private readonly db: Db) {}

  private async portfolio(c: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }, key: string) {
    const f = (await c.query('select id from portfolio where key = $1', [key])).rows[0];
    if (!f) throw notFound(`Portefeuille ${key}`);
    return f.id as string;
  }

  /** Modèle d'une version donnée (par défaut la dernière), nul s'il n'existe pas. */
  async model(organizationId: string, portfolioKey: string, version?: number): Promise<ScoringModel | null> {
    return this.db.tx(organizationId, async (c) => {
      const id = await this.portfolio(c, portfolioKey);
      const m = (await c.query('select id, version, created_at from scoring_model where portfolio_id = $1 and ($2::int is null or version = $2) order by version desc limit 1', [id, version ?? null])).rows[0];
      if (!m) return null;
      const criteria = (await c.query('select key, label, weight::float w, scale_min::float mn, scale_max::float mx, direction from scoring_criterion where model_id = $1 order by label', [m.id])).rows
        .map((r) => ({ key: r.key, label: r.label, weight: r.w, scaleMin: r.mn, scaleMax: r.mx, direction: r.direction })) as ScoringCriterion[];
      return { id: m.id, version: m.version, criteria, createdAt: new Date(m.created_at).toISOString() };
    });
  }

  /** Crée une nouvelle version du modèle (à chaque changement de critères ou de poids). */
  async createModel(organizationId: string, portfolioKey: string, input: z.infer<typeof ModelInput>, actor: Actor): Promise<ScoringModel> {
    const keys = input.criteria.map((c) => c.key);
    if (new Set(keys).size !== keys.length) throw validation(['criteria : clé en double']);
    const version = await this.db.tx(organizationId, async (c) => {
      const id = await this.portfolio(c, portfolioKey);
      const v = Number((await c.query('select coalesce(max(version), 0) v from scoring_model where portfolio_id = $1', [id])).rows[0].v) + 1;
      const m = (await c.query('insert into scoring_model (organization_id, portfolio_id, version, created_by) values ($1,$2,$3,$4) returning id', [organizationId, id, v, actor.id])).rows[0];
      for (const k of input.criteria) await c.query('insert into scoring_criterion (organization_id, model_id, key, label, weight, scale_min, scale_max, direction) values ($1,$2,$3,$4,$5,$6,$7,$8)', [organizationId, m.id, k.key, k.label, k.weight, k.scaleMin, k.scaleMax, k.direction]);
      await audit(c, organizationId, actor, 'scoring.model', `portfolio:${portfolioKey}`, { version: v, criteria: keys });
      return v;
    });
    return (await this.model(organizationId, portfolioKey, version))!;
  }

  /** Note une demande sur un critère du modèle (dernière version, ou celle demandée). La valeur reste dans l'échelle du critère. */
  async score(organizationId: string, portfolioKey: string, input: z.infer<typeof ScoreInput>, actor: Actor, version?: number): Promise<void> {
    const model = await this.model(organizationId, portfolioKey, version);
    if (!model) throw validation(['ce portefeuille n’a pas de modèle de scoring']);
    const crit = model.criteria.find((x) => x.key === input.criterion);
    if (!crit) throw validation([`critère inconnu : ${input.criterion}`]);
    if (input.value < crit.scaleMin || input.value > crit.scaleMax) throw validation([`value : entre ${crit.scaleMin} et ${crit.scaleMax}`]);
    await this.db.tx(organizationId, async (c) => {
      const t = (await c.query(
        `select a.id from project p join artifact a on a.id = resolve_artifact(p.id, $1) join tracker t on t.id = a.tracker_id where p.key = $2 and t.type_key = 'request'`, [input.ticket, input.ticket.split('-')[0]])).rows[0];
      if (!t) throw notFound(`Demande ${input.ticket}`);
      await c.query(
        `insert into score (organization_id, model_id, target_artifact_id, criterion, value, scored_by) values ($1,$2,$3,$4,$5,$6)
         on conflict (model_id, target_artifact_id, criterion) do update set value = excluded.value, scored_by = excluded.scored_by, scored_at = now()`, [organizationId, model.id, t.id, input.criterion, input.value, actor.id]);
      await audit(c, organizationId, actor, 'scoring.score', `request:${input.ticket}`, { criterion: input.criterion, value: input.value, version: model.version });
    });
  }

  /** Classement des demandes du portefeuille (tickets de type « request » de ses projets) pour une version du modèle : du meilleur score au moins bon, les demandes non notées à la fin. */
  async ranking(organizationId: string, portfolioKey: string, version?: number): Promise<{ model: ScoringModel | null; requests: RankedRequest[] }> {
    const model = await this.model(organizationId, portfolioKey, version);
    if (!model) return { model: null, requests: [] };
    const rows = await this.db.tx(organizationId, async (c) => {
      const f = await this.portfolio(c, portfolioKey);
      const reqs = (await c.query(
        `select a.id, a.key, p.key project, coalesce(a."values" ->> (select f.key from field_definition f where f.tracker_id = a.tracker_id and f.semantic_role = 'title'), a.key) title, rc.outcome, case when rc.decided_at is null then null else greatest(0, floor(extract(epoch from rc.decided_at - a.created_at) / 86400))::int end decision_days
           from portfolio_project x join project p on p.id = x.project_id join artifact a on a.project_id = p.id join tracker t on t.id = a.tracker_id and t.type_key = 'request'
           left join request_conversion rc on rc.artifact_id = a.id where x.portfolio_id = $1`, [f])).rows;
      const scores = (await c.query('select target_artifact_id id, criterion, value::float v from score where model_id = $1 and target_artifact_id = any($2::uuid[])', [model.id, reqs.map((r) => r.id)])).rows;
      return { reqs, scores };
    });
    const requests = rows.reqs.map((r): RankedRequest => {
      const values = new Map(rows.scores.filter((s) => s.id === r.id).map((s) => [s.criterion as string, s.v as number]));
      const sc = scoreOf(model.criteria, values);
      return { key: r.key, project: r.project, title: r.title, score: sc.score, completeness: sc.completeness, incomplete: sc.completeness < 70, contributions: sc.contributions, converted: r.outcome, decisionDays: r.decision_days ?? null };
    });
    requests.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.key.localeCompare(b.key));
    return { model, requests };
  }
}

