import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Btn, FilterChip, Select } from '@athena/ui';
import type { TrackerDefinition } from '../api';
import { fr } from '../i18n';
import { emptyModel, fromAtql, isEmpty, toAtql, type FilterModel } from '../lib/filter-query';

/**
 * Barre de filtres du tracker (ADR-0005 § 2.2, T-0147) : une seule rangée. Recherche (Entrée), listes, puces « Assignés à moi »
 * et « Liens suspects », puis à droite les réglages de vue (`extras` : vue enregistrée, colonnes) et « Requête avancée ».
 * Sur téléphone, la recherche reste visible et « Filtres » déplie le reste. Le fragment ATQL est la seule source de vérité :
 * les puces le lisent (`fromAtql`) et le réécrivent (`toAtql`).
 */
export function FilterBar({ def, fragment, username, onChange, error, extras }: {
  def: TrackerDefinition | null; fragment: string; username: string; onChange: (fragment: string) => void; error?: string | null; extras?: ReactNode;
}) {
  const model = fromAtql(fragment, username);
  const [mode, setMode] = useState<'chips' | 'atql'>('chips');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(fragment);
  const [text, setText] = useState(model?.text ?? '');
  useEffect(() => { setDraft(fragment); setText(fromAtql(fragment, username)?.text ?? ''); }, [fragment, username]);

  const showChips = mode === 'chips' && model !== null;
  const hasAssignee = def?.fields.some((f) => f.semanticRole === 'assignee') ?? false;
  const selects = (def?.fields ?? []).filter((f) => f.type === 'select' && Array.isArray(f.config['options'])).slice(0, 4);
  const update = (next: FilterModel) => onChange(toAtql(next, username));
  const withField = (key: string, value: string) => {
    const fields = { ...(model?.fields ?? {}) };
    if (value === '') delete fields[key]; else fields[key] = value;
    update({ ...(model ?? emptyModel()), fields });
  };
  const submitText = (event: FormEvent) => { event.preventDefault(); update({ ...(model ?? emptyModel()), ...(text.trim() ? { text: text.trim() } : { text: undefined }) }); };
  const submitAtql = (event: FormEvent) => { event.preventDefault(); onChange(draft.trim()); if (fromAtql(draft.trim(), username) !== null) setMode('chips'); };
  const active = model ? Number(!!model.mine) + Number(!!model.suspect) + Object.keys(model.fields).length : 0;

  return (
    <div className="ath-stack" role="search" aria-label={fr.filters.bar}>
      <div className="ath-filterbar">
        {showChips && model ? (
          <form className="ath-filterbar__search" onSubmit={submitText}>
            <input className="ath-input" aria-label={fr.filters.text} placeholder={fr.filters.searchIn(def?.name ?? '')} value={text} onChange={(e) => setText(e.target.value)} />
          </form>
        ) : (
          <form className="ath-filterbar__search ath-row" onSubmit={submitAtql}>
            <input id="flt-atql" className="ath-input ath-mono" aria-label={fr.filters.atqlLabel} value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" placeholder={fr.filters.atqlPlaceholder} />
            <Btn type="submit" size="sm">{fr.list.run}</Btn>
          </form>
        )}
        <Btn type="button" variant="ghost" className="ath-filterbar__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {active > 0 ? fr.filters.toggleCount(active) : fr.filters.toggle}
        </Btn>
        <div className="ath-filterbar__more" data-open={open}>
          {showChips && model && <>
            {selects.map((f) => (
              <Select key={f.key} id={`flt-${f.key}`} aria-label={f.label} value={model.fields[f.key] ?? ''} onChange={(e) => withField(f.key, e.target.value)}>
                <option value="">{fr.filters.allOf(f.label)}</option>
                {(f.config['options'] as string[]).map((o) => <option key={o} value={o}>{`${f.label} : ${o}`}</option>)}
              </Select>
            ))}
            {hasAssignee && <button type="button" className={model.mine ? 'ath-chip ath-chip--active' : 'ath-chip'} aria-pressed={!!model.mine} onClick={() => update({ ...model, mine: !model.mine })}>{fr.filters.mine}</button>}
            <button type="button" className={model.suspect ? 'ath-chip ath-chip--active' : 'ath-chip'} aria-pressed={!!model.suspect} onClick={() => update({ ...model, suspect: !model.suspect })}>{fr.filters.suspect}</button>
          </>}
          <span className="ath-filterbar__spacer" />
          {extras}
          <Btn type="button" variant="ghost" size="sm" aria-pressed={!showChips} disabled={model === null}
            onClick={() => setMode(showChips ? 'atql' : 'chips')}>{showChips ? fr.filters.atqlMode : fr.filters.chipsMode}</Btn>
        </div>
      </div>
      {model === null && <p className="ath-eyebrow">{fr.filters.notRepresentable}</p>}
      {error && <p role="alert" className="ath-field__error">{error}</p>}
      {((model && !isEmpty(model)) || fragment !== '') && (
        <div className="ath-row">
          {model && !isEmpty(model) && (
            <>
              {model.status && <FilterChip label={fr.list.status} value={model.status} active onClear={() => update({ ...model, status: undefined })} />}
              {model.mine && <FilterChip label={fr.filters.mine} value="" active onClear={() => update({ ...model, mine: false })} />}
              {model.suspect && <FilterChip label={fr.filters.suspect} value="" active onClear={() => update({ ...model, suspect: false })} />}
              {model.text && <FilterChip label={fr.filters.text} value={model.text} active onClear={() => update({ ...model, text: undefined })} />}
              {Object.entries(model.fields).map(([k, v]) => <FilterChip key={k} label={def?.fields.find((f) => f.key === k)?.label ?? k} value={v} active onClear={() => withField(k, '')} />)}
            </>
          )}
          {fragment !== '' && <Btn type="button" variant="ghost" size="sm" onClick={() => onChange('')}>{fr.filters.clear}</Btn>}
        </div>
      )}
    </div>
  );
}
