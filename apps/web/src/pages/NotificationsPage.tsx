import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn, EmptyState, PageHeader } from '@athena/ui';
import { api } from '../api';
import { describe, type NotificationEntry } from '../components/NotificationCenter';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDateTime } from '../lib/dates';

/** Toutes les notifications de la personne `/notifications` (T-0123) : lues et non lues, avec accès aux réglages du Profil. */
export function NotificationsPage() {
  const fail = useFailure();
  const [items, setItems] = useState<NotificationEntry[] | null>(null);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    const data = await api<{ items: NotificationEntry[]; unread: number }>('GET', '/v1/me/notifications?limit=200');
    setItems(Array.isArray(data.items) ? data.items : []);
    setUnread(data.unread ?? 0);
  }, []);
  useEffect(() => { load().catch((e) => { setItems([]); fail(e); }); }, [load, fail]);
  const mark = async (body: { ids?: string[]; all?: boolean; read: boolean }) => {
    try { await api('POST', '/v1/me/notifications/read', body); await load(); } catch (error) { fail(error); }
  };
  return (
    <>
      <PageHeader eyebrow={fr.profile.eyebrow} title={fr.notify.title}
        actions={<><Btn size="sm" variant="ghost" disabled={unread === 0} onClick={() => void mark({ all: true, read: true })}>{fr.notify.markAll}</Btn><Link className="ath-btn ath-btn--ghost" to="/profil">{fr.notify.settings}</Link></>} />
      {items === null ? <p role="status">{fr.loading}</p> : items.length === 0 ? <EmptyState eyebrow={fr.notify.title} title={fr.notify.empty} /> : (
        <ul className="ath-notify__list" aria-label={fr.notify.list}>
          {items.map((n) => (
            <li key={n.id} className={n.read ? 'ath-notify__item' : 'ath-notify__item ath-notify__item--unread'}>
              <div className="ath-notify__body">
                <Link className="ath-link ath-mono" to={`/p/${n.project}/a/${n.key}`} onClick={() => { if (!n.read) void mark({ ids: [n.id], read: true }); }}>{n.key}</Link>
                <span>{describe(n)}</span>
                <time className="ath-notify__time" dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
                {!n.read && <span className="ath-visually-hidden">{fr.notify.unreadMark}</span>}
              </div>
              <Btn type="button" size="sm" variant="ghost" onClick={() => void mark({ ids: [n.id], read: !n.read })}>{n.read ? fr.notify.markUnread : fr.notify.markRead}</Btn>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
