import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { UpgradeReport, type UpgradeReportData } from './UpgradeReport';

const base = (): UpgradeReportData => ({
  project: 'ARI', template: 'spatial', from: '1.0', to: '1.1', itemsConcerned: 12,
  trackers: [
    { key: 'SRS', name: 'Exigences logicielles', action: 'update', items: 12, fieldsAdded: [{ key: 'asil', label: 'Niveau', type: 'text', required: false }], fieldsRelabeled: [{ key: 'text', from: 'Énoncé', to: 'Texte' }], fieldsKept: ['old'],
      statusesAdded: [{ key: 'approved', name: 'Approuvée' }], statusesRenamed: [{ key: 'draft', from: 'Brouillon', to: 'Rédaction' }], statusesRemoved: [{ key: 'review', name: 'En revue', items: 0 }], transitionsAdded: ['Approuver'] },
    { key: 'NCR', name: 'NCR', action: 'create', items: 0, fieldsAdded: [], fieldsRelabeled: [], fieldsKept: [], statusesAdded: [], statusesRenamed: [], statusesRemoved: [], transitionsAdded: [] },
    { key: 'ICD', name: 'Interfaces', action: 'unchanged', items: 3, fieldsAdded: [], fieldsRelabeled: [], fieldsKept: [], statusesAdded: [], statusesRenamed: [], statusesRemoved: [], transitionsAdded: [] },
  ],
  rules: { added: ['ncr-closed'], updated: [], keptLocal: ['verified'], retired: [] },
  phases: { added: ['qualification'], removed: [], current: 'design', nextCurrent: 'design' },
  blockers: [], warnings: ['SRS.asil : devient obligatoire après renseignement'],
});

describe('rapport d’impact d’une montée de version', () => {
  it('montre champs ajoutés, états modifiés et tickets concernés, sans les trackers inchangés', () => {
    render(<UpgradeReport report={base()} onApply={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Montée de version du gabarit : 1.0 → 1.1' })).toBeInTheDocument();
    expect(screen.getByText('2 trackers concernés, 12 tickets touchés par une évolution de schéma.')).toBeInTheDocument();
    const row = screen.getByRole('cell', { name: 'SRS' }).closest('tr')!;
    expect(within(row).getByText('Champs ajoutés : asil')).toBeInTheDocument();
    expect(within(row).getByText('États ajoutés : approved')).toBeInTheDocument();
    expect(within(row).getByText('États renommés : draft (Brouillon → Rédaction)')).toBeInTheDocument();
    expect(within(row).getByText('États supprimés : review (0)')).toBeInTheDocument();
    expect(within(row).getByText('Champs retirés du gabarit, conservés : old')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'NCR' }).closest('tr')).toHaveTextContent('À créer');
    expect(screen.queryByRole('cell', { name: 'ICD' })).toBeNull();
    expect(screen.getByText('Ajoutées : ncr-closed')).toBeInTheDocument();
    expect(screen.getByText('Modifiées dans le projet, conservées : verified')).toBeInTheDocument();
    expect(screen.getByText('Ajoutées : qualification')).toBeInTheDocument();
    expect(screen.getByText('SRS.asil : devient obligatoire après renseignement')).toBeInTheDocument();
  });

  it('bloque l’application quand un état supprimé porte des tickets, et le dit en texte', async () => {
    const onApply = vi.fn();
    const r = base();
    r.blockers = ['SRS : l’état « En revue » (review) est supprimé par le gabarit et porte 4 ticket(s) ; déplacez-les avant la montée'];
    render(<UpgradeReport report={r} onApply={onApply} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Montée bloquée');
    expect(screen.getByRole('alert')).toHaveTextContent('porte 4 ticket(s)');
    const apply = screen.getByRole('button', { name: 'Appliquer la montée' });
    expect(apply).toBeDisabled();
    await userEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applique et annule quand rien ne bloque', async () => {
    const onApply = vi.fn(), onCancel = vi.fn();
    render(<UpgradeReport report={base()} onApply={onApply} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer la montée' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('annonce l’absence de changement', () => {
    const r = base(); r.trackers = []; r.itemsConcerned = 0; r.rules = { added: [], updated: [], keptLocal: [], retired: [] }; r.phases = { added: [], removed: [], current: null, nextCurrent: null }; r.warnings = [];
    render(<UpgradeReport report={r} />);
    expect(screen.getByText('Aucun tracker ne change.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ne présente aucune violation d’accessibilité (axe)', async () => {
    const { container } = render(<main><UpgradeReport report={base()} onApply={() => undefined} onCancel={() => undefined} /></main>);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
