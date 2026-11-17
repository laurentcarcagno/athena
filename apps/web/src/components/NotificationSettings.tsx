import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr, getLocale } from '../i18n';
import { Checkbox, Select } from '@athena/ui';

export type NotifyEvent = 'transition' | 'mention' | 'suspect' | 'comment' | 'approval';
export const NOTIFY_EVENTS: NotifyEvent[] = ['transition', 'mention', 'suspect', 'comment', 'approval'];
interface Digest { available: boolean; enabled: boolean; hour: number; timezone: string; locale: 'fr' | 'en' }

const browserZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

/**
 * Réglages de notification de la personne : événements à notifier et résumé quotidien. Partagés par le centre de
 * notifications (panneau) et le Profil (T-0123) ; chargés à l'affichage, enregistrés à chaque changement.
 */
export function NotificationSettings({ id = 'notify-settings' }: { id?: string }) {
  const fail = useFailure();
  const [prefs, setPrefs] = useState<Record<NotifyEvent, boolean> | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);

  useEffect(() => {
    if (prefs) return;
    // Une réponse tardive (double chargement en développement) n'écrase jamais un choix déjà fait : seule la première compte.
    api<Record<NotifyEvent, boolean>>('GET', '/v1/me/notification-prefs').then((loaded) => setPrefs((current) => current ?? loaded)).catch(fail);
  }, [prefs, fail]);
  useEffect(() => {
    if (digest) return;
    api<Digest>('GET', '/v1/me/notification-digest').then((loaded) => setDigest((current) => current ?? loaded)).catch(fail);
  }, [digest, fail]);

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

  return (
    <>
      <fieldset id={id} className="ath-notify__settings">
        <legend>{fr.notify.settingsLegend}</legend>
        {/* Aucune valeur n'est inventée pendant le chargement : l'état affiché est toujours celui du serveur. */}
        {prefs === null ? <p role="status">{fr.loading}</p> : NOTIFY_EVENTS.map((event) => (
          <label key={event} className="ath-notify__pref">
            <Checkbox checked={prefs[event]} onChange={(e) => void setPref(event, e.target.checked)} />
            {fr.notify.eventNames[event]}
          </label>
        ))}
      </fieldset>
      {digest && (
        <fieldset className="ath-notify__settings">
          <legend>{fr.notify.digestLegend}</legend>
          {digest.available ? (
            <>
              <label className="ath-notify__pref">
                <Checkbox checked={digest.enabled} onChange={(e) => void saveDigest({ enabled: e.target.checked })} />
                {fr.notify.digestEnabled}
              </label>
              <label className="ath-notify__pref">
                {fr.notify.digestHour(browserZone())}
                <Select value={digest.hour} disabled={!digest.enabled} onChange={(e) => void saveDigest({ hour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </Select>
              </label>
            </>
          ) : <p className="ath-notify__empty">{fr.notify.digestUnavailable}</p>}
        </fieldset>
      )}
    </>
  );
}
