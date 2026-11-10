import { useState } from 'react';
import { Btn, Checkbox } from '@athena/ui';
import { fr } from '../i18n';
import type { ColumnOption } from '../lib/columns';

/** Choix des colonnes du tableau : la clé de l'item est toujours affichée. */
export function ColumnPicker({ options, selected, onChange }: { options: ColumnOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string, on: boolean) => onChange(options.map((o) => o.id).filter((x) => (x === id ? on : selected.includes(x))));
  return (
    <div className="ath-colpicker">
      <Btn type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>{fr.columns.button}</Btn>
      {open && (
        <fieldset className="ath-row">
          <legend className="ath-field__label">{fr.columns.legend}</legend>
          {options.map((o) => (
            <label key={o.id} className="ath-row"><Checkbox checked={selected.includes(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />{o.label}</label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
