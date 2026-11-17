import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { audit } from '../core/tracker.service';

/** Valeurs par défaut des réglages PPM (migration 066) : 7 h 48 par jour, instantanés hebdomadaires gardés 26 semaines. */
export const PPM_DEFAULTS = {
  workdayMinutes: 468,
  snapshotFrequency: 'weekly' as 'weekly' | 'monthly',
  snapshotWeeklyRetentionWeeks: 26,
  snapshotReviewRetentionMonths: null as number | null,
  overloadPercent: 110,
  statusNoteStaleDays: 30,
};
export type PpmSettings = typeof PPM_DEFAULTS;

/** Mise à jour partielle : seuls les champs présents changent. `snapshotReviewRetentionMonths: null` rétablit « sans limite ». */
export const PpmSettingsInput = z.object({
  workdayMinutes: z.number().int().min(1).max(1440),
  snapshotFrequency: z.enum(['weekly', 'monthly']),
  snapshotWeeklyRetentionWeeks: z.number().int().min(1).max(520),
  snapshotReviewRetentionMonths: z.number().int().min(1).max(600).nullable(),
  overloadPercent: z.number().int().min(100).max(300),
  statusNoteStaleDays: z.number().int().min(1).max(365),
}).partial();
export type PpmSettingsPatch = z.infer<typeof PpmSettingsInput>;

/** Colonne de chaque réglage, dans l'ordre d'écriture. */
const COLUMNS = [
  ['workdayMinutes', 'workday_minutes'],
  ['snapshotFrequency', 'snapshot_frequency'],
  ['snapshotWeeklyRetentionWeeks', 'snapshot_weekly_retention_weeks'],
  ['snapshotReviewRetentionMonths', 'snapshot_review_retention_months'],
  ['overloadPercent', 'overload_percent'],
  ['statusNoteStaleDays', 'status_note_stale_days'],
] as const;

/** Réglages PPM de l'organisation (durée de la journée, instantanés, seuils). */
export class PpmSettingsService {
  constructor(private readonly db: Db) {}

  async get(organizationId: string): Promise<PpmSettings> {
    const row = await this.db.tx(organizationId, async (c) => (await c.query(
      `select workday_minutes, snapshot_frequency, snapshot_weekly_retention_weeks, snapshot_review_retention_months, overload_percent, status_note_stale_days
         from organization_ppm_settings`)).rows[0]);
    if (!row) return { ...PPM_DEFAULTS };
    return {
      workdayMinutes: row.workday_minutes, snapshotFrequency: row.snapshot_frequency, snapshotWeeklyRetentionWeeks: row.snapshot_weekly_retention_weeks,
      snapshotReviewRetentionMonths: row.snapshot_review_retention_months, overloadPercent: row.overload_percent, statusNoteStaleDays: row.status_note_stale_days,
    };
  }

  async put(organizationId: string, patch: PpmSettingsPatch, actor: Actor): Promise<PpmSettings> {
    const next = { ...(await this.get(organizationId)), ...patch };
    const names = COLUMNS.map(([, column]) => column);
    const marks = COLUMNS.map((_, i) => '$' + String(i + 2));
    const updates = names.map((column) => column + ' = excluded.' + column);
    await this.db.tx(organizationId, async (c) => {
      await c.query(
        'insert into organization_ppm_settings (organization_id, ' + names.join(', ') + ', updated_by) values ($1, ' + marks.join(', ') + ', $' + String(COLUMNS.length + 2) + ') ' +
        'on conflict (organization_id) do update set ' + updates.join(', ') + ', updated_by = excluded.updated_by, updated_at = now()',
        [organizationId, ...COLUMNS.map(([key]) => next[key]), actor.id]);
      await audit(c, organizationId, actor, 'ppm.settings.update', 'ppm-settings', patch);
    });
    return next;
  }
}
