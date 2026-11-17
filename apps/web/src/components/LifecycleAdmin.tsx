import { useCallback, useEffect, useState } from 'react';
import { Btn, Checkbox, Field, Select, Table, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

export const CATEGORIES = ['pipeline', 'active', 'suspended', 'closed', 'cancelled', 'archived'] as const;
export interface LcState { key: string; name: string; category: (typeof CATEGORIES)[number]; hidden: boolean }
export interface LcTransition { from: string; to: string; roles: Array<'manager' | 'pmo'> }
interface LcConfig { states: LcState[]; transitions: LcTransition[]; customized: boolean }

/** Administration › Cycle de vie : états (renommer, masquer, ajouter) et transitions permises, avec leurs rôles (lot 17, B11). */
export function LifecycleAdminTab() {
  const t = fr.lifecycle;
  const fail = useFailure();
  const toast = useToast();
  const [cfg, setCfg] = useState<LcConfig | null>(null);
  const [draft, setDraft] = useState({ key: '', name: '', category: 'active' as LcState['category'] });
  const [edge, setEdge] = useState({ from: '', to: '' });
  const load = useCallback(() => { api<LcConfig>('GET', '/v1/lifecycle').then(setCfg).catch(fail); }, [fail]);
  useEffect(load, [load]);
  if (!cfg) return <p role="status">{fr.loading}</p>;

  const name = (key: string) => cfg.states.find((s) => s.key === key)?.name ?? key;
  const patchState = (key: string, change: Partial<LcState>) => setCfg({ ...cfg, states: cfg.states.map((s) => (s.key === key ? { ...s, ...change } : s)) });
  const patchEdge = (e: LcTransition, roles: LcTransition['roles']) => setCfg({ ...cfg, transitions: cfg.transitions.map((x) => (x === e ? { ...x, roles } : x)) });
  const addState = () => {
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(draft.key) || !draft.name.trim() || cfg.states.some((s) => s.key === draft.key)) return;
    setCfg({ ...cfg, states: [...cfg.states, { key: draft.key, name: draft.name.trim(), category: draft.category, hidden: false }] });
    setDraft({ key: '', name: '', category: 'active' });
  };
  const addEdge = () => {
    if (!edge.from || !edge.to || edge.from === edge.to || cfg.transitions.some((x) => x.from === edge.from && x.to === edge.to)) return;
    setCfg({ ...cfg, transitions: [...cfg.transitions, { from: edge.from, to: edge.to, roles: ['pmo'] }] });
    setEdge({ from: '', to: '' });
  };
  const save = async () => {
    try {
      setCfg(await api<LcConfig>('PUT', '/v1/admin/lifecycle', { states: cfg.states.map(({ key, name: n, category, hidden }) => ({ key, name: n, category, hidden })), transitions: cfg.transitions }));
      toast('success', t.saved);
    } catch (error) { fail(error); }
  };
  const reset = async () => { try { setCfg(await api<LcConfig>('DELETE', '/v1/admin/lifecycle')); toast('success', t.resetDone); } catch (error) { fail(error); } };

  return (
    <div className="ath-stack">
      <section className="ath-stack" aria-label={t.states}>
        <h2 className="ath-section-title">{t.states}</h2>
        <p>{t.help}</p>
        <Table caption={t.states}>
          <thead><tr><th scope="col" className="ath-th">{t.key}</th><th scope="col" className="ath-th">{t.name}</th><th scope="col" className="ath-th">{t.category}</th><th scope="col" className="ath-th">{t.hidden}</th></tr></thead>
          <tbody>
            {cfg.states.map((s) => (
              <tr key={s.key}>
                <td className="ath-mono">{s.key}</td>
                <td><Field label={`${t.name} ${s.key}`} value={s.name} maxLength={60} onChange={(e) => patchState(s.key, { name: e.target.value })} /></td>
                <td>{t.categories[s.category]}</td>
                <td><Checkbox aria-label={`${t.hidden} ${s.name}`} checked={s.hidden} onChange={(e) => patchState(s.key, { hidden: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="ath-toolbar">
          <Field label={t.key} mono value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
          <Field label={t.name} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <label className="ath-field__label" htmlFor="lc-cat">{t.category}</label>
          <Select id="lc-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as LcState['category'] })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t.categories[c]}</option>)}
          </Select>
          <Btn type="button" variant="ghost" onClick={addState}>{t.addState}</Btn>
        </div>
      </section>
      <section className="ath-stack" aria-label={t.transitions}>
        <h2 className="ath-section-title">{t.transitions}</h2>
        <Table caption={t.transitions}>
          <thead><tr><th scope="col" className="ath-th">{t.from}</th><th scope="col" className="ath-th">{t.to}</th><th scope="col" className="ath-th">{t.roles}</th><th scope="col" className="ath-th">{t.remove}</th></tr></thead>
          <tbody>
            {cfg.transitions.map((e) => (
              <tr key={`${e.from}>${e.to}`}>
                <td>{name(e.from)}</td><td>{name(e.to)}</td>
                <td>
                  {(['manager', 'pmo'] as const).map((r) => (
                    <label key={r} className="ath-notify__pref">
                      <Checkbox checked={e.roles.includes(r)} onChange={(ev) => patchEdge(e, ev.target.checked ? [...e.roles, r] : e.roles.filter((x) => x !== r))} />
                      {t.roleNames[r]}
                    </label>
                  ))}
                </td>
                <td><Btn type="button" variant="ghost" size="sm" onClick={() => setCfg({ ...cfg, transitions: cfg.transitions.filter((x) => x !== e) })}>{t.remove}</Btn></td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="ath-toolbar">
          <label className="ath-field__label" htmlFor="lc-from">{t.from}</label>
          <Select id="lc-from" value={edge.from} onChange={(e) => setEdge({ ...edge, from: e.target.value })}><option value="" />{cfg.states.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</Select>
          <label className="ath-field__label" htmlFor="lc-to">{t.to}</label>
          <Select id="lc-to" value={edge.to} onChange={(e) => setEdge({ ...edge, to: e.target.value })}><option value="" />{cfg.states.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</Select>
          <Btn type="button" variant="ghost" onClick={addEdge}>{t.addTransition}</Btn>
        </div>
        <p>{t.adminAlways}</p>
      </section>
      <div className="ath-toolbar"><Btn type="button" onClick={() => void save()}>{t.save}</Btn><Btn type="button" variant="ghost" disabled={!cfg.customized} onClick={() => void reset()}>{t.reset}</Btn></div>
    </div>
  );
}
