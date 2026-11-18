import { Observable } from 'rxjs';
import { Db } from '../core/db';
import { forbidden } from '../core/errors';

export interface StreamEvent { type: 'notification' | 'unread' | 'heartbeat'; data: Record<string, unknown> }

/**
 * Flux temps réel (SSE) des notifications de la personne connectée (plan § 3.1 et 9.4). PostgreSQL reste la seule source : le flux relit les nouvelles notifications à
 * intervalle court (3 s) depuis un curseur, ce qui fonctionne identiquement avec une ou plusieurs instances d'API, sans bus de messages. Un battement toutes les 25 s tient la
 * connexion ouverte à travers les proxys. Trois flux simultanés au plus par personne (un onglet de plus ne doit pas saturer l'API).
 */
export class EventStreamService {
  private readonly open = new Map<string, number>();
  constructor(
    private readonly db: Db,
    private readonly options: { intervalMs?: number; heartbeatMs?: number; maxPerUser?: number } = {},
  ) {}

  connections(subject: string): number { return this.open.get(subject) ?? 0; }

  stream(organizationId: string, subject: string): Observable<StreamEvent> {
    const intervalMs = this.options.intervalMs ?? 3000;
    const heartbeatMs = this.options.heartbeatMs ?? 25_000;
    return new Observable<StreamEvent>((subscriber) => {
      if (this.connections(subject) >= (this.options.maxPerUser ?? 3)) { subscriber.error(forbidden('Trop de flux ouverts pour ce compte.')); return undefined; }
      this.open.set(subject, this.connections(subject) + 1);
      // Curseur en texte PostgreSQL (microsecondes) : une `Date` JavaScript tronque à la milliseconde et ferait rejouer la dernière notification à chaque passage.
      let cursor: string | null = null;
      let busy = false;
      let closed = false;
      let lastBeat = Date.now();

      const poll = async () => {
        if (busy || closed) return;
        busy = true;
        try {
          const rows = await this.db.tx(organizationId, async (c) => {
            if (cursor === null) cursor = String((await c.query('select now()::text as t')).rows[0].t); // ouverture : seules les notifications à venir comptent
            return (await c.query(
              'select id, event, created_at, created_at::text as ts from notification where recipient = $1 and created_at > $2::timestamptz order by created_at limit 50', [subject, cursor])).rows;
          }, { system: true });
          if (rows.length > 0) {
            cursor = String(rows[rows.length - 1].ts);
            for (const r of rows) subscriber.next({ type: 'notification', data: { id: r.id, event: r.event, createdAt: new Date(r.created_at).toISOString() } });
            const unread = await this.db.tx(organizationId, async (c) => Number((await c.query('select count(*)::int n from notification where recipient = $1 and read_at is null', [subject])).rows[0].n), { system: true });
            subscriber.next({ type: 'unread', data: { count: unread } });
            lastBeat = Date.now();
          } else if (Date.now() - lastBeat >= heartbeatMs) {
            subscriber.next({ type: 'heartbeat', data: {} });
            lastBeat = Date.now();
          }
        } catch { /* lecture impossible un instant : le prochain passage réessaie, le flux reste ouvert */ } finally { busy = false; }
      };
      const timer = setInterval(() => { void poll(); }, intervalMs);
      void poll();
      return () => {
        closed = true;
        clearInterval(timer);
        const left = this.connections(subject) - 1;
        if (left > 0) this.open.set(subject, left); else this.open.delete(subject);
      };
    });
  }
}
