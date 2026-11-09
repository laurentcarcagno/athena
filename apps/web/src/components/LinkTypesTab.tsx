import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Card, EmptyState, Field, Table, Tag, Td, Th, useToast } from '@athena/ui';
import { api, type TrackerTypeEntry } from '../api';
import { useBusy, useFailure } from '../hooks';
import { fr } from '../i18n';
import { useConfirm } from './ConfirmDialog';

export interface OrgLinkType { key: string; outwardLabel: string; inwardLabel: string; hierarchical: boolean; propagatesSuspect: boolean; pairs: Array<{ from: string; to: string }>; builtin: boolean; modified: boolean }
interface Draft { key: string; outwardLabel: string; inwardLabel: string; hierarchical: boolean; propagatesSuspect: boolean; pairs: Array<{ from: string; to: string }> }
const blank = (): Draft => ({ key: '', outwardLabel: '', inwardLabel: '', hierarchical: false, propagatesSuspect: true, pairs: [] });
const KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** Types de liens de l'organisation et paires de types de tracker qu'ils relient (administrateurs). */
export function LinkTypesTab() {
  const toast = useToast();
  const fail = useFailure();
  const confirm = useConfirm();
  const { busy, guard } = useBusy();
  const [items, setItems] = useState<OrgLinkType[]>([]);
  const [trackerTypes, setTrackerTypes] = useState<TrackerTypeEntry[]>([]);
  const [draft, setDraft] = useState<Draft>(blank());
  const [editing, setEditing] = useState<string | null>(null);
  const [pair, setPair] = useState({ from: '', to: '' });
  const load = useCallback(async () => setItems(await api<OrgLinkType[]>('GET', '/v1/link-types')), []);
  useEffect(() => {
    load().catch(fail);
    api<TrackerTypeEntry[]>('GET', '/v1/tracker-types').then((t) => setTrackerTypes(Array.isArray(t) ? t : [])).catch(() => setTrackerTypes([]));
  }, [load, fail]);

  const nameOf = (key: string) => trackerTypes.find((t) => t.key === key)?.name ?? key;
  const startEdit = (t: OrgLinkType) => { setEditing(t.key); setDraft({ key: t.key, outwardLabel: t.outwardLabel, inwardLabel: t.inwardLabel, hierarchical: t.hierarchical, propagatesSuspect: t.propagatesSuspect, pairs: t.pairs.map((p) => ({ ...p })) }); };
  const stopEdit = () => { setEditing(null); setDraft(blank()); setPair({ from: '', to: '' }); };
  const body = () => ({ outwardLabel: draft.outwardLabel, inwardLabel: draft.inwardLabel, hierarchical: draft.hierarchical, propagatesSuspect: draft.propagatesSuspect, pairs: draft.pairs });
  const submit = (event: FormEvent) => { event.preventDefault(); void guard(async () => {
    try {
      if (editing) await api('PUT', `/v1/link-types/${editing}`, body());
      else await api('POST', '/v1/link-types', { key: draft.key, ...body() });
      toast('success', editing ? fr.linkTypes.saved : fr.linkTypes.created);
      stopEdit();
      await load();
    } catch (error) { fail(error); }
  }); };
  const remove = async (t: OrgLinkType) => {
    const ok = await confirm.ask(t.builtin
      ? { title: fr.linkTypes.resetTitle(t.key), body: fr.linkTypes.resetBody, confirm: fr.types.reset }
      : { title: fr.linkTypes.deleteTitle(t.key), body: fr.linkTypes.deleteBody, confirm: fr.types.delete });
    if (!ok) return;
    try { await api('DELETE', `/v1/link-types/${t.key}`); toast('success', t.builtin ? fr.linkTypes.resetDone : fr.linkTypes.deleted); await load(); } catch (error) { fail(error); }
  };
  const addPair = () => { setDraft({ ...draft, pairs: [...draft.pairs, { ...pair }] }); setPair({ from: '', to: '' }); };
  const pairInvalid = !pair.from || !pair.to || draft.pairs.some((p) => p.from === pair.from && p.to === pair.to);
  const invalid = (!editing && !KEY.test(draft.key)) || !draft.outwardLabel.trim() || !draft.inwardLabel.trim();

  return (
    <div className="ath-stack">
      {confirm.dialog}
      <p className="ath-eyebrow">{fr.linkTypes.note}</p>
      {items.length === 0 ? <EmptyState eyebrow={fr.linkTypes.title} title={fr.linkTypes.empty} /> : (
        <Table>
          <thead><tr><Th>{fr.types.key}</Th><Th>{fr.linkTypes.outward}</Th><Th>{fr.linkTypes.inward}</Th><Th>{fr.linkTypes.pairs}</Th><Th>{fr.builder.edit}</Th></tr></thead>
          <tbody>{items.map((t) => (
            <tr key={t.key}>
              <Td mono>{t.key} {t.builtin && <Tag>{t.modified ? fr.types.modified : fr.types.builtin}</Tag>} {t.hierarchical && <Tag>{fr.linkTypes.hierarchical}</Tag>} {!t.propagatesSuspect && <Tag>{fr.suspicion.noPropagation}</Tag>}</Td>
              <Td>{t.outwardLabel}</Td>
              <Td>{t.inwardLabel}</Td>
              <Td>{t.pairs.length === 0 ? fr.linkTypes.anyPair : t.pairs.map((p) => `${nameOf(p.from)} → ${nameOf(p.to)}`).join(' ; ')}</Td>
              <Td>
                <div className="ath-row">
                  <Btn size="sm" variant="ghost" aria-label={`${fr.types.edit} ${t.key}`} onClick={() => startEdit(t)}>{fr.types.edit}</Btn>
                  {(!t.builtin || t.modified) && <Btn size="sm" variant="ghost" aria-label={`${t.builtin ? fr.types.reset : fr.types.delete} ${t.key}`} onClick={() => remove(t)}>{t.builtin ? fr.types.reset : fr.types.delete}</Btn>}
                </div>
              </Td>
            </tr>
          ))}</tbody>
        </Table>
      )}
      <Card title={editing ? fr.linkTypes.editing(editing) : fr.linkTypes.create}>
        <form className="ath-stack" onSubmit={submit}>
          <div className="ath-toolbar">
            <Field label={fr.linkTypes.key} value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} mono readOnly={editing !== null} />
            <Field label={fr.linkTypes.outward} value={draft.outwardLabel} onChange={(e) => setDraft({ ...draft, outwardLabel: e.target.value })} />
            <Field label={fr.linkTypes.inward} value={draft.inwardLabel} onChange={(e) => setDraft({ ...draft, inwardLabel: e.target.value })} />
            <label className="ath-row"><input type="checkbox" checked={draft.hierarchical} onChange={(e) => setDraft({ ...draft, hierarchical: e.target.checked })} />{fr.linkTypes.hierarchical}</label>
            <label className="ath-row"><input type="checkbox" checked={draft.propagatesSuspect} onChange={(e) => setDraft({ ...draft, propagatesSuspect: e.target.checked })} />{fr.suspicion.propagates}</label>
          </div>
          <span className="ath-eyebrow">{fr.linkTypes.pairsHelp}</span>
          <ul className="ath-taglist" aria-label={fr.linkTypes.pairs}>
            {draft.pairs.map((p) => (
              <li key={`${p.from}>${p.to}`} className="ath-row">
                <Tag>{nameOf(p.from)} → {nameOf(p.to)}</Tag>
                <Btn icon="trash" type="button" size="sm" variant="ghost" aria-label={`${fr.types.removeField} ${nameOf(p.from)} → ${nameOf(p.to)}`} onClick={() => setDraft({ ...draft, pairs: draft.pairs.filter((x) => x !== p) })}>{fr.types.removeField}</Btn>
              </li>
            ))}
          </ul>
          <div className="ath-toolbar">
            {(['from', 'to'] as const).map((side) => (
              <div key={side} className="ath-field">
                <label className="ath-field__label" htmlFor={`pair-${side}`}>{side === 'from' ? fr.linkTypes.fromType : fr.linkTypes.toType}</label>
                <select id={`pair-${side}`} className="ath-select" value={pair[side]} onChange={(e) => setPair({ ...pair, [side]: e.target.value })}>
                  <option value="" />
                  {trackerTypes.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
              </div>
            ))}
            <Btn type="button" icon="plus" disabled={pairInvalid} onClick={addPair}>{fr.linkTypes.addPair}</Btn>
          </div>
          <div className="ath-row">
            <Btn icon="save" type="submit" loading={busy} disabled={invalid}>{editing ? fr.types.save : fr.linkTypes.create}</Btn>
            {editing && <Btn icon="close" type="button" variant="ghost" onClick={stopEdit}>{fr.types.cancel}</Btn>}
          </div>
        </form>
      </Card>
    </div>
  );
}
