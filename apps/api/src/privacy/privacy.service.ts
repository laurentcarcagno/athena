import { createHash } from 'node:crypto';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';

type Query = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;

/** Rubriques de l'export : table, requête restreinte à la personne, colonnes exportées. Les corps des commentaires sont exportés, jamais ceux des autres. */
const SECTIONS: Array<{ key: string; sql: string }> = [
  { key: 'profile', sql: 'select username, display_name, email, updated_at from user_account where subject = $1' },
  { key: 'pins', sql: 'select kind, project_key, ref, favorite, position from user_pin where subject = $1' },
  { key: 'subscriptions', sql: 'select scope, artifact_id, tracker_id, filter_id from subscription where subject = $1' },
  { key: 'notifications', sql: 'select event, created_at, read_at from notification where recipient = $1 order by created_at desc limit 1000' },
  { key: 'notificationPreferences', sql: 'select event, enabled from notification_pref where subject = $1' },
  { key: 'projectMemberships', sql: 'select p.key project, m.role from project_member m join project p on p.id = m.project_id where m.subject = $1' },
  { key: 'teamMemberships', sql: 'select t.key team, m.role from team_member m join team t on t.id = m.team_id where m.subject = $1' },
  { key: 'worklogs', sql: 'select work_day, minutes from worklog where subject = $1 order by work_day desc limit 5000' },
  { key: 'absences', sql: 'select from_day, to_day from absence where subject = $1' },
  { key: 'comments', sql: 'select a.key artifact, c.created_at, c.body from comment c join artifact a on a.id = c.artifact_id where c.author = $1 order by c.created_at desc limit 5000' },
  { key: 'createdArtifacts', sql: 'select key, created_at from artifact where created_by = $1 order by created_at desc limit 5000' },
  { key: 'accessTokens', sql: 'select name, scope, token_prefix, created_at, expires_at, last_used_at, revoked_at from personal_access_token where subject = $1' },
  { key: 'auditTrail', sql: 'select action, target, at from audit_log where actor = $1 order by at desc limit 5000' },
];

/** Tables dont les lignes d'une personne sont supprimées à l'effacement (préférences et état personnel, sans valeur de pièce comptable ou d'historique). */
const PERSONAL_TABLES: Array<{ table: string; column: string }> = [
  { table: 'user_pin', column: 'subject' }, { table: 'subscription', column: 'subject' }, { table: 'notification', column: 'recipient' },
  { table: 'notification_pref', column: 'subject' }, { table: 'notification_digest', column: 'subject' }, { table: 'web_session', column: 'subject' },
];

export const pseudonym = (subject: string) => `effacé-${createHash('sha256').update(subject).digest('hex').slice(0, 10)}`;

/**
 * Conformité RGPD (plan § 10). Export : toutes les données rattachées à la personne. Effacement : pseudonymisation du profil (nom, courriel, identifiant de connexion),
 * suppression des préférences, abonnements, notifications et sessions, révocation des jetons. L'identifiant opaque du compte reste sur les pièces d'activité
 * (commentaires, journal d'audit chaîné, temps passé) : il ne permet plus de remonter à une personne une fois son compte supprimé de l'annuaire.
 * L'historique Git (auteur et courriel des commits) n'est pas réécrit : il est immuable par conception ; la pseudonymisation de cet historique est documentée dans docs/admin/RGPD.md.
 */
export class PrivacyService {
  constructor(private readonly db: Db) {}

  async export(organizationId: string, subject: string): Promise<Record<string, unknown>> {
    return this.db.tx(organizationId, async (c) => {
      const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), subject };
      for (const s of SECTIONS) out[s.key] = (await (c.query as Query)(s.sql, [subject])).rows;
      return out;
    }, { system: true });
  }

  async erase(organizationId: string, subject: string, actor: Actor): Promise<{ pseudonym: string; deleted: Record<string, number>; tokensRevoked: number }> {
    if (subject === actor.id) throw validation(['Un administrateur ne peut pas effacer son propre compte.']);
    return this.db.tx(organizationId, async (c) => {
      const exists = (await c.query('select 1 from user_account where subject = $1', [subject])).rowCount;
      if (!exists) throw notFound('Utilisateur');
      const alias = pseudonym(subject);
      await c.query("update user_account set username = $2, display_name = 'Utilisateur effacé', email = null, updated_at = now() where subject = $1", [subject, alias]);
      const deleted: Record<string, number> = {};
      for (const t of PERSONAL_TABLES) deleted[t.table] = (await c.query(`delete from ${t.table} where ${t.column} = $1`, [subject])).rowCount ?? 0;
      const tokens = await c.query("update personal_access_token set revoked_at = coalesce(revoked_at, now()), display_name = null, email = null, username = $2 where subject = $1", [subject, alias]);
      await audit(c, organizationId, actor, 'privacy.erase', `user:${alias}`, { deleted, tokensRevoked: tokens.rowCount ?? 0 });
      return { pseudonym: alias, deleted, tokensRevoked: tokens.rowCount ?? 0 };
    }, { system: true });
  }
}
