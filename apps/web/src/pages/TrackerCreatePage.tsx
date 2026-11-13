import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Btn, PageHeader, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { TemplatePicker, type TrackerTemplateEntry } from '../components/TrackerTemplateForm';
import { AccessNotice } from '../components/AccessNotice';
import { TrackerBuilder, emptyTracker, trackerProblems, type DraftTracker } from '../components/TrackerBuilder';
import { useBusy, useFailure } from '../hooks';
import { fr } from '../i18n';
import { forSave } from '../lib/layout';

/** Création d'un tracker dans un projet, à partir de zéro ou d'un template de tracker que l'on peut modifier avant création. */
export function TrackerCreatePage({ session }: { session: Session }) {
  const { project } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fail = useFailure();
  const { busy, guard } = useBusy();
  const admin = (session.user?.roles ?? []).some((r) => r === 'athena-admin' || r === 'athena-pm');
  const [templates, setTemplates] = useState<TrackerTemplateEntry[]>([]);
  const [draft, setDraft] = useState<DraftTracker>(emptyTracker());
  useEffect(() => { if (admin) api<TrackerTemplateEntry[]>('GET', '/v1/tracker-templates').then(setTemplates).catch(fail); }, [admin, fail]);
  if (!admin) return <><PageHeader eyebrow={fr.builder.newTracker} title={fr.builder.addTracker} /><AccessNotice title={fr.denied.trackerCreate} help={fr.denied.ask} back={{ to: `/p/${project}/trackers`, label: fr.denied.backTrackers }} /></>;
  const problems = trackerProblems(draft);
  const submit = (event: FormEvent) => { event.preventDefault(); void guard(() => submitRun()); };
  const submitRun = async () => {
    try {
      await api('POST', `/v1/projects/${project}/trackers`, { key: draft.key, name: draft.name, ...(draft.typeKey ? { typeKey: draft.typeKey } : {}), fields: draft.fields, statuses: draft.statuses, transitions: draft.transitions, ...(draft.layout ? { layout: forSave(draft.layout, draft.fields) } : {}) });
      toast('success', fr.builder.trackerCreated(draft.key));
      navigate(`/p/${project}/parametres/trackers/${draft.key}`);
    } catch (error) { fail(error); }
  };
  return (
    <>
      <PageHeader eyebrow={fr.builder.newTracker} title={fr.builder.addTracker} />
      <form className="ath-stack" onSubmit={submit}>
        <TemplatePicker id="new-tracker-pick" templates={templates} onPick={setDraft} />
        <TrackerBuilder value={draft} onChange={setDraft} />
        {problems.length > 0 && <ul>{problems.map((p) => <li key={p} className="ath-field__error">{p}</li>)}</ul>}
        <div><Btn type="submit" loading={busy} disabled={problems.length > 0}>{fr.builder.createTracker}</Btn></div>
      </form>
    </>
  );
}
