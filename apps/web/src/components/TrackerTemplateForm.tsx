import { useState, type FormEvent } from 'react';
import { Btn, Field, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { forSave } from '../lib/layout';
import { TrackerBuilder, emptyTracker, trackerProblems, type DraftTracker } from './TrackerBuilder';

export interface TrackerTemplateEntry { key: string; name: string; description: string; builtin: boolean; modified?: boolean; tracker: DraftTracker }

/** Sélecteur « partir d'un template de tracker » : copie le template dans le brouillon, qui reste modifiable. */
export function TemplatePicker({ templates, onPick, id }: { templates: TrackerTemplateEntry[]; onPick: (tracker: DraftTracker) => void; id: string }) {
  const [chosen, setChosen] = useState('');
  return (
    <div className="ath-field">
      <label className="ath-field__label" htmlFor={id}>{fr.builder.fromTemplate}</label>
      <select id={id} className="ath-select" value={chosen} onChange={(e) => {
        setChosen(e.target.value);
        const found = templates.find((t) => t.key === e.target.value);
        onPick(found ? (JSON.parse(JSON.stringify(found.tracker)) as DraftTracker) : emptyTracker());
      }}>
        <option value="">{fr.builder.blank}</option>
        {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
      </select>
    </div>
  );
}

/** Création d'un template de tracker : brouillon construit de toutes pièces ou à partir d'un template existant. */
export function TrackerTemplateForm({ templates, onCreated, edit, onCancel }: { templates: TrackerTemplateEntry[]; onCreated: (key: string) => void | Promise<void>; edit?: TrackerTemplateEntry; onCancel?: () => void }) {
  const toast = useToast();
  const fail = useFailure();
  const [meta, setMeta] = useState({ key: edit?.key ?? '', name: edit?.name ?? '', description: edit?.description ?? '' });
  const [draft, setDraft] = useState<DraftTracker>(edit ? (JSON.parse(JSON.stringify(edit.tracker)) as DraftTracker) : emptyTracker());
  const problems = trackerProblems(draft);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const tracker = { ...draft, description: undefined, layout: draft.layout ? forSave(draft.layout, draft.fields) : undefined };
      const description = meta.description ? { description: meta.description } : {};
      if (edit) await api('PUT', `/v1/tracker-templates/${edit.key}`, { name: meta.name, ...description, tracker });
      else await api('POST', '/v1/tracker-templates', { key: meta.key, name: meta.name, ...description, tracker });
      toast('success', edit ? fr.builder.templateSaved : fr.builder.trackerTemplateCreated);
      if (!edit) { setMeta({ key: '', name: '', description: '' }); setDraft(emptyTracker()); }
      await onCreated(meta.key);
    } catch (error) { fail(error); }
  };
  return (
    <form className="ath-stack" onSubmit={submit}>
      <div className="ath-toolbar">
        <Field label={fr.builder.templateKey} value={meta.key} onChange={(e) => setMeta({ ...meta, key: e.target.value })} mono readOnly={!!edit} />
        <Field label={fr.builder.templateName} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
        <Field label={fr.org.templateDescription} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
        {!edit && <TemplatePicker id="tpl-form-pick" templates={templates} onPick={setDraft} />}
      </div>
      <TrackerBuilder value={draft} onChange={setDraft} />
      {problems.length > 0 && <ul aria-label="problems">{problems.map((p) => <li key={p} className="ath-field__error">{p}</li>)}</ul>}
      <div className="ath-row">
        <Btn type="submit" disabled={!/^[a-z][a-z0-9-]{1,39}$/.test(meta.key) || !meta.name.trim() || problems.length > 0}>{edit ? fr.builder.save : fr.builder.createTrackerTemplate}</Btn>
        {edit && onCancel && <Btn type="button" variant="ghost" onClick={onCancel}>{fr.builder.cancel}</Btn>}
      </div>
    </form>
  );
}
