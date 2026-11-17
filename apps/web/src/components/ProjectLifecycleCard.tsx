import { useCallback, useEffect, useState } from 'react';
import { Btn, Card, Field, Tag } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDay } from '../lib/dates';

interface View {
  state: { key: string; name: string; category: string };
  next: Array<{ to: string; name: string; category: string; permitted: boolean; reasonRequired: boolean }>;
  history: Array<{ from: string | null; to: string; reason: string; by: string; at: string }>;
}

/** État du projet dans son cycle de vie, transitions permises à l'utilisateur (motif obligatoire pour annuler) et historique. */
export function ProjectLifecycleCard({ project }: { project: string }) {
  const t = fr.lifecycle;
  const fail = useFailure();
  const [view, setView] = useState<View | null>(null);
  const [pending, setPending] = useState<View['next'][number] | null>(null);
  const [reason, setReason] = useState('');
  const load = useCallback(() => { api<View>('GET', `/v1/projects/${project}/lifecycle`).then((v) => setView(Array.isArray(v?.next) ? v : null)).catch(() => setView(null)); }, [project]);
  useEffect(load, [load]);
  if (!view) return null;

  const go = async (to: string, why: string) => {
    try { setView(await api<View>('POST', `/v1/projects/${project}/lifecycle/transition`, { to, reason: why })); setPending(null); setReason(''); } catch (error) { fail(error); }
  };
  const allowed = view.next.filter((n) => n.permitted);
  return (
    <Card title={t.cardTitle} meta={<Tag>{view.state.name}</Tag>}>
      <div className="ath-stack">
        {allowed.length > 0 && !pending && (
          <div className="ath-toolbar" role="group" aria-label={t.moveTo}>
            {allowed.map((n) => <Btn key={n.to} type="button" variant="ghost" onClick={() => (n.reasonRequired ? setPending(n) : void go(n.to, ''))}>{n.name}</Btn>)}
          </div>
        )}
        {pending && (
          <form className="ath-stack" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void go(pending.to, reason); }}>
            <Field label={t.reasonFor(pending.name)} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            <div className="ath-toolbar"><Btn type="submit" variant="danger" disabled={!reason.trim()}>{t.moveConfirm(pending.name)}</Btn><Btn type="button" variant="ghost" onClick={() => { setPending(null); setReason(''); }}>{t.cancel}</Btn></div>
          </form>
        )}
        {view.history.length > 0 && (
          <ol className="ath-stack" aria-label={t.history}>
            {view.history.map((h) => (
              <li key={h.at + h.to}>
                <time dateTime={h.at}>{formatDay(h.at, true)}</time> · {h.from ? `${h.from} → ` : ''}{h.to}{h.reason ? ` : ${h.reason}` : ''}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
