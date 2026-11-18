import { Db } from './db';

export interface PlatformStatus {
  /** Historique GitLab : événements d'artefact pas encore écrits après cinq minutes, le plus ancien, et projets dont la dernière réconciliation a échoué. */
  history: { pending: number; oldestMinutes: number | null; reconcileErrors: number };
  /** Webhooks sortants : livraisons définitivement en échec sur sept jours, et livraisons en attente depuis plus de cinq minutes. */
  webhooks: { failed: number; late: number };
  /** Plugins installés et désactivés. */
  plugins: { installed: number; disabled: number };
  /** Jetons d'accès personnels qui expirent dans les quatorze jours. */
  tokens: { expiring: number };
}

/** État de la plateforme pour l'administrateur (carte « État de la plateforme », lot 27) : des comptes, jamais de contenu. */
export class PlatformStatusService {
  constructor(private readonly db: Db) {}

  async status(organizationId: string): Promise<PlatformStatus> {
    return this.db.tx(organizationId, async (c) => {
      const one = async (sql: string) => (await c.query(sql)).rows[0] as Record<string, number | null>;
      const history = await one(
        `select count(*)::int pending, (extract(epoch from now() - min(created_at)) / 60)::int oldest from outbox_event
          where history_synced_at is null and type like 'artifact.%' and created_at < now() - interval '5 minutes' and created_at > now() - interval '30 days'`);
      const errors = await one(`select count(*)::int n from history_sync_cursor where last_result = 'failed'`);
      const hooks = await one(
        `select count(*) filter (where status = 'failed' and created_at > now() - interval '7 days')::int failed,
                count(*) filter (where status = 'pending' and next_attempt_at < now() - interval '5 minutes')::int late from webhook_delivery`);
      const plugins = await one(`select count(*)::int installed, count(*) filter (where not enabled)::int disabled from plugin_installation`);
      const tokens = await one(`select count(*)::int n from personal_access_token where revoked_at is null and expires_at > now() and expires_at < now() + interval '14 days'`);
      return {
        history: { pending: history['pending'] ?? 0, oldestMinutes: history['oldest'] ?? null, reconcileErrors: errors['n'] ?? 0 },
        webhooks: { failed: hooks['failed'] ?? 0, late: hooks['late'] ?? 0 },
        plugins: { installed: plugins['installed'] ?? 0, disabled: plugins['disabled'] ?? 0 },
        tokens: { expiring: tokens['n'] ?? 0 },
      };
    });
  }
}
