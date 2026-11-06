import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Field, Tag, useToast } from '@athena/ui';
import { api, type SavedFilter } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { joinOrder, splitOrder } from '../pages/ListPage';
import { useConfirm } from './ConfirmDialog';

export interface ViewState { fragment: string; sort: string | null }

/** Fragment + tri → requête enregistrée (`query` d'un filtre), et inversement. */
export function toStored(view: ViewState): string {
  const [field, dir] = view.sort ? view.sort.split(':') : [null, null];
  return joinOrder(view.fragment, field ? { field, dir: dir! } : null);
}
export function fromStored(query: string): ViewState {
  const { where, order } = splitOrder(query);
  return { fragment: where, sort: order ? `${order.field}:${order.dir}` : null };
}

/**
 * Vues enregistrées d'un tracker : personnelles, partagées avec le projet, et une vue par défaut choisie par un responsable.
 * `onDefaultLoaded` reçoit la vue par défaut pour que l'écran l'applique à la première visite.
 */
export function SavedViews({ project, tracker, current, roles, onApply, onLoaded }: {
  project: string; tracker: string; current: ViewState; roles: string[]; onApply: (view: ViewState) => void; onLoaded?: (views: SavedFilter[]) => void;
}) {
  const toast = useToast();
  const fail = useFailure();
  const confirm = useConfirm();
  const [views, setViews] = useState<SavedFilter[]>([]);
  const [form, setForm] = useState<{ open: boolean; name: string; shared: boolean; isDefault: boolean }>({ open: false, name: '', shared: false, isDefault: false });
  const manager = roles.includes('athena-admin') || roles.includes('athena-pm');
  const base = `/v1/projects/${project}/filters`;
  const load = useCallback(async () => {
    const list = await api<SavedFilter[]>('GET', `${base}?tracker=${tracker}`);
    const safe = Array.isArray(list) ? list : [];
    setViews(safe);
    onLoaded?.(safe);
  }, [base, tracker, onLoaded]);
  useEffect(() => { load().catch(() => setViews([])); }, [load]);

  const stored = toStored(current);
  const active = views.find((v) => v.query === stored);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', base, { name: form.name, query: stored, trackerKey: tracker, shared: form.shared || form.isDefault, ...(form.isDefault ? { isDefault: true } : {}) });
      toast('success', fr.filters.viewSaved);
      setForm({ open: false, name: '', shared: false, isDefault: false });
      await load();
    } catch (error) { fail(error); }
  };
  const remove = async (view: SavedFilter) => {
    if (!(await confirm.ask({ title: fr.filters.deleteViewTitle(view.name), body: fr.filters.deleteViewBody, confirm: fr.confirm.delete }))) return;
    try { await api('DELETE', `${base}/${view.id}`); toast('success', fr.filters.viewDeleted); await load(); } catch (error) { fail(error); }
  };
  const setDefault = async (view: SavedFilter, isDefault: boolean) => {
    try { await api('PATCH', `${base}/${view.id}`, { isDefault }); toast('success', isDefault ? fr.filters.defaultSet : fr.filters.defaultUnset); await load(); } catch (error) { fail(error); }
  };

  return (
    <div className="ath-stack">
      {confirm.dialog}
      <div className="ath-toolbar">
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="saved-views">{fr.filters.views}</label>
          <select id="saved-views" className="ath-select" value={active?.id ?? ''} onChange={(e) => { const v = views.find((x) => x.id === e.target.value); onApply(v ? fromStored(v.query) : { fragment: '', sort: null }); }}>
            <option value="">{fr.filters.noView}</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}{v.shared ? ' ⇄' : ''}{v.isDefault ? ` · ${fr.filters.defaultTag}` : ''}</option>)}
          </select>
        </div>
        {active?.isDefault && <Tag>{fr.filters.defaultTag}</Tag>}
        {active && <Btn type="button" variant="ghost" size="sm" onClick={() => remove(active)}>{fr.filters.deleteView}</Btn>}
        {active && manager && active.shared && <Btn type="button" variant="ghost" size="sm" onClick={() => setDefault(active, !active.isDefault)}>{active.isDefault ? fr.filters.unsetDefault : fr.filters.makeDefault}</Btn>}
        {!active && stored !== '' && <Btn type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, open: true })}>{fr.filters.saveView}</Btn>}
      </div>
      {form.open && (
        <form className="ath-toolbar" onSubmit={save}>
          <Field label={fr.filters.viewName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="ath-row"><input type="checkbox" checked={form.shared || form.isDefault} disabled={form.isDefault} onChange={(e) => setForm({ ...form, shared: e.target.checked })} />{fr.filters.sharedView}</label>
          {manager && <label className="ath-row"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />{fr.filters.defaultView}</label>}
          <Btn type="submit" disabled={!form.name.trim()}>{fr.filters.saveView}</Btn>
          <Btn type="button" variant="ghost" onClick={() => setForm({ open: false, name: '', shared: false, isDefault: false })}>{fr.builder.cancel}</Btn>
        </form>
      )}
    </div>
  );
}
