import { useCallback, useEffect, useState } from 'react';
import { Btn, Checkbox, Select, useToast } from '@athena/ui';
import { api } from '../api';
import { useBusy, useFailure } from '../hooks';
import { fr } from '../i18n';

interface User { subject: string; username: string; displayName: string }
interface Step { name: string; kind: 'review' | 'approval'; approvers: string[]; role: boolean; minApprovals: number }
interface Flow { enabled: boolean; configured: boolean; steps: Array<{ name: string; kind: 'review' | 'approval'; approvers: Array<{ subject: string }>; role: 'athena-qa' | null; minApprovals: number }> }

const blank = (): Step => ({ name: '', kind: 'review', approvers: [], role: false, minApprovals: 1 });

/** Circuit d'approbation d'un tracker : étapes ordonnées, personnes désignées ou rôle assurance qualité, nombre de décisions requises. */
export function ApprovalFlowEditor({ project, tracker }: { project: string; tracker: string }) {
  const t = fr.itemApproval;
  const fail = useFailure();
  const toast = useToast();
  const { busy, guard } = useBusy();
  const [users, setUsers] = useState<User[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const base = `/v1/projects/${project}/trackers/${tracker}/approval-flow`;
  const load = useCallback(async () => {
    const [flow, people] = await Promise.all([api<Flow>('GET', base), api<User[]>('GET', '/v1/users')]);
    setUsers(Array.isArray(people) ? people : []);
    setEnabled(flow.configured ? flow.enabled : true);
    setSteps(flow.steps.map((s) => ({ name: s.name, kind: s.kind, approvers: s.approvers.map((a) => a.subject), role: s.role !== null, minApprovals: s.minApprovals })));
  }, [base]);
  useEffect(() => { load().catch(fail); }, [load, fail]);

  const patch = (i: number, change: Partial<Step>) => setSteps(steps.map((s, k) => (k === i ? { ...s, ...change } : s)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= steps.length) return; const next = [...steps]; [next[i], next[j]] = [next[j]!, next[i]!]; setSteps(next); };
  const save = () => guard(async () => {
    try {
      await api('PUT', base, { enabled, steps: steps.map((s) => ({ name: s.name, kind: s.kind, approvers: s.approvers, role: s.role ? 'athena-qa' : null, minApprovals: s.minApprovals })) });
      toast('success', t.flowSaved);
      await load();
    } catch (error) { fail(error); }
  });
  const valid = steps.length > 0 && steps.every((s) => s.name.trim() !== '' && (s.approvers.length > 0 || s.role) && (s.role || s.minApprovals <= s.approvers.length));

  return (
    <div className="ath-stack">
      <p className="ath-eyebrow">{t.flowHelp}</p>
      <label className="ath-notify__pref"><Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{t.flowEnabled}</label>
      <ol className="ath-approval-steps" aria-label={t.steps}>
        {steps.map((s, i) => (
          <li key={i} className="ath-approval-step">
            <div className="ath-stack">
              <label className="ath-field__label" htmlFor={`step-name-${i}`}>{t.stepName(i + 1)}</label>
              <input id={`step-name-${i}`} className="ath-input" value={s.name} maxLength={120} onChange={(e) => patch(i, { name: e.target.value })} />
              <label className="ath-field__label" htmlFor={`step-kind-${i}`}>{t.stepKind(i + 1)}</label>
              <Select id={`step-kind-${i}`} value={s.kind} onChange={(e) => patch(i, { kind: e.target.value as Step['kind'] })}>
                <option value="review">{t.kinds.review}</option>
                <option value="approval">{t.kinds.approval}</option>
              </Select>
              <label className="ath-field__label" htmlFor={`step-people-${i}`}>{t.stepPeople(i + 1)}</label>
              <Select id={`step-people-${i}`} multiple size={Math.min(6, Math.max(3, users.length))} value={s.approvers}
                onChange={(e) => patch(i, { approvers: [...e.target.selectedOptions].map((o) => o.value) })}>
                {users.map((u) => <option key={u.subject} value={u.subject}>{u.displayName} ({u.username})</option>)}
              </Select>
              <label className="ath-notify__pref"><Checkbox checked={s.role} onChange={(e) => patch(i, { role: e.target.checked })} />{t.stepQa(i + 1)}</label>
              <label className="ath-field__label" htmlFor={`step-min-${i}`}>{t.stepMin(i + 1)}</label>
              <input id={`step-min-${i}`} className="ath-input" type="number" min={1} max={20} value={s.minApprovals} onChange={(e) => patch(i, { minApprovals: Math.max(1, Number(e.target.value) || 1) })} />
              <div className="ath-row">
                <Btn size="sm" variant="ghost" disabled={i === 0} aria-label={t.moveUp(i + 1)} onClick={() => move(i, -1)}>{fr.rail.moveUp}</Btn>
                <Btn size="sm" variant="ghost" disabled={i === steps.length - 1} aria-label={t.moveDown(i + 1)} onClick={() => move(i, 1)}>{fr.rail.moveDown}</Btn>
                <Btn size="sm" variant="ghost" aria-label={t.removeStep(i + 1)} onClick={() => setSteps(steps.filter((_, k) => k !== i))}>{t.remove}</Btn> {/* sans confirmation : réversible, rien n'est enregistré avant « Enregistrer » */}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="ath-row">
        <Btn variant="ghost" onClick={() => setSteps([...steps, blank()])}>{t.addStep}</Btn>
        <Btn loading={busy} disabled={!valid} onClick={() => void save()}>{t.saveFlow}</Btn>
      </div>
      <p className="ath-eyebrow">{t.flowWarning}</p>
    </div>
  );
}
