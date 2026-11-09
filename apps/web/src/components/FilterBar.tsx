import { useEffect, useState, type FormEvent } from 'react';
import { Btn, Field, FilterChip } from '@athena/ui';
import type { TrackerDefinition } from '../api';
import { fr } from '../i18n';
import { emptyModel, fromAtql, isEmpty, toAtql, type FilterModel } from '../lib/filter-query';

/**
 * Barre de filtres du tracker : puces (état, assigné à moi, champs à liste, texte) et bascule vers la requête ATQL.
 * Le fragment ATQL est la seule source de vérité : les puces le lisent (`fromAtql`) et le réécrivent (`toAtql`).
 */
export function FilterBar({ def, fragment, username, onChange, error }: {
  def: TrackerDefinition | null; fragment: string; username: string; onChange: (fragment: string) => void; error?: string | null;
}) {
  const model = fromAtql(fragment, username);
  const [mode, setMode] = useState<'chips' | 'atql'>('chips');
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

  return (
    <div className="ath-stack" role="search" aria-label={fr.filters.bar}>
      {showChips && model ? (
        <div className="ath-toolbar">
          {hasAssignee && (
            <label className="ath-row"><input type="checkbox" checked={!!model.mine} onChange={(e) => update({ ...model, mine: e.target.checked })} />{fr.filters.mine}</label>
          )}
          <label className="ath-row"><input type="checkbox" checked={!!model.suspect} onChange={(e) => update({ ...model, suspect: e.target.checked })} />{fr.filters.suspect}</label>
          {selects.map((f) => (
            <div key={f.key} className="ath-field">
              <label className="ath-field__label" htmlFor={`flt-${f.key}`}>{f.label}</label>
              <select id={`flt-${f.key}`} className="ath-select" value={model.fields[f.key] ?? ''} onChange={(e) => withField(f.key, e.target.value)}>
                <option value="">{fr.filters.all}</option>
                {(f.config['options'] as string[]).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <form className="ath-row" onSubmit={submitText}>
            <Field label={fr.filters.text} value={text} onChange={(e) => setText(e.target.value)} />
            <Btn icon="check" type="submit" variant="ghost" size="sm">{fr.filters.apply}</Btn>
          </form>
        </div>
      ) : (
        <form className="ath-toolbar" onSubmit={submitAtql}>
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="flt-atql">{fr.filters.atqlLabel}</label>
            <input id="flt-atql" className="ath-input ath-mono" size={60} value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" placeholder={fr.filters.atqlPlaceholder} />
          </div>
          <Btn type="submit">{fr.list.run}</Btn>
        </form>
      )}
      {model === null && <p className="ath-eyebrow">{fr.filters.notRepresentable}</p>}
      {error && <p role="alert" className="ath-field__error">{error}</p>}
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
        <Btn type="button" variant="ghost" size="sm" aria-pressed={!showChips} disabled={model === null}
          onClick={() => setMode(showChips ? 'atql' : 'chips')}>{showChips ? fr.filters.atqlMode : fr.filters.chipsMode}</Btn>
      </div>
    </div>
  );
}
