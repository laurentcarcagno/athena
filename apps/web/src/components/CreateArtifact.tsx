import { useEffect, useState, type FormEvent } from 'react';
import { Btn, Modal, useToast } from '@athena/ui';
import { api, type Artifact, type Field, type TrackerDefinition } from '../api';
import { useBusy, useFailure } from '../hooks';
import { fr } from '../i18n';

export function coerce(field: Field, raw: string): unknown {
  if (raw.trim() === '') return undefined;
  if (field.type === 'number') return Number(raw);
  if (field.type === 'checkbox') return raw === 'true';
  if (field.type === 'multiselect') return raw.split(',').map((x) => x.trim()).filter(Boolean);
  return raw;
}

function Input({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const id = `new-${field.key}`;
  const label = field.required ? `${field.label} (${fr.artifact.required})` : field.label;
  const options = (field.config['options'] as string[] | undefined) ?? [];
  return (
    <div className="ath-field">
      <label className="ath-field__label" htmlFor={id}>{label}</label>
      {field.type === 'select' ? (
        <select id={id} className="ath-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" />
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'richtext' ? (
        <textarea id={id} className="ath-input" rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className={`ath-input${field.type === 'number' || field.type === 'date' ? ' ath-mono' : ''}`} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** Création d'un artefact : le formulaire est généré depuis la définition du tracker choisi. */
export function CreateArtifact({ project, trackers, open, onClose, onCreated }: {
  project: string; trackers: string[]; open: boolean; onClose: () => void; onCreated: (key: string) => void;
}) {
  const toast = useToast();
  const fail = useFailure();
  const { busy, guard } = useBusy();
  const [tracker, setTracker] = useState(trackers[0] ?? '');
  const [definition, setDefinition] = useState<TrackerDefinition | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => { if (!tracker && trackers[0]) setTracker(trackers[0]); }, [trackers, tracker]);
  useEffect(() => {
    if (!open || !tracker) return;
    setValues({});
    api<TrackerDefinition>('GET', `/v1/projects/${project}/trackers/${tracker}`).then(setDefinition).catch(fail);
  }, [open, tracker, project, fail]);

  const submit = (event: FormEvent) => { event.preventDefault(); void guard(() => submitRun()); };
  const submitRun = async () => {
    if (!definition) return;
    const payload: Record<string, unknown> = {};
    for (const field of definition.fields) {
      const value = coerce(field, values[field.key] ?? '');
      if (value !== undefined) payload[field.key] = value;
    }
    try {
      const created = await api<Artifact>('POST', `/v1/projects/${project}/trackers/${tracker}/artifacts`, { values: payload });
      toast('success', fr.create.created(created.key));
      onCreated(created.key);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <Modal open={open} title={fr.create.title} size="md" onClose={onClose}
      footer={<><Btn icon="close" variant="ghost" onClick={onClose}>{fr.create.cancel}</Btn><Btn type="submit" form="create-artifact" loading={busy}>{fr.create.submit}</Btn></>}>
      {trackers.length === 0 ? <p>{fr.create.noTracker}</p> : (
        <form id="create-artifact" className="ath-stack" onSubmit={submit}>
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="new-tracker">{fr.create.tracker}</label>
            <select id="new-tracker" className="ath-select" value={tracker} onChange={(e) => setTracker(e.target.value)}>
              {trackers.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {definition?.fields.map((f) => <Input key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />)}
        </form>
      )}
    </Modal>
  );
}
