import { useCallback, useEffect, useState } from 'react';
import { Btn, EmptyState, Table, Tag, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { useConfirm } from './ConfirmDialog';
import { DateTime } from '../lib/dates';

type State = 'not_required' | 'pending' | 'approved' | 'rejected';
interface Decision { approver: string; approverName: string; decision: 'approved' | 'rejected'; comment: string; decidedAt: string }
export interface ApprovalObject { type: 'release' | 'baseline'; ref: string; id: string; requiresApproval: boolean; state: State; decisions: Decision[] }

/**
 * Approbation des jalons et des baselines. Les responsables exigent l'approbation ; l'assurance qualité étatique décide (décision
 * nominative et horodatée, confirmée) ; les autres lisent. L'état est toujours dit en texte.
 */
export function ApprovalsPanel({ project, canRequire, canDecide }: { project: string; canRequire: boolean; canDecide: boolean }) {
  const t = fr.approvals;
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<ApprovalObject[] | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const load = useCallback(() => { api<ApprovalObject[]>('GET', `/v1/projects/${project}/approvals`).then(setItems).catch(fail); }, [project, fail]);
  useEffect(load, [load]);

  const setRequired = async (o: ApprovalObject, required: boolean) => {
    try { await api('PUT', `/v1/projects/${project}/approvals/${o.type}/${encodeURIComponent(o.ref)}/required`, { required }); toast('success', t.saved); load(); } catch (error) { fail(error); }
  };
  const decide = async (o: ApprovalObject, decision: 'approved' | 'rejected') => {
    const ok = await confirm.ask({ title: decision === 'approved' ? t.approveTitle(o.ref) : t.rejectTitle(o.ref), body: t.decideBody, confirm: decision === 'approved' ? t.approve : t.reject });
    if (!ok) return;
    try { await api('POST', `/v1/projects/${project}/approvals/${o.type}/${encodeURIComponent(o.ref)}/decision`, { decision, comment: comments[o.id] ?? '' }); toast('success', t.decided); load(); } catch (error) { fail(error); }
  };

  if (items === null) return <p role="status">{fr.loading}</p>;
  return (
    <section className="ath-stack" aria-labelledby="approvals-title">
      {confirm.dialog}
      <h2 id="approvals-title" className="ath-section-title">{t.title}</h2>
      {items.length === 0 ? <EmptyState eyebrow={t.title} title={t.empty} /> : (
        <Table>
          <caption className="ath-table__caption">{t.title} · {project}</caption>
          <thead><tr><Th>{t.object}</Th><Th>{t.required}</Th><Th>{t.state}</Th><Th>{t.decisions}</Th><Th>{t.actions}</Th></tr></thead>
          <tbody>
            {items.map((o) => (
              <tr key={`${o.type}-${o.id}`}>
                <Td><Tag variant="ghost">{t.types[o.type]}</Tag> <span className="ath-mono">{o.ref}</span></Td>
                <Td>{o.requiresApproval ? t.yes : t.no}</Td>
                <Td><Tag variant={o.state === 'approved' ? 'solid' : o.state === 'rejected' ? 'accent' : 'default'}>{t.states[o.state]}</Tag></Td>
                <Td>
                  {o.decisions.length === 0 ? '—' : (
                    <ul>{o.decisions.map((d) => (
                      <li key={d.approver}>{d.decision === 'approved' ? t.approvedBy(d.approverName) : t.rejectedBy(d.approverName)} <span className="ath-mono"><DateTime iso={d.decidedAt} /></span>{d.comment && <> · {d.comment}</>}</li>
                    ))}</ul>
                  )}
                </Td>
                <Td>
                  <div className="ath-stack">
                    {canRequire && <Btn size="sm" variant="ghost" aria-label={`${o.requiresApproval ? t.dropRequirement : t.requireApproval} ${o.ref}`} onClick={() => void setRequired(o, !o.requiresApproval)}>{o.requiresApproval ? t.dropRequirement : t.requireApproval}</Btn>}
                    {canDecide && (
                      <>
                        <div className="ath-field">
                          <label className="ath-field__label" htmlFor={`cm-${o.id}`}>{`${t.comment} ${o.ref}`}</label>
                          <input id={`cm-${o.id}`} className="ath-input" maxLength={2000} value={comments[o.id] ?? ''} onChange={(e) => setComments({ ...comments, [o.id]: e.target.value })} />
                        </div>
                        <div className="ath-row">
                          <Btn size="sm" aria-label={`${t.approve} ${o.ref}`} onClick={() => void decide(o, 'approved')}>{t.approve}</Btn>
                          <Btn size="sm" variant="danger" aria-label={`${t.reject} ${o.ref}`} onClick={() => void decide(o, 'rejected')}>{t.reject}</Btn>
                        </div>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
