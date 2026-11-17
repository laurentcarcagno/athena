import { z } from 'zod';
import { Db } from '../core/db';
import { validation } from '../core/errors';
import { runAs } from '../core/request-context';
import type { Mailer } from './smtp';
import type { NotifyEvent } from './notify.service';

export const DigestInput = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  timezone: z.string().min(1).max(64),
  locale: z.enum(['fr', 'en']),
});
export type DigestInput = z.infer<typeof DigestInput>;
export interface DigestSettings extends DigestInput { /** Faux : aucun SMTP configuré (instance isolée ou résumé désactivé), le résumé ne partira pas. */ available: boolean }

export interface DigestItem { event: NotifyEvent; project: string; key: string; actorName: string; payload: Record<string, unknown> }

const MAX_ITEMS = 100;
/** Au moins cette durée entre deux résumés d'une même personne (protège d'un double envoi si l'heure est atteinte deux fois). */
const MIN_GAP_MS = 20 * 3_600_000;

const TEXT = {
  fr: {
    subject: (n: number) => (n === 1 ? 'Athena : 1 notification non lue' : `Athena : ${n} notifications non lues`),
    hello: (name: string) => `Bonjour ${name},`, intro: 'Voici vos notifications non lues depuis le dernier résumé.', more: (n: number) => `… et ${n} autre(s) dans Athena.`,
    footer: 'Vous recevez ce résumé parce que vous l’avez activé dans les réglages des notifications d’Athena.',
    event: {
      transition: (who: string, p: Record<string, unknown>) => `${who} a fait passer l’item de ${String(p['from'] ?? '')} à ${String(p['to'] ?? '')}`,
      comment: (who: string) => `${who} a commenté l’item`,
      mention: (who: string) => `${who} vous a mentionné`,
      suspect: (who: string, p: Record<string, unknown>) => `lien suspect : ${who} a modifié ${String(p['cause'] ?? '')}`,
      approval: (who: string) => `${who} a rendu une décision d’approbation`,
      weather: () => 'la météo du projet n’a pas été mise à jour depuis plusieurs jours',
    },
  },
  en: {
    subject: (n: number) => (n === 1 ? 'Athena: 1 unread notification' : `Athena: ${n} unread notifications`),
    hello: (name: string) => `Hello ${name},`, intro: 'Here are your unread notifications since the last digest.', more: (n: number) => `… and ${n} more in Athena.`,
    footer: 'You receive this digest because you turned it on in your Athena notification settings.',
    event: {
      transition: (who: string, p: Record<string, unknown>) => `${who} moved the item from ${String(p['from'] ?? '')} to ${String(p['to'] ?? '')}`,
      comment: (who: string) => `${who} commented on the item`,
      mention: (who: string) => `${who} mentioned you`,
      suspect: (who: string, p: Record<string, unknown>) => `suspect link: ${who} changed ${String(p['cause'] ?? '')}`,
      approval: (who: string) => `${who} recorded an approval decision`,
      weather: () => 'the project weather has not been updated for several days',
    },
  },
} as const;

/**
 * Corps du résumé : par projet, une ligne par notification (clé, phrase, lien canonique). Aucune valeur de champ : ni titre ni contenu,
 * seulement ce que la notification porte déjà. Au-delà de 100 lignes, le reste est résumé en un compteur.
 */
export function composeDigest(items: DigestItem[], options: { locale: 'fr' | 'en'; name: string; baseUrl: string; total?: number }): { subject: string; text: string } {
  const t = TEXT[options.locale];
  const base = options.baseUrl.replace(/\/+$/, '');
  const total = options.total ?? items.length;
  const shown = items.slice(0, MAX_ITEMS);
  const byProject = new Map<string, DigestItem[]>();
  for (const i of shown) byProject.set(i.project, [...(byProject.get(i.project) ?? []), i]);
  const lines = [t.hello(options.name), '', t.intro, ''];
  for (const [project, list] of byProject) {
    lines.push(`${project}`);
    for (const i of list) {
      const describe = t.event[i.event] as (who: string, p: Record<string, unknown>) => string;
      lines.push(`  - ${i.key ? `${i.key} : ` : ''}${describe(i.actorName, i.payload)}`);
      if (i.key) lines.push(`    ${base}/p/${encodeURIComponent(project)}/a/${encodeURIComponent(i.key)}`);
    }
    lines.push('');
  }
  if (total > shown.length) lines.push(t.more(total - shown.length), '');
  lines.push('--', t.footer, '');
  return { subject: t.subject(total), text: lines.join('\n') };
}

/** Heure locale (0 à 23) de l'instant `at` dans le fuseau `timeZone`. */
export function localHour(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(at);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
}

export const isTimeZone = (value: string): boolean => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
};

export interface DigestOptions {
  /** Absent : aucun envoi possible (SMTP non configuré ou résumé désactivé). */
  mailer?: Mailer | null;
  /** Adresse publique d'Athena, pour les liens canoniques. */
  baseUrl: string;
  available: boolean;
}

/** Résumé quotidien : un courriel par personne et par jour, à l'heure qu'elle a choisie, regroupant ses notifications non lues. */
export class DigestService {
  constructor(private readonly db: Db, private readonly options: DigestOptions) {}

  async settings(organizationId: string, subject: string): Promise<DigestSettings> {
    return this.db.tx(organizationId, async (c) => {
      const r = (await c.query('select enabled, hour, timezone, locale from notification_digest where subject = $1', [subject])).rows[0];
      return { enabled: r?.enabled ?? false, hour: r?.hour ?? 8, timezone: r?.timezone ?? 'UTC', locale: r?.locale ?? 'fr', available: this.options.available };
    });
  }

  async setSettings(organizationId: string, subject: string, input: DigestInput): Promise<DigestSettings> {
    if (!isTimeZone(input.timezone)) throw validation([`fuseau horaire inconnu : ${input.timezone}`]);
    await this.db.tx(organizationId, async (c) => {
      await c.query(
        `insert into notification_digest (organization_id, subject, enabled, hour, timezone, locale) values ($1,$2,$3,$4,$5,$6)
         on conflict (organization_id, subject) do update set enabled = excluded.enabled, hour = excluded.hour, timezone = excluded.timezone, locale = excluded.locale`,
        [organizationId, subject, input.enabled, input.hour, input.timezone, input.locale]);
    });
    return { ...input, available: this.options.available };
  }

  /** Envoie les résumés dus de l'organisation à l'instant `now` ; retourne le nombre de courriels envoyés. */
  async runDue(organizationId: string, now = new Date(), log?: (message: string) => void): Promise<number> {
    const mailer = this.options.mailer;
    if (!mailer) return 0;
    const people = await this.db.tx(organizationId, async (c) => (await c.query(
      `select d.subject, d.hour, d.timezone, d.locale, d.last_sent_at, u.email, coalesce(u.display_name, d.subject) as name
       from notification_digest d join user_account u on u.organization_id = d.organization_id and u.subject = d.subject
       where d.enabled and u.email is not null order by d.subject`)).rows, { system: true });
    let sent = 0;
    for (const p of people) {
      if (localHour(now, p.timezone as string) !== p.hour) continue;
      if (p.last_sent_at && now.getTime() - (p.last_sent_at as Date).getTime() < MIN_GAP_MS) continue;
      try {
        // Lecture sous les droits de la personne : ce que la base ne lui montre plus n'entre pas dans son courriel.
        const items = await runAs(p.subject as string, () => this.db.tx(organizationId, async (c) => (await c.query(
          `select n.id, n.event, p.key as project, coalesce(a.key, '') as key, coalesce(u.display_name, n.actor) as actor_name, n.payload
           from notification n join project p on p.id = n.project_id left join artifact a on a.id = n.artifact_id
           left join user_account u on u.organization_id = n.organization_id and u.subject = n.actor
           where n.recipient = $1 and n.read_at is null and n.digested_at is null order by n.created_at, n.id`, [p.subject])).rows));
        if (items.length > 0) {
          const mail = composeDigest(
            items.map((i) => ({ event: i.event, project: i.project, key: i.key, actorName: i.actor_name, payload: i.payload as Record<string, unknown> })),
            { locale: p.locale, name: p.name, baseUrl: this.options.baseUrl });
          await mailer.send({ to: p.email as string, subject: mail.subject, text: mail.text });
          await this.db.tx(organizationId, (c) => c.query('update notification set digested_at = $2 where id = any($1::uuid[])', [items.map((i) => i.id), now]), { system: true });
          sent++;
        }
        await this.db.tx(organizationId, (c) => c.query('update notification_digest set last_sent_at = $2 where subject = $1', [p.subject, now]), { system: true });
      } catch (error) {
        log?.(`résumé: échec pour ${String(p.subject)} : ${(error as Error).message}`); // réessayé au cycle suivant tant que l'heure choisie dure
      }
    }
    return sent;
  }
}
