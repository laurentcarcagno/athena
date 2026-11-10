import { useCallback, useEffect, useState } from 'react';
import { Btn, Tag, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { useConfirm } from './ConfirmDialog';
import { formatDateTime } from '../lib/dates';

type State = 'not_required' | 'pending' | 'approved' | 'rejected';
interface Decision { approver: string; approverName: string; decision: 'approved' | 'rejected'; comment: string; decidedAt: string }
export interface ApprovalStep {
  id: string; position: number; name: string; kind: 'review' | 'approval'; approvers: Array<{ subject: string; displayName: string }>;
  role: 'athena-qa' | null; minApprovals: number; state: 'done' | 'current' | 'waiting' | 'rejected'; decisions: Decision[];
}
export interface ItemApproval {
  configured: boolean; enabled: boolean; state: State; currentStep: number | null; steps: ApprovalStep[];
  invalidated: { at: string; version: number | null; count: number } | null; canDecide: boolean;
}

const stamp = (iso: string) => formatDateTime(iso);

/**
 * Circuit d'approbation d'un item : les étapes dans l'ordre, qui est désigné, les décisions nominatives et horodatées, l'état dit en
 * texte, et le message d'invalidation quand une modification a rouvert le circuit. Une personne désignée à l'étape courante décide ici
 * (décision confirmée). `version` relance la lecture quand l'item change.
 */
export function ApprovalPanel({ project, itemKey, version, onChanged }: { project: string; itemKey: string; version: number; onChanged?: () => void }) {
  const t = fr.itemApproval;
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<ItemApproval | null>(null);
  const [comment, setComment] = useState('');
  const load = useCallback(() => { api<ItemApproval>('GET', `/v1/projects/${project}/artifacts/${itemKey}/approval`).then(setData).catch(fail); }, [project, itemKey, fail]);
  useEffect(load, [load, version]);

  const decide = async (decision: 'approved' | 'rejected') => {
    const ok = await confirm.ask({ title: decision === 'approved' ? t.approveTitle(itemKey) : t.rejectTitle(itemKey), body: t.decideBody, confirm: decision === 'approved' ? t.approve : t.reject });
    if (!ok) return;
    try {
      setData(await api<ItemApproval>('POST', `/v1/projects/${project}/artifacts/${itemKey}/approval/decision`, { decision, comment }));
      setComment('');
      toast('success', t.decided);
      onChanged?.();
    } catch (error) { fail(error); }
  };

  if (data === null) return <p role="status">{fr.loading}</p>;
  if (!data.configured || !data.enabled) return <p>{t.none}</p>;
  const current = data.steps.find((s) => s.position === data.currentStep);
  return (
    <section className="ath-stack" aria-labelledby="item-approval-title">
      {confirm.dialog}
      <h3 id="item-approval-title" className="ath-subsection-title">{t.title}</h3>
      <p>
        {t.state} : <Tag variant={data.state === 'approved' ? 'solid' : data.state === 'rejected' ? 'accent' : 'default'}>{t.states[data.state]}</Tag>
        {current && data.state !== 'approved' && <> · {t.currentStep(current.position, current.name)}</>}
      </p>
      {data.invalidated && <p role="status" className="ath-notice">{t.invalidated(data.invalidated.count, data.invalidated.version)}</p>}
      <ol className="ath-approval-steps" aria-label={t.steps}>
        {data.steps.map((s) => (
          <li key={s.id} className="ath-approval-step">
            <p>
              <strong>{s.position}. {s.name}</strong> <Tag variant="ghost">{t.kinds[s.kind]}</Tag> <Tag variant={s.state === 'done' ? 'solid' : s.state === 'rejected' ? 'accent' : 'default'}>{t.stepStates[s.state]}</Tag>
            </p>
            <p className="ath-eyebrow">
              {t.designated} : {[...s.approvers.map((a) => a.displayName), ...(s.role ? [t.qaRole] : [])].join(', ')} · {t.minimum(s.minApprovals)}
            </p>
            {s.decisions.length > 0 && (
              <ul>{s.decisions.map((d) => (
                <li key={d.approver}>
                  {d.decision === 'approved' ? t.approvedBy(d.approverName) : t.rejectedBy(d.approverName)} <span className="ath-mono">{stamp(d.decidedAt)}</span>
                  {d.comment && <> — {d.comment}</>}
                </li>
              ))}</ul>
            )}
          </li>
        ))}
      </ol>
      {data.canDecide ? (
        <div className="ath-stack">
          <label className="ath-field__label" htmlFor="approval-comment">{t.comment}</label>
          <textarea id="approval-comment" className="ath-input" rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="ath-row">
            <Btn onClick={() => void decide('approved')}>{t.approve}</Btn>
            <Btn variant="ghost" onClick={() => void decide('rejected')}>{t.reject}</Btn>
          </div>
        </div>
      ) : data.state === 'pending' && <p className="ath-eyebrow">{t.notDesignated}</p>}
    </section>
  );
}
