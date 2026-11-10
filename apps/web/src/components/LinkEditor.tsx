import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Btn, Field, Id, StatusPill, Tag, useToast } from '@athena/ui';
import { api, type SearchResult } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { fromHere } from '../lib/origin';
import { useConfirm } from './ConfirmDialog';

export interface LinkRow { id: string; type: string; direction: string; label: string; other: string | null; restricted?: boolean; suspect: boolean; hierarchical?: boolean; propagatesSuspect?: boolean }

/** Groupes de relations de la fiche, dans l'ordre d'affichage (T-0113). */
export const RELATION_GROUPS = ['parent', 'children', 'blocks', 'blockedBy', 'duplicates', 'traceability', 'related'] as const;
export type RelationGroup = typeof RELATION_GROUPS[number];

/**
 * Groupe d'un lien, déduit des propriétés de son type : hiérarchique (sortant = parent, entrant = enfant), `blocks`,
 * `duplicates`, puis traçabilité (le type propage la suspicion) ; le reste est « Relié à ».
 */
export function relationGroup(link: LinkRow): RelationGroup {
  const out = link.direction === 'outward';
  if (link.hierarchical) return out ? 'parent' : 'children';
  if (link.type === 'blocks') return out ? 'blocks' : 'blockedBy';
  if (link.type === 'duplicates') return 'duplicates';
  return link.propagatesSuspect ? 'traceability' : 'related';
}
interface LinkType { key: string; outwardLabel: string; inwardLabel: string; hierarchical: boolean }
interface Suggestion { key: string; title: string }

/**
 * Onglet Liens d'un item : liste typée (dans les deux sens), acquittement d'un lien suspect, suppression avec confirmation
 * et création (type puis item cible, avec autocomplétion par clé ou titre).
 */
export function LinkEditor({ project, itemKey, links, onChanged, focusSignal = 0 }: { project: string; itemKey: string; links: LinkRow[]; onChanged: () => void | Promise<void>; focusSignal?: number }) {
  const toast = useToast();
  const fail = useFailure();
  const confirm = useConfirm();
  const location = useLocation();
  const [types, setTypes] = useState<LinkType[]>([]);
  const [choice, setChoice] = useState('');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const select = useRef<HTMLSelectElement>(null);
  // Raccourci L : le focus va au sélecteur de type dès qu'il existe (il n'apparaît qu'une fois les types chargés).
  const handled = useRef(0);
  useEffect(() => {
    if (focusSignal > handled.current && select.current) { select.current.focus(); handled.current = focusSignal; }
  }, [focusSignal, types.length]);

  useEffect(() => { api<LinkType[]>('GET', `/v1/projects/${project}/link-types`).then((t) => setTypes(Array.isArray(t) ? t : [])).catch(() => setTypes([])); }, [project]);
  // Autocomplétion : clé exacte, début de clé ou titre ; l'item lui-même est exclu.
  useEffect(() => {
    const q = query.trim().replace(/["\\]/g, '');
    if (q.length < 2 || q === target) { setSuggestions([]); return undefined; }
    const timer = setTimeout(() => {
      api<SearchResult>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent(`key = "${q}" OR key ~ "${q}" OR title ~ "${q}"`)}&limit=8`)
        .then((r) => setSuggestions(r.hits.filter((h) => h.key !== itemKey).map((h) => ({ key: h.key, title: String(h.values['title'] ?? h.values['name'] ?? '') }))))
        .catch(() => setSuggestions([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [query, target, project, itemKey]);

  const options = types.flatMap((t) => [
    { value: `${t.key}:out`, label: t.outwardLabel }, ...(t.inwardLabel === t.outwardLabel ? [] : [{ value: `${t.key}:in`, label: t.inwardLabel }]),
  ]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const [type, direction] = choice.split(':');
    try {
      // « Cet item vérifie la cible » crée le lien depuis cet item ; « est vérifié par » le crée depuis la cible.
      if (direction === 'in') await api('POST', `/v1/projects/${project}/artifacts/${target}/links`, { to: itemKey, type });
      else await api('POST', `/v1/projects/${project}/artifacts/${itemKey}/links`, { to: target, type });
      toast('success', fr.links.created);
      setTarget(''); setQuery(''); setSuggestions([]);
      await onChanged();
    } catch (error) { fail(error); }
  };
  const remove = async (row: LinkRow) => {
    if (!(await confirm.ask({ title: fr.links.deleteTitle(row.label, row.other ?? fr.marking.restrictedLink), body: fr.links.deleteBody, confirm: fr.confirm.delete }))) return;
    try { await api('DELETE', `/v1/projects/${project}/links/${row.id}`); toast('success', fr.links.removed); await onChanged(); } catch (error) { fail(error); }
  };
  const acknowledge = async (row: LinkRow) => {
    try { await api('POST', `/v1/projects/${project}/links/${row.id}/clear-suspect`); toast('success', fr.links.acknowledged); await onChanged(); } catch (error) { fail(error); }
  };

  return (
    <div className="ath-stack">
      {confirm.dialog}
      {links.length === 0 ? <p>{fr.artifact.noLinks}</p> : (
        <div className="ath-stack" role="group" aria-label={fr.relations.label}>
          {RELATION_GROUPS.map((group) => {
            const rows = links.filter((l) => relationGroup(l) === group);
            if (rows.length === 0) return null;
            return (
              <section key={group} aria-labelledby={`rel-${group}`}>
                <h4 id={`rel-${group}`} className="ath-label">{fr.relations[group]} <Id>{rows.length}</Id></h4>
                <ul className="ath-stack" aria-label={fr.relations[group]}>
                  {rows.map((l) => (
                    <li key={l.id} className="ath-row">
                      <span>{l.label}</span> {l.other === null ? <Tag variant="ghost">{fr.marking.restrictedLink}</Tag> : <Link className="ath-link ath-mono" to={`/p/${project}/a/${l.other}`} state={fromHere(location, itemKey)}>{l.other}</Link>}
                      {l.suspect && <StatusPill kind="warning">{fr.artifact.suspect}</StatusPill>}
                      {l.suspect && <Btn size="sm" variant="ghost" aria-label={`${fr.links.acknowledge} ${l.other ?? fr.marking.restrictedLink}`} onClick={() => acknowledge(l)}>{fr.links.acknowledge}</Btn>}
                      <Btn icon="trash" size="sm" variant="ghost" aria-label={l.other === null ? fr.marking.restrictedUnlink : `${fr.links.unlink} ${l.other}`} onClick={() => remove(l)}>{fr.links.unlink}</Btn>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {types.length === 0 ? <p className="ath-eyebrow">{fr.links.noTypes}</p> : (
        <form className="ath-toolbar" onSubmit={create}>
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="link-type">{fr.links.type}</label>
            <select id="link-type" ref={select} className="ath-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="" />
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="ath-field ath-suggest">
            <Field label={fr.links.target} mono value={query} autoComplete="off" onChange={(e) => { setQuery(e.target.value); setTarget(''); }} />
            {suggestions.length > 0 && (
              <ul className="ath-suggest__list" aria-label={fr.links.results}>
                {suggestions.map((s) => (
                  <li key={s.key}>
                    <button type="button" className="ath-suggest__item" onClick={() => { setTarget(s.key); setQuery(s.key); setSuggestions([]); }}>
                      <span className="ath-mono">{s.key}</span> <span className="ath-suggest__label">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Btn type="submit" disabled={!choice || !target}>{fr.links.link}</Btn>
        </form>
      )}
    </div>
  );
}
