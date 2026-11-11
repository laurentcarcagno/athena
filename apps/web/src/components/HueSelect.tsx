import { HUES, Select, StatusPill, type Hue } from '@athena/ui';
import { fr } from '../i18n';
import { statusPill } from '../lib/status';

/**
 * Teinte d'un statut (T-0138) : l'administration choisit un nom dans la liste, jamais un code couleur ; la pastille montre
 * aussitôt le rendu dans le thème courant. « Couleur de la catégorie » efface la teinte.
 */
export function HueSelect({ status, onChange }: { status: { key: string; name: string; category: string; color?: string | null }; onChange: (hue: Hue | null) => void }) {
  const id = `hue-${status.key}`;
  return (
    <div className="ath-row">
      <StatusPill {...statusPill(status.category, status.color)}>{status.name}</StatusPill>
      <label className="ath-visually-hidden" htmlFor={id}>{fr.hues.label(status.name)}</label>
      <Select id={id} value={status.color ?? ''} onChange={(e) => onChange(e.target.value ? (e.target.value as Hue) : null)}>
        <option value="">{fr.hues.category}</option>
        {HUES.map((h) => <option key={h} value={h}>{fr.hues.names[h]}</option>)}
      </Select>
    </div>
  );
}
