import { useCallback, useEffect, useState } from 'react';
import { Btn } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

export interface SubscriptionEntry { id: string; scope: 'item' | 'tracker' | 'view'; ref: string; label: string }

/** Suit (ou ne suit plus) un item, un tracker ou une vue enregistrée : les événements correspondants arrivent dans le centre de notifications. */
export function SubscribeToggle({ project, scope, target, size = 'sm' }: { project: string; scope: SubscriptionEntry['scope']; target: string; size?: 'sm' | 'md' }) {
  const fail = useFailure();
  const [entry, setEntry] = useState<SubscriptionEntry | null | undefined>(undefined);
  const load = useCallback(async () => {
    const list = await api<SubscriptionEntry[]>('GET', `/v1/projects/${project}/subscriptions`);
    setEntry((Array.isArray(list) ? list : []).find((s) => s.scope === scope && s.ref === target) ?? null);
  }, [project, scope, target]);
  useEffect(() => { setEntry(undefined); load().catch(() => setEntry(null)); }, [load]);
  if (entry === undefined) return null;
  const toggle = async () => {
    try {
      if (entry) { await api('DELETE', `/v1/subscriptions/${entry.id}`); setEntry(null); } // sans confirmation : réversible (un clic pour suivre de nouveau)
      else setEntry(await api<SubscriptionEntry>('POST', `/v1/projects/${project}/subscriptions`, { scope, ref: target }));
    } catch (error) { fail(error); }
  };
  return (
    <Btn type="button" variant="ghost" size={size} aria-pressed={entry !== null} onClick={() => void toggle()}>
      {entry ? fr.notify.unfollow : fr.notify.follow}
    </Btn>
  );
}
