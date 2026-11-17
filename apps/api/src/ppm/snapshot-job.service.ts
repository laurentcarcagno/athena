import { Db, type Actor } from '../core/db';
import type { PpmSettingsService } from './settings.service';
import type { SnapshotService } from './snapshot.service';

/** Identité du traitement planifié : voit tous les projets (un instantané périodique fige tout le portefeuille). */
export const SYSTEM_ACTOR: Actor = { id: 'system:snapshots', roles: ['athena-admin'] };

/**
 * Jobs `instantanes` et `retention` (lot 20, B32) : à chaque passage (toutes les heures), prend l'instantané périodique de la période en cours pour chaque
 * portefeuille (hebdomadaire ou mensuel selon le réglage de l'organisation) et purge ce qui dépasse la rétention. Rejouable : un instantané
 * de période déjà prise n'est pas dupliqué, une purge repassée ne supprime rien de plus.
 */
export class SnapshotJobService {
  constructor(private readonly db: Db, private readonly settings: Pick<PpmSettingsService, 'get'>, private readonly snapshots: Pick<SnapshotService, 'take' | 'purge'>) {}

  async run(organizationId: string, now: Date = new Date()): Promise<{ taken: number; purged: number }> {
    const cfg = await this.settings.get(organizationId);
    const keys = await this.db.tx(organizationId, async (c) => (await c.query('select key from portfolio order by key')).rows.map((r) => r.key as string), { system: true });
    let taken = 0;
    for (const key of keys) {
      const s = await this.snapshots.take(organizationId, key, { kind: cfg.snapshotFrequency === 'monthly' ? 'monthly' : 'weekly', at: now }, SYSTEM_ACTOR);
      if (s.created) taken += 1;
    }
    const purged = await this.snapshots.purge(organizationId, { weeks: cfg.snapshotWeeklyRetentionWeeks, reviewMonths: cfg.snapshotReviewRetentionMonths }, SYSTEM_ACTOR, now);
    return { taken, purged };
  }
}
