import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Checkbox, Field, Radio, Select, Switch, Textarea } from './components';

/** T-0133 : contrôles de formulaire de la charte. */
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
const controls = read('styles/controls.css');

describe('contrôles de formulaire', () => {
  it('Select, Textarea, Checkbox, Radio, Switch rendent l’élément natif avec la classe de la charte', () => {
    render(<>
      <label>Liste<Select defaultValue="b"><option value="a">A</option><option value="b">B</option></Select></label>
      <label>Texte<Textarea defaultValue="x" invalid /></label>
      <label><Checkbox defaultChecked />Case</label>
      <label><Radio name="r" />Radio</label>
      <label><Switch />Interrupteur</label>
    </>);
    expect(screen.getByLabelText('Liste')).toHaveClass('ath-select');
    expect(screen.getByLabelText('Liste')).toHaveValue('b');
    expect(screen.getByLabelText('Texte')).toHaveClass('ath-input', 'ath-textarea', 'ath-input--error');
    expect(screen.getByLabelText('Texte')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Case')).toHaveClass('ath-checkbox');
    expect(screen.getByLabelText('Case')).toBeChecked();
    expect(screen.getByLabelText('Radio')).toHaveAttribute('type', 'radio');
    expect(screen.getByRole('switch', { name: 'Interrupteur' })).toHaveClass('ath-switch');
  });

  it('un champ en lecture seule garde sa valeur, porte un cadenas et dit pourquoi', async () => {
    render(<Field label="Clé" value="REQ" readOnly readOnlyReason="Fixée à la création." />);
    const input = screen.getByLabelText('Clé');
    expect(input).toHaveValue('REQ');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAccessibleDescription('Fixée à la création.');
    expect(input.closest('.ath-field')).toHaveClass('ath-field--readonly');
    expect(input.closest('.ath-field')).toHaveAttribute('title', 'Fixée à la création.');
    expect(document.querySelector('.ath-field__label .ath-lock')).not.toBeNull();
    await userEvent.type(input, 'X');
    expect(input).toHaveValue('REQ');
  });

  it('champ, liste, recherche et bouton partagent la hauteur de contrôle ; un seul anneau de focus', () => {
    expect(controls).toMatch(/\.ath-input, \.ath-select \{[^}]*height: var\(--ath-size-control-md\)/);
    expect(controls).toMatch(/\.ath-search \{[^}]*height: var\(--ath-size-control-md\)/);
    expect(controls).toMatch(/\.ath-btn \{[^}]*height: var\(--ath-size-control-md\)/);
    expect(controls).toMatch(/\.ath-input:focus-visible, \.ath-select:focus-visible, \.ath-checkbox:focus-visible, \.ath-radio:focus-visible, \.ath-switch:focus-visible \{[^}]*outline: var\(--ath-border-width-strong\) solid var\(--ath-focus-ring\)/);
    expect(controls).toMatch(/\.ath-input:disabled, \.ath-select:disabled \{[^}]*cursor: not-allowed/);
    expect(controls).toMatch(/\.ath-input\[readonly\][^{]*\{[^}]*border-color: transparent/);
  });
});
