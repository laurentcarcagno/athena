import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Card, EmptyState, Field, Table, Tag, Td, Th, useToast } from '@athena/ui';
import { api, type TrackerTypeEntry } from '../api';
import { useBusy, useFailure } from '../hooks';
import { fr } from '../i18n';
import { useConfirm } from './ConfirmDialog';

const CATEGORIES = ['engineering', 'development', 'verification', 'management'] as const;
const VIEWS = ['tableau', 'board', 'arbre', 'matrice', 'document', 'timeline', 'calendrier'] as const;
const FIELD_TYPES = ['text', 'richtext', 'number', 'date', 'select', 'user'];
const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const TYPE_KEY = /^[a-z][a-z0-9-]{1,39}$/;

interface Draft { key: string; name: string; description: string; category: TrackerTypeEntry['category']; defaultViews: string[]; baseFields: TrackerTypeEntry['baseFields'] }
const blank = (): Draft => ({ key: '', name: '', description: '', category: 'engineering', defaultViews: ['tableau'], baseFields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }] });

/** Libellé d'une catégorie ; un tracker sans type est classé « Autres ». */
export const categoryLabel = (category: string | undefined): string => (fr.types.categories as Record<string, string>)[category ?? 'other'] ?? fr.types.categories.other;

/** Liste, création, modification et suppression des types de tracker de l'organisation (administrateurs). */
export function TrackerTypesTab() {
  const toast = useToast();
  const fail = useFailure();
  const confirm = useConfirm();
  const { busy, guard } = useBusy();
  const [types, setTypes] = useState<TrackerTypeEntry[]>([]);
  const [draft, setDraft] = useState<Draft>(blank());
  const [editing, setEditing] = useState<string | null>(null);
  const [field, setField] = useState({ key: '', label: '', type: 'text' });
  const load = useCallback(async () => setTypes(await api<TrackerTypeEntry[]>('GET', '/v1/tracker-types')), []);
  useEffect(() => { load().catch(fail); }, [load, fail]);

  const startEdit = (t: TrackerTypeEntry) => { setEditing(t.key); setDraft({ key: t.key, name: t.name, description: t.description, category: t.category, defaultViews: [...t.defaultViews], baseFields: t.baseFields.map((f) => ({ ...f })) }); };
  const stopEdit = () => { setEditing(null); setDraft(blank()); };
  const body = () => ({ name: draft.name, description: draft.description, category: draft.category, defaultViews: draft.defaultViews, baseFields: draft.baseFields });
  const submit = (event: FormEvent) => { event.preventDefault(); void guard(async () => {
    try {
      if (editing) await api('PUT', `/v1/tracker-types/${editing}`, body());
      else await api('POST', '/v1/tracker-types', { key: draft.key, ...body() });
      toast('success', editing ? fr.types.saved : fr.types.created);
      stopEdit();
      await load();
    } catch (error) { fail(error); }
  }); };
  const remove = async (t: TrackerTypeEntry) => {
    const ok = await confirm.ask(t.builtin
      ? { title: fr.types.resetTitle(t.name), body: fr.types.resetBody, confirm: fr.types.reset }
      : { title: fr.types.deleteTitle(t.name), body: fr.types.deleteBody, confirm: fr.types.delete });
    if (!ok) return;
    try { await api('DELETE', `/v1/tracker-types/${t.key}`); toast('success', t.builtin ? fr.types.resetDone : fr.types.deleted); await load(); } catch (error) { fail(error); }
  };
  const toggleView = (view: string, on: boolean) => setDraft({ ...draft, defaultViews: on ? [...draft.defaultViews, view] : draft.defaultViews.filter((v) => v !== view) });
  const fieldInvalid = !FIELD_KEY.test(field.key) || !field.label.trim() || draft.baseFields.some((f) => f.key === field.key);
  const addField = () => { setDraft({ ...draft, baseFields: [...draft.baseFields, { key: field.key, label: field.label.trim(), type: field.type }] }); setField({ key: '', label: '', type: 'text' }); };
  const invalid = (!editing && !TYPE_KEY.test(draft.key)) || !draft.name.trim() || draft.defaultViews.length === 0;

  return (
    <div className="ath-stack">
      {confirm.dialog}
      <p className="ath-eyebrow">{fr.types.note}</p>
      {types.length === 0 ? <EmptyState eyebrow={fr.types.title} title={fr.types.empty} /> : (
        <Table>
          <thead><tr><Th>{fr.types.name}</Th><Th>{fr.types.key}</Th><Th>{fr.types.category}</Th><Th>{fr.types.views}</Th><Th>{fr.builder.edit}</Th></tr></thead>
          <tbody>{types.map((t) => (
            <tr key={t.key}>
              <Td>{t.name} {t.builtin && <Tag>{t.modified ? fr.types.modified : fr.types.builtin}</Tag>}</Td>
              <Td mono>{t.key}</Td>
              <Td>{categoryLabel(t.category)}</Td>
              <Td>{t.defaultViews.map((v) => (fr.types.viewNames as Record<string, string>)[v] ?? v).join(', ')}</Td>
              <Td>
                <div className="ath-row">
                  <Btn size="sm" variant="ghost" aria-label={`${fr.types.edit} ${t.name}`} onClick={() => startEdit(t)}>{fr.types.edit}</Btn>
                  {(!t.builtin || t.modified) && <Btn size="sm" variant="ghost" aria-label={`${t.builtin ? fr.types.reset : fr.types.delete} ${t.name}`} onClick={() => remove(t)}>{t.builtin ? fr.types.reset : fr.types.delete}</Btn>}
                </div>
              </Td>
            </tr>
          ))}</tbody>
        </Table>
      )}
      <Card title={editing ? fr.types.editing(draft.name) : fr.types.create}>
        <form className="ath-stack" onSubmit={submit}>
          <div className="ath-toolbar">
            <Field label={fr.types.key} value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} mono readOnly={editing !== null} />
            <Field label={fr.types.name} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Field label={fr.types.description} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div className="ath-field">
              <label className="ath-field__label" htmlFor="type-category">{fr.types.category}</label>
              <select id="type-category" className="ath-select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Draft['category'] })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="ath-row">
            <legend className="ath-field__label">{fr.types.views}</legend>
            {VIEWS.map((v) => (
              <label key={v} className="ath-row"><input type="checkbox" checked={draft.defaultViews.includes(v)} onChange={(e) => toggleView(v, e.target.checked)} />{(fr.types.viewNames as Record<string, string>)[v]}</label>
            ))}
          </fieldset>
          <span className="ath-eyebrow">{fr.types.baseFields}</span>
          <div className="ath-row">{draft.baseFields.map((f) => (
            <span key={f.key} className="ath-row">
              <Tag>{f.label} <span className="ath-mono">{f.key}</span></Tag>
              <Btn icon="trash" type="button" size="sm" variant="ghost" aria-label={`${fr.types.removeField} ${f.key}`} onClick={() => setDraft({ ...draft, baseFields: draft.baseFields.filter((x) => x.key !== f.key) })}>{fr.types.removeField}</Btn>
            </span>
          ))}</div>
          <div className="ath-toolbar">
            <Field label={fr.types.fieldKey} value={field.key} onChange={(e) => setField({ ...field, key: e.target.value })} mono />
            <Field label={fr.types.fieldLabel} value={field.label} onChange={(e) => setField({ ...field, label: e.target.value })} />
            <div className="ath-field">
              <label className="ath-field__label" htmlFor="type-field-type">{fr.types.fieldType}</label>
              <select id="type-field-type" className="ath-select" value={field.type} onChange={(e) => setField({ ...field, type: e.target.value })}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            <Btn type="button" icon="plus" disabled={fieldInvalid} onClick={addField}>{fr.types.addField}</Btn>
          </div>
          <div className="ath-row">
            <Btn icon="save" type="submit" loading={busy} disabled={invalid}>{editing ? fr.types.save : fr.types.create}</Btn>
            {editing && <Btn icon="close" type="button" variant="ghost" onClick={stopEdit}>{fr.types.cancel}</Btn>}
          </div>
        </form>
      </Card>
    </div>
  );
}
