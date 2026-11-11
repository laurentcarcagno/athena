import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Btn, Card, Field, Select, StatusPill, Table, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

/**
 * Automatisations du projet (ADR-0005 § 2.1, T-0145) : liste lisible, création « Quand / Si / Alors » sur les déclencheurs
 * et actions de l'API, modèles prêts à l'emploi. Création et activation : administrateurs (section réservée).
 */
type Trigger = 'artifact.created' | 'artifact.updated' | 'artifact.transitioned' | 'comment.created' | 'code.linked' | 'schedule';
type Action = { type: 'comment'; body: string } | { type: 'transition'; name: string } | { type: 'update'; field: string; value: string };
interface Rule { id: string; name: string; enabled: boolean; trigger: Trigger; condition: string; actions: Array<{ type: string; body?: string; name?: string; values?: Record<string, unknown> }> }
interface Draft { name: string; trigger: Trigger; everyMinutes: number; condition: string; actions: Action[] }

const t = fr.automation;

/** Liste déroulante avec son libellé (structure de champ de la charte). */
function LabeledSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  const id = useId();
  return <div className="ath-field"><label className="ath-field__label" htmlFor={id}>{label}</label><Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{children}</Select></div>;
}
const TRIGGERS: Trigger[] = ['artifact.created', 'artifact.updated', 'artifact.transitioned', 'comment.created', 'code.linked', 'schedule'];
const PERIODS = [60, 1440, 10080];
const empty = (): Draft => ({ name: '', trigger: 'artifact.created', everyMinutes: 1440, condition: '', actions: [{ type: 'comment', body: '' }] });
export const TEMPLATES: Draft[] = [
  { name: t.templates[0]!.name, trigger: 'artifact.created', everyMinutes: 1440, condition: 'severity = bloquante', actions: [{ type: 'comment', body: t.templates[0]!.body }] },
  { name: t.templates[1]!.name, trigger: 'artifact.transitioned', everyMinutes: 1440, condition: 'status = approved', actions: [{ type: 'comment', body: t.templates[1]!.body }] },
  { name: t.templates[2]!.name, trigger: 'schedule', everyMinutes: 1440, condition: 'status = blocked', actions: [{ type: 'comment', body: t.templates[2]!.body }] },
];

/** Corps envoyé à `POST /v1/projects/:p/automations` (schéma de l'API). */
export function ruleBody(d: Draft) {
  return {
    name: d.name.trim(), trigger: d.trigger, condition: d.condition.trim(),
    ...(d.trigger === 'schedule' ? { everyMinutes: d.everyMinutes } : {}),
    actions: d.actions.map((a) => a.type === 'update' ? { type: 'update', values: { [a.field.trim()]: a.value } } : a.type === 'comment' ? { type: 'comment', body: a.body.trim() } : { type: 'transition', name: a.name.trim() }),
  };
}
const actionText = (a: Rule['actions'][number]) => a.type === 'comment' ? t.summary.comment(a.body ?? '') : a.type === 'transition' ? t.summary.transition(a.name ?? '') : t.summary.update(Object.keys(a.values ?? {}).join(', '));
const incomplete = (d: Draft) => !d.name.trim() || (d.trigger === 'schedule' && !d.condition.trim())
  || d.actions.some((a) => (a.type === 'comment' && !a.body.trim()) || (a.type === 'transition' && !a.name.trim()) || (a.type === 'update' && !a.field.trim()));

function ActionRow({ action, index, onChange, onRemove }: { action: Action; index: number; onChange: (a: Action) => void; onRemove?: () => void }) {
  return (
    <div className="ath-toolbar" role="group" aria-label={t.actionN(index + 1)}>
      <LabeledSelect label={t.actionType} value={action.type} onChange={(v) => onChange(v === 'comment' ? { type: 'comment', body: '' } : v === 'transition' ? { type: 'transition', name: '' } : { type: 'update', field: '', value: '' })}>
        <option value="comment">{t.types.comment}</option><option value="transition">{t.types.transition}</option><option value="update">{t.types.update}</option>
      </LabeledSelect>
      {action.type === 'comment' && <Field label={t.commentBody} value={action.body} onChange={(e) => onChange({ ...action, body: e.target.value })} />}
      {action.type === 'transition' && <Field label={t.transitionName} value={action.name} onChange={(e) => onChange({ ...action, name: e.target.value })} />}
      {action.type === 'update' && <><Field label={t.field} value={action.field} onChange={(e) => onChange({ ...action, field: e.target.value })} mono /><Field label={t.value} value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })} /></>}
      {onRemove && <Btn variant="ghost" size="sm" onClick={onRemove}>{t.removeAction}</Btn>}
    </div>
  );
}

function RuleForm({ initial, onCancel, onSaved, project }: { initial: Draft; onCancel: () => void; onSaved: () => void; project: string }) {
  const toast = useToast();
  const fail = useFailure();
  const [d, setD] = useState<Draft>(initial);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', `/v1/projects/${project}/automations`, ruleBody(d));
      toast('success', t.created(d.name.trim()));
      onSaved();
    } catch (error) { fail(error); }
  };
  return (
    <Card title={t.newTitle}>
      <form className="ath-stack" onSubmit={submit}>
        <Field label={t.name} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <div className="ath-toolbar">
          <LabeledSelect label={t.when} value={d.trigger} onChange={(v) => setD({ ...d, trigger: v as Trigger })}>
            {TRIGGERS.map((k) => <option key={k} value={k}>{t.triggers[k]}</option>)}
          </LabeledSelect>
          {d.trigger === 'schedule' && <LabeledSelect label={t.every} value={String(d.everyMinutes)} onChange={(v) => setD({ ...d, everyMinutes: Number(v) })}>
            {PERIODS.map((p) => <option key={p} value={p}>{t.periods[p]}</option>)}
          </LabeledSelect>}
        </div>
        <Field label={d.trigger === 'schedule' ? t.ifRequired : t.if} value={d.condition} onChange={(e) => setD({ ...d, condition: e.target.value })} mono aria-describedby="automation-if-hint" />
        <p id="automation-if-hint" className="ath-field__hint">{t.ifHint}</p>
        <fieldset className="ath-stack"><legend className="ath-field__label">{t.then}</legend>
          {d.actions.map((a, i) => <ActionRow key={i} action={a} index={i} onChange={(next) => setD({ ...d, actions: d.actions.map((x, j) => (j === i ? next : x)) })}
            onRemove={d.actions.length > 1 ? () => setD({ ...d, actions: d.actions.filter((_, j) => j !== i) }) : undefined} />)}
          {d.actions.length < 10 && <div><Btn variant="ghost" size="sm" onClick={() => setD({ ...d, actions: [...d.actions, { type: 'comment', body: '' }] })}>{t.addAction}</Btn></div>}
        </fieldset>
        <div className="ath-row"><Btn type="submit" disabled={incomplete(d)}>{t.create}</Btn><Btn variant="ghost" onClick={onCancel}>{t.cancel}</Btn></div>
      </form>
    </Card>
  );
}

export function AutomationsTab({ project }: { project: string }) {
  const toast = useToast();
  const fail = useFailure();
  const [items, setItems] = useState<Rule[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const load = useCallback(() => api<Rule[]>('GET', `/v1/projects/${project}/automations`).then(setItems).catch(fail), [project, fail]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (rule: Rule) => {
    try {
      await api('POST', `/v1/automations/${rule.id}/${rule.enabled ? 'disable' : 'enable'}`);
      toast('success', fr.admin.toggled);
      await load();
    } catch (error) { fail(error); }
  };
  return (
    <div className="ath-stack">
      <p className="ath-prose">{t.intro}</p>
      {draft ? <RuleForm key={draft.name} initial={draft} project={project} onCancel={() => setDraft(null)} onSaved={() => { setDraft(null); void load(); }} />
        : <div><Btn icon="plus" onClick={() => setDraft(empty())}>{t.new}</Btn></div>}
      {items && items.length > 0 && (
        <Table>
          <thead><tr><Th>{t.name}</Th><Th>{t.when}</Th><Th>{t.if}</Th><Th>{t.then}</Th><Th>{t.state}</Th><Th><span className="ath-visually-hidden">{t.actions}</span></Th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <Td>{r.name}</Td><Td>{t.triggers[r.trigger] ?? r.trigger}</Td><Td mono>{r.condition || t.always}</Td><Td>{(r.actions ?? []).map(actionText).join(' ; ')}</Td>
                <Td><StatusPill kind={r.enabled ? 'success' : 'default'}>{r.enabled ? t.enabled : t.disabled}</StatusPill></Td>
                <Td><Btn size="sm" variant="ghost" onClick={() => toggle(r)}>{r.enabled ? fr.admin.disable : fr.admin.enable}</Btn></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {!draft && (
        <section className="ath-stack" aria-labelledby="automation-templates">
          <h3 id="automation-templates" className="ath-subsection-title">{items && items.length > 0 ? t.moreTemplates : t.start}</h3>
          <ul className="ath-stack ath-list-plain">
            {TEMPLATES.map((m, i) => (
              <li key={m.name} className="ath-card ath-automation-template">
                <span><strong>{m.name}</strong> · {t.templates[i]!.summary}</span>
                <Btn size="sm" variant="ghost" aria-label={t.useTemplateFor(m.name)} onClick={() => setDraft(m)}>{t.useTemplate}</Btn>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
