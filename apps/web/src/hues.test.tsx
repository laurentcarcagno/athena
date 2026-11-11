import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUES, StatusPill } from '@athena/ui';
import { describe, expect, it, vi } from 'vitest';
import { HueSelect } from './components/HueSelect';
import { statusPill } from './lib/status';

/** T-0138 : teintes nommées des statuts. */
describe('teintes des statuts', () => {
  it('sans teinte, la pastille garde la couleur de sa catégorie (écrans inchangés) ; avec une teinte, elle la prend', () => {
    expect(statusPill('done', null)).toEqual({ kind: 'success', hue: null });
    expect(statusPill('todo', undefined)).toEqual({ kind: 'info', hue: null });
    expect(statusPill('todo', 'teal')).toEqual({ kind: 'info', hue: 'teal' });
    expect(statusPill('todo', '#FF0000')).toEqual({ kind: 'info', hue: null }); // jamais un code couleur
    render(<StatusPill {...statusPill('todo', 'teal')}>Ouvert</StatusPill>);
    expect(screen.getByText('Ouvert')).toHaveClass('ath-pill', 'ath-pill--hue-teal');
  });

  it('chaque teinte a sa règle de style, tirée des jetons du thème', () => {
    const css = readFileSync(join(process.cwd(), '../../packages/ui/src/styles/controls.css'), 'utf8');
    for (const hue of HUES) expect(css).toContain(`.ath-pill--hue-${hue} { background: var(--ath-hue-${hue}-bg); color: var(--ath-hue-${hue}-fg); border-color: var(--ath-hue-${hue}-border); }`);
  });

  it('le nuancier propose la couleur de la catégorie et les 12 teintes, et rend le nom choisi ou null', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<HueSelect status={{ key: 'open', name: 'Ouvert', category: 'todo', color: null }} onChange={onChange} />);
    const select = screen.getByLabelText('Teinte du statut Ouvert');
    expect(select.querySelectorAll('option')).toHaveLength(13);
    await userEvent.selectOptions(select, 'Sarcelle');
    expect(onChange).toHaveBeenLastCalledWith('teal');
    rerender(<HueSelect status={{ key: 'open', name: 'Ouvert', category: 'todo', color: 'teal' }} onChange={onChange} />);
    expect(screen.getByText('Ouvert')).toHaveClass('ath-pill--hue-teal');
    await userEvent.selectOptions(screen.getByLabelText('Teinte du statut Ouvert'), 'Couleur de la catégorie');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
