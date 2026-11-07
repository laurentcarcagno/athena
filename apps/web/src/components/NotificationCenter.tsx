import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr, getLocale } from '../i18n';

export type NotifyEvent = 'transition' | 'mention' | 'suspect' | 'comment' | 'approval';
export const NOTIFY_EVENTS: NotifyEvent[] = ['transition', 'mention', 'suspect', 'comment', 'approval'];
export interface NotificationEntry {
  id: string; event: NotifyEvent; project: string; key: string; actor: string; actorName: string;
  payload: Record<string, unknown>; read: boolean; createdAt: string;
}
interface Inbox { items: NotificationEntry[]; unread: number }
interface Digest { available: boolean; enabled: boolean; hour: number; timezone: string; locale: 'fr' | 'en' }

const browserZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

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
    default: return text.approval(n.actorName);
  }
}

/** Centre de notifications de la barre supérieure : compteur de non lues, liste, lu / non lu, réglages par événement. */
export function NotificationCenter() {
  const fail = useFailure();
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<Inbox>({ items: [], unread: 0 });
  const [prefs, setPrefs] = useState<Record<NotifyEvent, boolean> | null>(null);
  const [settings, setSettings] = useState(false);
  const [digest, setDigest] = useState<Digest | null>(null);
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
  useEffect(() => { if (open) refresh().catch(() => undefined); }, [open, refresh]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);
  useEffect(() => {
    if (!settings || prefs) return;
    api<Record<NotifyEvent, boolean>>('GET', '/v1/me/notification-prefs').then(setPrefs).catch(fail);
  }, [settings, prefs, fail]);
  useEffect(() => {
    if (!settings || digest) return;
    api<Digest>('GET', '/v1/me/notification-digest').then(setDigest).catch(fail);
  }, [settings, digest, fail]);

  const mark = async (body: { ids?: string[]; all?: boolean; read: boolean }) => {
    try { await api('POST', '/v1/me/notifications/read', body); await refresh(); } catch (error) { fail(error); }
  };
  const setPref = async (event: NotifyEvent, enabled: boolean) => {
    setPrefs((p) => (p ? { ...p, [event]: enabled } : p));
    try { await api('PUT', `/v1/me/notification-prefs/${event}`, { enabled }); } catch (error) { fail(error); setPrefs(null); }
  };

  /** Enregistre le résumé quotidien ; le fuseau est celui du navigateur, la langue celle de l'interface. */
  const saveDigest = async (change: Partial<Pick<Digest, 'enabled' | 'hour'>>) => {
    if (!digest) return;
    const next = { ...digest, ...change, timezone: browserZone(), locale: getLocale() };
    setDigest(next);
    try { await api('PUT', '/v1/me/notification-digest', { enabled: next.enabled, hour: next.hour, timezone: next.timezone, locale: next.locale }); } catch (error) { fail(error); setDigest(null); }
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
            <h2 className="ath-notify__title">{fr.notify.title}</h2>
            <div className="ath-row">
              <Btn type="button" size="sm" variant="ghost" disabled={inbox.unread === 0} onClick={() => void mark({ all: true, read: true })}>{fr.notify.markAll}</Btn>
              <Btn type="button" size="sm" variant="ghost" aria-expanded={settings} aria-controls="notify-settings" onClick={() => setSettings(!settings)}>{fr.notify.settings}</Btn>
            </div>
          </header>
          {settings && (
            <fieldset id="notify-settings" className="ath-notify__settings">
              <legend>{fr.notify.settingsLegend}</legend>
              {NOTIFY_EVENTS.map((event) => (
                <label key={event} className="ath-notify__pref">
                  <input type="checkbox" checked={prefs?.[event] ?? true} disabled={prefs === null} onChange={(e) => void setPref(event, e.target.checked)} />
                  {fr.notify.eventNames[event]}
                </label>
              ))}
            </fieldset>
          )}
          {settings && digest && (
            <fieldset className="ath-notify__settings">
              <legend>{fr.notify.digestLegend}</legend>
              {digest.available ? (
                <>
                  <label className="ath-notify__pref">
                    <input type="checkbox" checked={digest.enabled} onChange={(e) => void saveDigest({ enabled: e.target.checked })} />
                    {fr.notify.digestEnabled}
                  </label>
                  <label className="ath-notify__pref">
                    {fr.notify.digestHour(browserZone())}
                    <select className="ath-select" value={digest.hour} disabled={!digest.enabled} onChange={(e) => void saveDigest({ hour: Number(e.target.value) })}>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                    </select>
                  </label>
                </>
              ) : <p className="ath-notify__empty">{fr.notify.digestUnavailable}</p>}
            </fieldset>
          )}
          {inbox.items.length === 0 ? <p className="ath-notify__empty">{fr.notify.empty}</p> : (
            <ul className="ath-notify__list" aria-label={fr.notify.list}>
              {inbox.items.map((n) => (
                <li key={n.id} className={n.read ? 'ath-notify__item' : 'ath-notify__item ath-notify__item--unread'}>
                  <div className="ath-notify__body">
                    <Link className="ath-link ath-mono" to={`/p/${n.project}/a/${n.key}`} onClick={() => { setOpen(false); if (!n.read) void mark({ ids: [n.id], read: true }); }}>{n.key}</Link>
                    <span>{describe(n)}</span>
                    <time className="ath-notify__time" dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
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
