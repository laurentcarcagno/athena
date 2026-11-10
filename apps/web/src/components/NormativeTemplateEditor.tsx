import { useMemo, useState } from 'react';
import { Btn, Field, Table, Tag, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

export interface NField { key: string; label: string; type: string; required?: boolean; config?: Record<string, unknown> }
export interface NTracker { key: string; name: string; fields: NField[]; statuses: Array<{ key: string; name: string; category: string }>; transitions: unknown[] }
export interface NormativeDraft {
  standards: Array<{ key: string; name: string; edition: string; date?: string }>;
  criticality?: { label: string; categories: Array<{ key: string; name: string }> };
  reviews: Array<{ key: string; name: string }>;
  phases: Array<{ key: string; name: string; review: string; deliverables: string[]; entryCriteria?: unknown[]; exitCriteria?: unknown[] }>;
  deliverables: Array<{ key: string; name: string }>;
  rules: Array<{ key: string; name: string; fromTracker: string; linkType: string; direction: string; minCount: number; statuses: string[]; threshold: { target: number; warning?: number } }>;
  parameters: Array<{ key: string; label: string; unit?: string; byCategory: Record<string, number | null> }>;
  marking?: { fields: string[] };
  mandatory?: string[];
  remove?: string[];
}
export interface NormativeTemplateEntry {
  key: string; name: string; description: string; builtin: boolean; trackers: NTracker[];
  normative?: NormativeDraft; parent?: { key: string; version?: string } | null; version?: string | null; versions?: string[];
}
export const emptyDraft = (): NormativeDraft => ({ standards: [], reviews: [], phases: [], deliverables: [], rules: [], parameters: [] });

const STEPS = ['parent', 'standards', 'criticality', 'trackers', 'phases', 'rules', 'publish'] as const;
type Step = (typeof STEPS)[number];
const KEY = /^[a-z][a-z0-9_-]{0,39}$/;
const TEMPLATE_KEY = /^[a-z][a-z0-9-]{1,39}$/;

/** Problèmes d'une étape (même contrôle que le serveur, pour avancer sans aller-retour). Liste vide : l'étape est valide. */
export function stepProblems(step: Step, f: { key: string; name: string; trackers: NTracker[]; normative: NormativeDraft }): string[] {
  const t = fr.normTpl.errors;
  const n = f.normative;
  const out: string[] = [];
  const dup = (keys: string[]) => { for (const k of new Set(keys.filter((x, i) => keys.indexOf(x) !== i))) out.push(t.duplicate(k)); };
  if (step === 'parent') { if (!TEMPLATE_KEY.test(f.key)) out.push(t.key); if (!f.name.trim()) out.push(t.name); }
  if (step === 'standards') { if (n.standards.some((s) => !KEY.test(s.key) || !s.name.trim() || !s.edition.trim())) out.push(t.standard); dup(n.standards.map((s) => s.key)); }
  if (step === 'criticality' && n.criticality) {
    if (n.criticality.categories.some((c) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/.test(c.key) || !c.name.trim())) out.push(t.category);
    dup(n.criticality.categories.map((c) => c.key));
  }
  if (step === 'phases') {
    if ([...n.reviews, ...n.phases, ...n.deliverables].some((x) => !KEY.test(x.key) || !x.name.trim())) out.push(t.phaseKey);
    for (const p of n.phases) if (!n.reviews.some((r) => r.key === p.review)) out.push(t.phaseReview(p.key || '—'));
    dup(n.reviews.map((r) => r.key)); dup(n.phases.map((p) => p.key)); dup(n.deliverables.map((d) => d.key));
  }
  if (step === 'rules') {
    if (n.rules.some((r) => !KEY.test(r.key) || !r.name.trim())) out.push(t.ruleKey);
    for (const r of n.rules) if (!f.trackers.some((x) => x.key === r.fromTracker)) out.push(t.ruleTracker(r.key || '—'));
    if (n.parameters.some((p) => Object.values(p.byCategory).some((v) => v !== null)) && !(n.criticality?.categories.length)) out.push(t.categoriesNeeded);
    dup(n.rules.map((r) => r.key));
  }
  return out;
}

const fieldInput = (f: NField) => {
  const id = `pv-${f.key}`;
  const label = <label className="ath-field__label" htmlFor={id}>{f.label}{f.required ? <span className="ath-mono"> ({fr.normTpl.required})</span> : null}</label>;
  const common = { id, disabled: true, 'aria-required': f.required ? true : undefined } as const;
  if (f.type === 'richtext') return <div className="ath-field" key={f.key}>{label}<textarea className="ath-input" rows={3} {...common} /></div>;
  if (f.type === 'select') return <div className="ath-field" key={f.key}>{label}<select className="ath-select" {...common}>{((f.config?.['options'] as string[] | undefined) ?? []).map((o) => <option key={o}>{o}</option>)}</select></div>;
  return <div className="ath-field" key={f.key}>{label}<input className="ath-input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} {...common} /></div>;
};

/** Aperçu en direct du formulaire d'item d'un tracker du gabarit (champs, libellés, obligatoires). */
export function ItemFormPreview({ tracker }: { tracker: NTracker }) {
  return (
    <form className="ath-card ath-stack" aria-label={fr.normTpl.previewOf(tracker.key)} onSubmit={(e) => e.preventDefault()}>
      <h3 className="ath-subsection-title">{fr.normTpl.previewOf(tracker.key)}</h3>
      {tracker.fields.map(fieldInput)}
    </form>
  );
}

/** Fusion simple parent + propres pour l'aperçu : l'enfant remplace le tracker de même clé. */
export const previewTrackers = (parent: NTracker[], own: NTracker[]): Array<NTracker & { inherited: boolean }> => [
  ...parent.filter((p) => !own.some((o) => o.key === p.key)).map((t) => ({ ...t, inherited: true })),
  ...own.map((t) => ({ ...t, inherited: false })),
];

/**
 * Éditeur par étapes d'un gabarit normatif : parent, référentiel, criticité, trackers (aperçu du formulaire d'item), phases,
 * revues et livrables, règles et seuils, publication. Chaque étape est validée avant de passer à la suivante.
 */
export function NormativeTemplateEditor({ templates, trackerTemplates, initial, onSaved, onCancel }: {
  templates: NormativeTemplateEntry[]; trackerTemplates: Array<{ key: string; name: string; tracker: NTracker }>;
  initial: Partial<NormativeTemplateEntry> & { isNew: boolean }; onSaved: () => void | Promise<void>; onCancel: () => void;
}) {
  const t = fr.normTpl;
  const toast = useToast();
  const fail = useFailure();
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(!initial.isNew);
  const [meta, setMeta] = useState({ key: initial.key ?? '', name: initial.name ?? '', description: initial.description ?? '' });
  const [parent, setParent] = useState<{ key: string; version: string }>({ key: initial.parent?.key ?? '', version: initial.parent?.version ?? '' });
  const [own, setOwn] = useState<NTracker[]>(initial.trackers ?? []);
  const [n, setN] = useState<NormativeDraft>(() => ({ ...emptyDraft(), ...JSON.parse(JSON.stringify(initial.normative ?? {})) as Partial<NormativeDraft> }));
  const [toAdd, setToAdd] = useState('');
  const [previewKey, setPreviewKey] = useState('');
  const [version, setVersion] = useState('');
  const [resolved, setResolved] = useState<string[] | null>(null);
  const parents = templates.filter((x) => x.key !== meta.key && (x.versions?.length ?? 0) > 0);
  const parentView = templates.find((x) => x.key === parent.key);
  const trackers = useMemo(() => previewTrackers(parentView?.trackers ?? [], own), [parentView, own]);
  const allForRules = trackers;
  const current = STEPS[step]!;
  const problems = stepProblems(current, { key: meta.key, name: meta.name, trackers: allForRules, normative: n });
  const patch = (next: Partial<NormativeDraft>) => setN((x) => ({ ...x, ...next }));
  const setRow = <K extends 'standards' | 'reviews' | 'deliverables' | 'phases' | 'rules'>(name: K, i: number, change: Partial<NormativeDraft[K][number]>) =>
    patch({ [name]: n[name].map((r, j) => (j === i ? { ...r, ...change } : r)) } as Partial<NormativeDraft>);
  const drop = <K extends 'standards' | 'reviews' | 'deliverables' | 'phases' | 'rules'>(name: K, i: number) => patch({ [name]: n[name].filter((_, j) => j !== i) } as Partial<NormativeDraft>);
  const cats = n.criticality?.categories ?? [];

  const body = () => ({
    name: meta.name, ...(meta.description ? { description: meta.description } : {}), trackers: own.map((x) => ({ ...x, description: undefined })),
    normative: n, parent: parent.key ? { key: parent.key, ...(parent.version ? { version: parent.version } : {}) } : null,
  });
  const save = async (): Promise<boolean> => {
    try {
      if (saved) await api('PUT', `/v1/project-templates/${meta.key}`, body());
      else await api('POST', '/v1/project-templates', { key: meta.key, ...body() });
      setSaved(true);
      toast('success', t.saved);
      return true;
    } catch (error) { fail(error); return false; }
  };
  const publish = async () => {
    if (!(await save())) return;
    try {
      const out = await api<{ version: string }>('POST', `/v1/project-templates/${meta.key}/publish`, version ? { version } : {});
      toast('success', t.publishedAs(out.version));
      await onSaved();
    } catch (error) { fail(error); }
  };
  const check = async () => {
    if (!(await save())) return;
    try { await api('GET', `/v1/project-templates/${meta.key}/resolved`); setResolved([]); } catch (error) { setResolved(null); fail(error); }
  };

  const row = (children: React.ReactNode, onRemove: () => void, label: string) => (
    <div className="ath-toolbar">{children}<Btn type="button" variant="ghost" size="sm" icon="trash" aria-label={`${t.remove} ${label}`} title={`${t.remove} ${label}`} onClick={onRemove}>{t.remove}</Btn></div>
  );
  const text = (id: string, label: string, value: string, set: (v: string) => void, mono = false) => (
    <Field key={id} label={label} value={value} onChange={(e) => set(e.target.value)} mono={mono} />
  );
  const selectOf = (id: string, label: string, value: string, set: (v: string) => void, options: Array<[string, string]>) => (
    <div className="ath-field"><label className="ath-field__label" htmlFor={id}>{label}</label>
      <select id={id} className="ath-select" value={value} onChange={(e) => set(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );

  const previewList = trackers;
  const previewed = previewList.find((x) => x.key === previewKey) ?? previewList[0];

  return (
    <section className="ath-stack" aria-label={t.title(initial.name ?? t.new)}>
      <h2 className="ath-section-title">{initial.isNew ? t.new : t.title(meta.name)}</h2>
      <nav aria-label={t.stepOf(step + 1, STEPS.length, t.steps[current]!)}>
        <ol className="ath-row">{STEPS.map((s, i) => (
          <li key={s}>{i === step ? <Tag variant="solid">{`${i + 1}. ${t.steps[s]}`}</Tag> : <Tag variant="ghost">{`${i + 1}. ${t.steps[s]}`}</Tag>}</li>
        ))}</ol>
      </nav>
      <h3 className="ath-subsection-title" aria-live="polite">{t.stepOf(step + 1, STEPS.length, t.steps[current]!)}</h3>

      {current === 'parent' && (
        <div className="ath-stack">
          <div className="ath-toolbar">
            <Field label={t.key} value={meta.key} readOnly={!initial.isNew} onChange={(e) => setMeta({ ...meta, key: e.target.value })} mono />
            <Field label={t.name} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </div>
          <Field label={t.description} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          <div className="ath-toolbar">
            {selectOf('nt-parent', t.parent, parent.key, (v) => setParent({ key: v, version: '' }), [['', t.noParent], ...parents.map((p): [string, string] => [p.key, `${p.name} (${p.key})`])])}
            {parent.key && selectOf('nt-pver', t.parentVersion, parent.version, (v) => setParent({ ...parent, version: v }), [['', t.latest], ...(parentView?.versions ?? []).map((v): [string, string] => [v, v])])}
          </div>
        </div>
      )}

      {current === 'standards' && (
        <div className="ath-stack">
          <p className="ath-eyebrow">{t.standardsHelp}</p>
          {n.standards.map((s, i) => row(<>
            {text(`st-key-${i}`, t.key, s.key, (v) => setRow('standards', i, { key: v }), true)}{text(`st-name-${i}`, t.name, s.name, (v) => setRow('standards', i, { name: v }))}
            {text(`st-ed-${i}`, t.edition, s.edition, (v) => setRow('standards', i, { edition: v }))}{text(`st-date-${i}`, t.date, s.date ?? '', (v) => setRow('standards', i, { date: v }), true)}
          </>, () => drop('standards', i), s.key || String(i + 1)))}
          <div><Btn type="button" variant="ghost" onClick={() => patch({ standards: [...n.standards, { key: '', name: '', edition: '' }] })}>{t.add}</Btn></div>
        </div>
      )}

      {current === 'criticality' && (
        <div className="ath-stack">
          {text('cr-label', t.criticalityLabel, n.criticality?.label ?? '', (v) => patch({ criticality: { label: v, categories: cats } }))}
          <h4 className="ath-group-title">{t.categories}</h4>
          {cats.map((c, i) => row(<>
            {text(`cat-key-${i}`, t.categoryKey, c.key, (v) => patch({ criticality: { label: n.criticality!.label, categories: cats.map((x, j) => (j === i ? { ...x, key: v } : x)) } }), true)}
            {text(`cat-name-${i}`, t.categoryName, c.name, (v) => patch({ criticality: { label: n.criticality!.label, categories: cats.map((x, j) => (j === i ? { ...x, name: v } : x)) } }))}
          </>, () => patch({ criticality: { label: n.criticality!.label, categories: cats.filter((_, j) => j !== i) } }), c.key || String(i + 1)))}
          <div><Btn type="button" variant="ghost" onClick={() => patch({ criticality: { label: n.criticality?.label || '—', categories: [...cats, { key: '', name: '' }] } })}>{t.add}</Btn></div>
        </div>
      )}

      {current === 'trackers' && (
        <div className="ath-stack">
          {previewList.length === 0 ? <p>{t.noTrackers}</p> : (
            <Table>
              <caption className="ath-table__caption">{t.steps['trackers']}</caption>
              <thead><tr><Th>{t.key}</Th><Th>{t.name}</Th><Th>{t.description}</Th></tr></thead>
              <tbody>{previewList.map((x) => <tr key={x.key}><Td mono>{x.key}</Td><Td>{x.name}</Td><Td>{x.inherited ? t.inherited : t.own}</Td></tr>)}</tbody>
            </Table>
          )}
          <div className="ath-toolbar">
            {selectOf('nt-add', t.addTrackerFrom, toAdd, setToAdd, [['', '—'], ...trackerTemplates.filter((x) => !previewList.some((p) => p.key === x.tracker.key)).map((x): [string, string] => [x.key, `${x.name} (${x.tracker.key})`])])}
            <Btn type="button" variant="ghost" disabled={!toAdd} onClick={() => { const f = trackerTemplates.find((x) => x.key === toAdd); if (f) { setOwn([...own, JSON.parse(JSON.stringify(f.tracker)) as NTracker]); setPreviewKey(f.tracker.key); setToAdd(''); } }}>{t.addTracker}</Btn>
          </div>
          {previewed && (
            <>
              {selectOf('nt-preview', t.previewTracker, previewed.key, setPreviewKey, previewList.map((x): [string, string] => [x.key, `${x.key} · ${x.name}`]))}
              <ItemFormPreview tracker={previewed} />
            </>
          )}
        </div>
      )}

      {current === 'phases' && (
        <div className="ath-stack">
          <h4 className="ath-group-title">{t.reviews}</h4>
          {n.reviews.map((r, i) => row(<>{text(`rv-key-${i}`, t.key, r.key, (v) => setRow('reviews', i, { key: v }), true)}{text(`rv-name-${i}`, t.name, r.name, (v) => setRow('reviews', i, { name: v }))}</>, () => drop('reviews', i), r.key || String(i + 1)))}
          <div><Btn type="button" variant="ghost" onClick={() => patch({ reviews: [...n.reviews, { key: '', name: '' }] })}>{`${t.add} · ${t.reviews}`}</Btn></div>
          <h4 className="ath-group-title">{t.deliverables}</h4>
          {n.deliverables.map((d, i) => row(<>{text(`dl-key-${i}`, t.key, d.key, (v) => setRow('deliverables', i, { key: v }), true)}{text(`dl-name-${i}`, t.name, d.name, (v) => setRow('deliverables', i, { name: v }))}</>, () => drop('deliverables', i), d.key || String(i + 1)))}
          <div><Btn type="button" variant="ghost" onClick={() => patch({ deliverables: [...n.deliverables, { key: '', name: '' }] })}>{`${t.add} · ${t.deliverables}`}</Btn></div>
          <h4 className="ath-group-title">{t.phases}</h4>
          {n.phases.map((p, i) => (
            <div key={i} className="ath-stack">
              {row(<>
                {text(`ph-key-${i}`, t.key, p.key, (v) => setRow('phases', i, { key: v }), true)}{text(`ph-name-${i}`, t.name, p.name, (v) => setRow('phases', i, { name: v }))}
                {selectOf(`ph-rev-${i}`, t.review, p.review, (v) => setRow('phases', i, { review: v }), [['', '—'], ...n.reviews.filter((r) => r.key).map((r): [string, string] => [r.key, r.name])])}
              </>, () => drop('phases', i), p.key || String(i + 1))}
              <fieldset className="ath-field"><legend className="ath-field__label">{`${t.phaseDeliverables} · ${p.key || i + 1}`}</legend>
                {n.deliverables.filter((d) => d.key).map((d) => (
                  <label key={d.key} className="ath-row"><input type="checkbox" checked={p.deliverables.includes(d.key)}
                    onChange={(e) => setRow('phases', i, { deliverables: e.target.checked ? [...p.deliverables, d.key] : p.deliverables.filter((x) => x !== d.key) })} /> {d.name}</label>
                ))}</fieldset>
            </div>
          ))}
          <div><Btn type="button" variant="ghost" onClick={() => patch({ phases: [...n.phases, { key: '', name: '', review: '', deliverables: [] }] })}>{`${t.add} · ${t.phases}`}</Btn></div>
        </div>
      )}

      {current === 'rules' && (
        <div className="ath-stack">
          <h4 className="ath-group-title">{t.rulesTitle}</h4>
          {n.rules.map((r, i) => row(<>
            {text(`ru-key-${i}`, t.key, r.key, (v) => setRow('rules', i, { key: v }), true)}{text(`ru-name-${i}`, t.name, r.name, (v) => setRow('rules', i, { name: v }))}
            {selectOf(`ru-tr-${i}`, t.fromTracker, r.fromTracker, (v) => setRow('rules', i, { fromTracker: v }), [['', '—'], ...allForRules.map((x): [string, string] => [x.key, x.key])])}
            {text(`ru-lt-${i}`, t.linkType, r.linkType, (v) => setRow('rules', i, { linkType: v }), true)}
            {selectOf(`ru-dir-${i}`, t.direction, r.direction, (v) => setRow('rules', i, { direction: v }), Object.entries(t.directions))}
            <Field label={t.minCount} type="number" min={1} max={100} value={String(r.minCount)} onChange={(e) => setRow('rules', i, { minCount: Number(e.target.value) || 1 })} mono />
            <Field label={t.target} type="number" min={0} max={100} value={String(r.threshold.target)} onChange={(e) => setRow('rules', i, { threshold: { ...r.threshold, target: Number(e.target.value) } })} mono />
          </>, () => drop('rules', i), r.key || String(i + 1)))}
          <div><Btn type="button" variant="ghost" onClick={() => patch({ rules: [...n.rules, { key: '', name: '', fromTracker: allForRules[0]?.key ?? '', linkType: 'verifies', direction: 'any', minCount: 1, statuses: [], threshold: { target: 100 } }] })}>{t.add}</Btn></div>
          <h4 className="ath-group-title">{t.parametersTitle}</h4>
          <p className="ath-eyebrow">{t.parametersHelp}</p>
          {n.parameters.map((p, pi) => (
            <fieldset key={p.key} className="ath-toolbar"><legend className="ath-field__label">{p.label}</legend>
              {cats.map((c) => (
                <Field key={c.key} label={`${p.label} · ${c.key}`} type="number" min={0} max={100} mono value={p.byCategory[c.key] == null ? '' : String(p.byCategory[c.key])}
                  onChange={(e) => patch({ parameters: n.parameters.map((x, j) => (j === pi ? { ...x, byCategory: { ...x.byCategory, [c.key]: e.target.value === '' ? null : Number(e.target.value) } } : x)) })} />
              ))}</fieldset>
          ))}
        </div>
      )}

      {current === 'publish' && (
        <div className="ath-stack">
          <p>{t.publishHelp}</p>
          {text('nt-version', t.versionNumber, version, setVersion, true)}
          <div className="ath-toolbar">
            <Btn type="button" variant="ghost" onClick={() => void check()}>{t.saveDraft}</Btn>
            <Btn type="button" onClick={() => void publish()} disabled={!meta.key || !meta.name}>{t.publish}</Btn>
          </div>
          {resolved && resolved.length === 0 && <p role="status">{t.saved}</p>}
        </div>
      )}

      {problems.length > 0 && (
        <div role="alert" className="ath-stack"><h4 className="ath-group-title">{t.problems}</h4><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
      )}
      <div className="ath-toolbar">
        <Btn type="button" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>{t.previous}</Btn>
        {step < STEPS.length - 1 && <Btn type="button" disabled={problems.length > 0} onClick={() => setStep(step + 1)}>{t.next}</Btn>}
        {step < STEPS.length - 1 && <Btn type="button" variant="ghost" disabled={problems.length > 0 || !TEMPLATE_KEY.test(meta.key) || !meta.name.trim()} onClick={() => void save()}>{t.saveDraft}</Btn>}
        <Btn icon="close" type="button" variant="ghost" onClick={onCancel}>{fr.confirm.cancel}</Btn>
      </div>
    </section>
  );
}
