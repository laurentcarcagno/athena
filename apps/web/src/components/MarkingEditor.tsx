import { useCallback, useEffect, useState } from 'react';
import { Btn, Tag, useToast } from '@athena/ui';
import { api, type Artifact } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { useConfirm } from './ConfirmDialog';

type Marking = NonNullable<Artifact['exportControl']>;
const OPTIONS: Array<Marking | ''> = ['', 'ITAR', 'EAR', 'dual_use'];

/**
 * Marquage de contrôle export d'un item : visible de tous ceux qui peuvent lire l'item, modifiable par les responsables seulement,
 * avec confirmation (le marquage restreint la lecture, les exports et les webhooks) ; chaque changement est audité côté API.
 */
export function MarkingEditor({ project, itemKey, value, canEdit, onChanged }: { project: string; itemKey: string; value: Marking | undefined; canEdit: boolean; onChanged: () => void | Promise<void> }) {
  const t = fr.marking;
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [choice, setChoice] = useState<Marking | ''>(value ?? '');
  const current = value ?? '';
  const apply = async () => {
    const next = choice === '' ? null : choice;
    const ok = await confirm.ask(next === null
      ? { title: t.confirmClear(itemKey), body: t.confirmClearBody, confirm: t.set }
      : { title: t.confirmTitle(itemKey, t.labels[next]!), body: t.confirmBody, confirm: t.set });
    if (!ok) return;
    try { await api('PUT', `/v1/projects/${project}/artifacts/${itemKey}/marking`, { exportControl: next }); toast('success', t.applied); await onChanged(); } catch (error) { fail(error); }
  };
  return (
    <section className="ath-toolbar" aria-label={t.title}>
      {confirm.dialog}
      <span className="ath-eyebrow">{t.title}</span>
      {value ? <Tag variant="accent">{t.labels[value]}</Tag> : <Tag variant="ghost">{t.none}</Tag>}
      {canEdit ? (
        <>
          <div className="ath-field">
            <label className="ath-field__label" htmlFor={`marking-${itemKey}`}>{t.current}</label>
            <select id={`marking-${itemKey}`} className="ath-select" value={choice} onChange={(e) => setChoice(e.target.value as Marking | '')}>
              {OPTIONS.map((o) => <option key={o || 'none'} value={o}>{o === '' ? t.none : t.labels[o]}</option>)}
            </select>
          </div>
          <Btn size="sm" disabled={choice === current} onClick={() => void apply()}>{t.set}</Btn>
        </>
      ) : <span className="ath-eyebrow">{t.managersOnly}</span>}
    </section>
  );
}

interface Member { subject: string; username: string; displayName: string }
interface UserEntry { subject: string; username: string; displayName: string }

/** Ayants droit du marquage de contrôle export d'un projet : seuls ces comptes lisent les items marqués. */
export function ExportControlMembers({ project }: { project: string }) {
  const t = fr.marking;
  const fail = useFailure();
  const toast = useToast();
  const [data, setData] = useState<{ members: Member[]; marked: number } | null>(null);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [pick, setPick] = useState('');
  const load = useCallback(() => { api<{ members: Member[]; marked: number }>('GET', `/v1/projects/${project}/export-control`).then(setData).catch(fail); }, [project, fail]);
  useEffect(() => { load(); api<UserEntry[]>('GET', '/v1/users').then(setUsers).catch(() => setUsers([])); }, [load]);
  const save = async (members: string[]) => {
    try { await api('PUT', `/v1/projects/${project}/export-control`, { members }); toast('success', t.saved); setPick(''); load(); } catch (error) { fail(error); }
  };
  if (!data) return <p role="status">{fr.loading}</p>;
  const subjects = data.members.map((m) => m.subject);
  return (
    <section className="ath-stack" aria-labelledby="ec-title">
      <h2 id="ec-title" className="ath-section-title">{t.membersTitle}</h2>
      <p className="ath-eyebrow">{t.membersHelp} {t.markedCount(data.marked)}.</p>
      {data.members.length === 0 ? <p>{t.noMembers}</p> : (
        <ul className="ath-stack" aria-label={t.membersTitle}>
          {data.members.map((m) => (
            <li key={m.subject} className="ath-row"><span>{m.displayName}</span> <span className="ath-mono">{m.username}</span>
              <Btn size="sm" variant="ghost" aria-label={`${t.remove} ${m.username}`} disabled={data.marked > 0 && data.members.length === 1} title={data.marked > 0 && data.members.length === 1 ? t.lastWithMarked : undefined}
                onClick={() => void save(subjects.filter((s) => s !== m.subject))}>{t.remove}</Btn></li>
          ))}
        </ul>
      )}
      <div className="ath-toolbar">
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="ec-add">{t.addMember}</label>
          <select id="ec-add" className="ath-select" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="" />{users.filter((u) => !subjects.includes(u.subject)).map((u) => <option key={u.subject} value={u.subject}>{u.displayName} ({u.username})</option>)}
          </select>
        </div>
        <Btn disabled={!pick} onClick={() => void save([...subjects, pick])}>{t.add}</Btn>
      </div>
    </section>
  );
}
