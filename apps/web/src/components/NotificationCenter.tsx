import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { NotificationSettings, type NotifyEvent } from './NotificationSettings';
import { formatDateTime } from '../lib/dates';

export interface NotificationEntry {
  id: string; event: NotifyEvent; project: string; key: string; actor: string; actorName: string;
  payload: Record<string, unknown>; read: boolean; createdAt: string;
}
interface Inbox { items: NotificationEntry[]; unread: number }

const POLL_MS = 60_000;

/** Phrase d'une notification : qui, quoi, sur quel item (la clé est affichée à part, en police à chasse fixe). */
export function describe(n: NotificationEntry): string {
  const p = n.payload;
  const text = fr.notify.events;
  switch (n.event) {
    case 'transition': return text.transition(n.actorName, String(p['from'] ?? ''), String(p['to'] ?? ''));
    case 'comment': return text.comment(n.actorName);
    case 'mention': return text.mention(n.actorName);
    case 'suspect': return text.suspect(n.actorName, String(p['cause'] ?? ''));
    case 'weather': return text.weather(Number(p['days'] ?? 0));
    case 'decision': return text.decision(String(p['dueOn'] ?? ''));
    default: return text.approval(n.actorName, p);
  }
}

/** Centre de notifications de la barre supérieure : compteur de non lues, liste, lu / non lu, réglages par événement. */
export function NotificationCenter() {
  const fail = useFailure();
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<Inbox>({ items: [], unread: 0 });
  const [settings, setSettings] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    const data = await api<Inbox>('GET', '/v1/me/notifications?limit=50');
    if (data && Array.isArray(data.items)) setInbox(data);
  }, []);
  useEffect(() => {
    refresh().catch(() => undefined);
    const timer = setInterval(() => { if (!document.hidden) refresh().catch(() => undefined); }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  // Temps réel : une notification reçue par le flux SSE rafraîchit la boîte aussitôt ; l'interrogation ci-dessus reste le repli si le flux est coupé (proxy, navigateur sans EventSource).
  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const source = new EventSource('/v1/me/events');
    const onNotification = () => { refresh().catch(() => undefined); };
    source.addEventListener('notification', onNotification);
    return () => { source.removeEventListener('notification', onNotification); source.close(); };
  }, [refresh]);
  useEffect(() => { if (open) refresh().catch(() => undefined); }, [open, refresh]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);
  const mark = async (body: { ids?: string[]; all?: boolean; read: boolean }) => {
    try { await api('POST', '/v1/me/notifications/read', body); await refresh(); } catch (error) { fail(error); }
  };
  const label = inbox.unread > 0 ? fr.notify.buttonUnread(inbox.unread) : fr.notify.button;
  return (
    <div className="ath-notify" ref={root}>
      <button type="button" ref={button} className="ath-notify__button" aria-expanded={open} aria-controls="notifications" aria-haspopup="true" onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6" /><path d="M4 17h16" /><path d="M10 21h4" /></svg>
        <span className="ath-visually-hidden">{label}</span>
        {inbox.unread > 0 && <span className="ath-notify__count ath-mono" aria-hidden="true">{inbox.unread > 99 ? '99+' : inbox.unread}</span>}
      </button>
      {open && (
        <section id="notifications" className="ath-notify__panel" aria-label={fr.notify.title}>
          <header className="ath-notify__head">
            <h2 className="ath-section-title ath-notify__title">{fr.notify.title}</h2>
            <div className="ath-row">
              <Btn type="button" size="sm" variant="ghost" disabled={inbox.unread === 0} onClick={() => void mark({ all: true, read: true })}>{fr.notify.markAll}</Btn>
              <Btn type="button" size="sm" variant="ghost" aria-expanded={settings} aria-controls="notify-settings" onClick={() => setSettings(!settings)}>{fr.notify.settings}</Btn>
            </div>
          </header>
          {settings && <NotificationSettings />}
          {inbox.items.length === 0 ? <p className="ath-notify__empty">{fr.notify.empty}</p> : (
            <ul className="ath-notify__list" aria-label={fr.notify.list}>
              {inbox.items.map((n) => (
                <li key={n.id} className={n.read ? 'ath-notify__item' : 'ath-notify__item ath-notify__item--unread'}>
                  <div className="ath-notify__body">
                    <Link className="ath-link ath-mono" to={n.key ? `/p/${n.project}/a/${n.key}` : `/p/${n.project}`} onClick={() => { setOpen(false); if (!n.read) void mark({ ids: [n.id], read: true }); }}>{n.key || n.project}</Link>
                    <span>{describe(n)}</span>
                    <time className="ath-notify__time" dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
                    {!n.read && <span className="ath-visually-hidden">{fr.notify.unreadMark}</span>}
                  </div>
                  <Btn type="button" size="sm" variant="ghost" onClick={() => void mark({ ids: [n.id], read: !n.read })}>{n.read ? fr.notify.markUnread : fr.notify.markRead}</Btn>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
