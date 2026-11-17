import { Db, type Actor } from '../core/db';
import { notFound } from '../core/errors';
import type { CapacityService } from './capacity.service';
import type { FinanceService } from './finance.service';
import type { GateRow } from './governance.service';
import type { SnapshotService } from './snapshot.service';

export type AlertKind = 'review_late' | 'critical_persistent' | 'budget_exceeded' | 'budget_overrun' | 'overload';
export interface Alert {
  kind: AlertKind; project: string | null; team: string | null;
  /** Depuis quand la cause existe (date AAAA-MM-JJ), quand elle est connue. */
  since: string | null;
  /** Mesure de la cause (jours de retard, montant, taux de saturation) pour le libellé. */
  value: number;
}

const DAY = 86_400_000;

/**
 * Centre d'alertes (lot 24, B38) : les alertes sont **calculées à la lecture** à partir des mêmes sources que les vues (gates, instantanés, finances, capacité). Une alerte
 * s'ouvre dès que sa cause existe et se résout seule quand la cause disparaît : il n'y a rien à acquitter ni à nettoyer. Chaque source n'est lue que si le lecteur y a droit.
 */
export class AlertService {
  constructor(
    private readonly db: Db,
    private readonly gates: (organizationId: string, portfolioKey: string) => Promise<GateRow[]>,
    private readonly snapshots: Pick<SnapshotService, 'list' | 'get'>,
    private readonly finance: Pick<FinanceService, 'project'>,
    private readonly capacity: Pick<CapacityService, 'view'>,
  ) {}

  async alerts(organizationId: string, portfolioKey: string, actor: Actor, now: Date = new Date()): Promise<Alert[]> {
    const projects = await this.db.tx(organizationId, async (c) => {
      const f = (await c.query('select id from portfolio where key = $1', [portfolioKey])).rows[0];
      if (!f) throw notFound(`Portefeuille ${portfolioKey}`);
      return (await c.query("select p.key from portfolio_project x join project p on p.id = x.project_id where x.portfolio_id = $1 and x.kind = 'delivery' order by p.key", [f.id])).rows.map((r) => r.key as string);
    });
    const today = now.toISOString().split('T')[0]!;
    const out: Alert[] = [];

    // revue prévue dépassée et non tenue
    for (const g of await this.gates(organizationId, portfolioKey).catch(() => [])) {
      if (g.reviewPlannedOn && g.reviewPlannedOn < today && !g.reviewHeldOn) {
        out.push({ kind: 'review_late', project: g.project, team: null, since: g.reviewPlannedOn, value: Math.round((now.getTime() - Date.parse(`${g.reviewPlannedOn}T00:00:00Z`)) / DAY) });
      }
    }

    // critique depuis deux instantanés consécutifs
    const snaps = await this.snapshots.list(organizationId, portfolioKey, 2).catch(() => []);
    if (snaps.length === 2) {
      const [last, before] = await Promise.all([this.snapshots.get(organizationId, portfolioKey, snaps[0]!.id), this.snapshots.get(organizationId, portfolioKey, snaps[1]!.id)]);
      for (const l of last.lines) {
        if (l.health === 'critical' && before.lines.find((x) => x.key === l.key)?.health === 'critical') out.push({ kind: 'critical_persistent', project: l.key, team: null, since: before.takenAt.split('T')[0]!, value: 2 });
      }
    }

    // dépassement budgétaire (finance lisible seulement des rôles autorisés)
    for (const p of projects) {
      const f = await this.finance.project(organizationId, p, actor, now).catch(() => null);
      for (const a of f?.alerts ?? []) out.push({ kind: a.kind === 'exceeded' ? 'budget_exceeded' : 'budget_overrun', project: p, team: null, since: null, value: a.excess });
    }

    // surcharge d'équipe sur les trois prochains mois
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0)).toISOString().split('T')[0]!;
    const cap = await this.capacity.view(organizationId, actor, { from: today, to, granularity: 'month' }).catch(() => null);
    for (const b of cap?.bottlenecks ?? []) if (b.saturationPercent > cap!.overloadPercent) out.push({ kind: 'overload', project: null, team: b.team, since: null, value: b.saturationPercent });

    // les plus anciennes d'abord ; sans date, à la suite
    return out.sort((a, b) => (a.since ?? '9999').localeCompare(b.since ?? '9999') || a.kind.localeCompare(b.kind) || (a.project ?? a.team ?? '').localeCompare(b.project ?? b.team ?? ''));
  }
}
