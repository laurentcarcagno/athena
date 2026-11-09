import { useState, type FormEvent } from 'react';
import { Btn, Field, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { forSave } from '../lib/layout';
import { TrackerBuilder, trackerProblems, type DraftTracker } from './TrackerBuilder';
import type { TrackerTemplateEntry } from './TrackerTemplateForm';

export interface ProjectTemplateToEdit { key: string; name: string; description: string; builtin: boolean; trackers: unknown[] }

/** Modification d'un template de projet (livré ou de l'organisation) : nom, description et trackers, chacun éditable en entier. */
export function ProjectTemplateEditor({ template, trackerTemplates, onSaved, onCancel }: {
  template: ProjectTemplateToEdit; trackerTemplates: TrackerTemplateEntry[]; onSaved: () => void | Promise<void>; onCancel: () => void;
}) {
  const toast = useToast();
  const fail = useFailure();
  const [meta, setMeta] = useState({ name: template.name, description: template.description });
  const [trackers, setTrackers] = useState<DraftTracker[]>(() => JSON.parse(JSON.stringify(template.trackers)) as DraftTracker[]);
  const [open, setOpen] = useState<string | null>(null);
  const [toAdd, setToAdd] = useState('');
  const problems = trackers.flatMap((t) => trackerProblems(t).map((p) => `${t.key || '—'} : ${p}`));
  const duplicate = new Set(trackers.map((t) => t.key)).size !== trackers.length;

  const add = () => {
    const found = trackerTemplates.find((t) => t.key === toAdd);
    if (!found || trackers.some((t) => t.key === found.tracker.key)) return;
    setTrackers([...trackers, JSON.parse(JSON.stringify(found.tracker)) as DraftTracker]);
    setOpen(found.tracker.key);
    setToAdd('');
  };
  const change = (index: number, next: DraftTracker) => setTrackers(trackers.map((t, i) => (i === index ? next : t)));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('PUT', `/v1/project-templates/${template.key}`, {
        name: meta.name, ...(meta.description ? { description: meta.description } : {}),
        trackers: trackers.map((t) => ({ ...t, description: undefined, layout: t.layout ? forSave(t.layout, t.fields) : undefined })),
      });
      toast('success', fr.builder.templateSaved);
      await onSaved();
    } catch (error) { fail(error); }
  };

  return (
    <form className="ath-stack" onSubmit={submit} aria-label={fr.builder.editing(template.name)}>
      <h2 className="ath-label">{fr.builder.editing(template.name)}</h2>
      {template.builtin && <p className="ath-eyebrow">{fr.builder.builtinNote}</p>}
      <div className="ath-toolbar">
        <Field label={fr.org.templateKey} value={template.key} readOnly mono />
        <Field label={fr.org.templateName} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
        <Field label={fr.org.templateDescription} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
      </div>
      <fieldset className="ath-stack">
        <legend className="ath-field__label">{fr.builder.trackersOfTemplate}</legend>
        {trackers.length === 0 && <p className="ath-eyebrow">{fr.builder.noTrackers}</p>}
        {trackers.map((t, i) => (
          <div key={`${t.key}-${i}`} className="ath-stack">
            <div className="ath-row">
              <span><span className="ath-mono">{t.key}</span> {t.name}</span>
              <Btn type="button" size="sm" variant="ghost" aria-expanded={open === t.key} aria-label={`${open === t.key ? fr.builder.closeTracker : fr.builder.editTracker} ${t.key}`}
                onClick={() => setOpen(open === t.key ? null : t.key)}>{open === t.key ? fr.builder.closeTracker : fr.builder.editTracker}</Btn>
              <Btn icon="trash" type="button" size="sm" variant="ghost" aria-label={`${fr.builder.removeTracker} ${t.key}`} onClick={() => setTrackers(trackers.filter((_, j) => j !== i))}>{fr.builder.removeTracker}</Btn>
            </div>
            {open === t.key && <TrackerBuilder value={t} onChange={(next) => change(i, next)} />}
          </div>
        ))}
        <div className="ath-toolbar">
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="ptpl-add">{fr.builder.pickTemplateToAdd}</label>
            <select id="ptpl-add" className="ath-select" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
              <option value="" />{trackerTemplates.filter((t) => !trackers.some((x) => x.key === t.tracker.key)).map((t) => <option key={t.key} value={t.key}>{t.name} ({t.tracker.key})</option>)}
            </select>
          </div>
          <Btn type="button" variant="ghost" icon="plus" disabled={!toAdd} onClick={add}>{fr.builder.addFromTemplate}</Btn>
        </div>
      </fieldset>
      {duplicate && <p className="ath-field__error">{fr.builder.duplicateTracker}</p>}
      {problems.length > 0 && <ul aria-label="problems">{problems.map((p) => <li key={p} className="ath-field__error">{p}</li>)}</ul>}
      <div className="ath-row">
        <Btn type="submit" disabled={!meta.name.trim() || problems.length > 0 || duplicate}>{fr.builder.save}</Btn>
        <Btn type="button" variant="ghost" onClick={onCancel}>{fr.builder.cancel}</Btn>
      </div>
    </form>
  );
}
