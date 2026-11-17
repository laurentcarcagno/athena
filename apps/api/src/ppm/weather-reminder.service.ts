import { Db } from '../core/db';
import { PpmSettingsService } from './settings.service';

/**
 * Rappel de météo (lot 18, B25) : chaque chef d'un projet actif sans météo depuis `statusNoteStaleDays` jours reçoit une notification
 * « weather ». Une seule par période : on ne relance pas tant qu'aucune météo n'est écrite et que la dernière relance a moins de N jours.
 * Le réglage de notification par événement du chef de projet est respecté (absent : activé).
 */
export class WeatherReminderService {
  constructor(private readonly db: Db, private readonly settings: Pick<PpmSettingsService, 'get'>) {}

  /** Émet les rappels dus ; retourne le nombre de notifications créées. `now` sert aux tests. */
  async run(organizationId: string, now: Date = new Date()): Promise<number> {
    const days = (await this.settings.get(organizationId)).statusNoteStaleDays;
    return this.db.tx(organizationId, async (c) => {
      const result = await c.query(
        `with due as (
           select p.id project_id, p.key, m.subject, greatest(coalesce(n.last_note, p.created_at), coalesce(r.last_reminder, '-infinity')) as ref
             from project p
             join project_member m on m.project_id = p.id and m.role = 'manager'
             left join project_lifecycle_state s on s.organization_id = p.organization_id and s.key = p.lifecycle_state
             left join lateral (select max(written_at) last_note from project_status_note x where x.project_id = p.id) n on true
             left join lateral (select max(created_at) last_reminder from notification y where y.project_id = p.id and y.recipient = m.subject and y.event = 'weather') r on true
            where coalesce(s.category, case when p.lifecycle_state in ('in_progress', 'starting', 'closing') then 'active' end) = 'active'
              and not exists (select 1 from notification_pref f where f.subject = m.subject and f.event = 'weather' and f.enabled = false)
         )
         insert into notification (organization_id, recipient, event, project_id, actor, payload)
         select $1, subject, 'weather', project_id, '', jsonb_build_object('days', $2::int)
           from due where ref <= $3::timestamptz - make_interval(days => $2::int)`,
        [organizationId, days, now.toISOString()]);
      return result.rowCount ?? 0;
    });
  }
}
