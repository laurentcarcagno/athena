import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Btn, Card, CornerFrame, EmptyState, Field, FilterChip, Id, Modal, PageHeader, SearchInput, Sidebar, StatCard,
  StatusPill, Table, Tabs, Td, Th, ToastProvider, useToast, type SortState,
} from './components';

describe('boutons, pastilles, identifiants', () => {
  it('applique la variante et la taille', () => {
    render(<><Btn variant="danger" size="sm">Supprimer</Btn><Btn disabled>Off</Btn></>);
    expect(screen.getByText('Supprimer')).toHaveClass('ath-btn', 'ath-btn--danger', 'ath-btn--sm');
    expect(screen.getByText('Off')).toBeDisabled();
  });
  it('affiche le point carré et la variante de la pastille', () => {
    const { container } = render(<StatusPill kind="success">Opérationnel</StatusPill>);
    expect(container.querySelector('.ath-pill')).toHaveClass('ath-pill--success');
    expect(container.querySelector('.ath-pill__dot')).toBeInTheDocument();
  });
  it('rend les identifiants en police mono', () => {
    render(<Id>BUG-142</Id>);
    expect(screen.getByText('BUG-142')).toHaveClass('ath-mono');
  });
});

describe('recherche et champs', () => {
  it('Ctrl+K place le focus sur la recherche et le raccourci est affiché', () => {
    render(<SearchInput placeholder="Rechercher un artefact" />);
    expect(screen.getByText('⌘K')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });
  it('relie étiquette, champ et message d’erreur', () => {
    render(<Field label="Référence" error="Obligatoire" />);
    const input = screen.getByLabelText('Référence');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Obligatoire');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });
  it('permet de retirer un filtre actif', async () => {
    const onClear = vi.fn();
    render(<FilterChip label="Statut" value="Ouvert" active onClear={onClear} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le filtre Statut' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe('cartes', () => {
  it('interdit les cartes imbriquées', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Card title="A"><Card title="B">x</Card></Card>)).toThrow(/imbriquée/);
    spy.mockRestore();
  });
  it('affiche titre, métadonnée et statistique', () => {
    render(<><Card title="Activité" meta="2026-10-31">contenu</Card><StatCard label="Ouverts" value={12} delta="▲ 3" /></>);
    expect(screen.getByRole('heading', { name: 'Activité' })).toBeInTheDocument();
    expect(screen.getByText('12')).toHaveClass('ath-stat__value');
  });
});

describe('tableau triable', () => {
  function Demo() {
    const [sort, setSort] = useState<SortState>(null);
    return (
      <Table>
        <thead><tr><Th sort={sort} onSort={setSort}>Clé</Th><Th>Titre</Th></tr></thead>
        <tbody><tr><Td mono>BUG-1</Td><Td>Crash</Td></tr></tbody>
      </Table>
    );
  }
  it('parcourt null → asc → desc → null avec aria-sort', async () => {
    render(<Demo />);
    const header = screen.getByRole('columnheader', { name: /Clé/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-sort', 'none');
  });
  it('se trie au clavier et met les cellules d’identifiant en mono', async () => {
    render(<Demo />);
    const header = screen.getByRole('columnheader', { name: /Clé/ });
    header.focus();
    await userEvent.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByText('BUG-1')).toHaveClass('ath-mono');
  });
});

describe('onglets', () => {
  it('navigue aux flèches', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={[{ id: 'a', label: 'Détails' }, { id: 'b', label: 'Historique' }]} active="a" onChange={onChange} />);
    screen.getByRole('tab', { name: 'Détails' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('tab', { name: 'Détails' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('modale', () => {
  function Demo({ onClose = () => undefined }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Ouvrir</button>
        <Modal open={open} title="Confirmer" onClose={() => { setOpen(false); onClose(); }} footer={<Btn variant="ghost">Annuler</Btn>}>
          <Field label="Motif" />
        </Modal>
      </>
    );
  }
  it('déplace le focus à l’ouverture, le piège, et le rend au déclencheur', async () => {
    render(<Demo />);
    const trigger = screen.getByText('Ouvrir');
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Confirmer' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
    await userEvent.tab(); await userEvent.tab(); await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true); // le focus reste dans la modale
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it('se ferme au clic sur le fond et sur le bouton, pas dans la modale', async () => {
    const onClose = vi.fn();
    const { container } = render(<Demo onClose={onClose} />);
    await userEvent.click(screen.getByText('Ouvrir'));
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.ownerDocument.querySelector('.ath-modal-backdrop')!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('notifications', () => {
  function Demo() {
    const toast = useToast();
    return <button onClick={() => toast('success', 'Préférences enregistrées.')}>Go</button>;
  }
  it('disparaissent après la durée, avec pause au survol', () => {
    vi.useFakeTimers();
    render(<ToastProvider duration={5000}><Demo /></ToastProvider>);
    fireEvent.click(screen.getByText('Go'));
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Préférences enregistrées.');
    fireEvent.mouseEnter(toast);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole('status')).toBeInTheDocument(); // en pause
    fireEvent.mouseLeave(toast);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('structure de page', () => {
  it('rend le bandeau tricolore, le titre, les actions et le cadre', () => {
    const { container } = render(
      <PageHeader eyebrow="Mission console" title="Tableau de bord" sub="Vue d'ensemble" actions={<Btn>Nouveau</Btn>} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument();
    expect(container.querySelectorAll('.ath-stripe > div')).toHaveLength(3);
    render(<CornerFrame>lecture</CornerFrame>);
    expect(document.querySelectorAll('.ath-corner__tick')).toHaveLength(4);
  });
  it('affiche un état vide factuel', () => {
    render(<EmptyState eyebrow="Aucun résultat" title="Aucun artefact ne correspond aux filtres." action={<Btn variant="ghost">Réinitialiser</Btn>} />);
    expect(screen.getByRole('heading', { name: /Aucun artefact/ })).toBeInTheDocument();
  });
  it('marque la page courante dans la navigation et affiche les initiales', async () => {
    const onNavigate = vi.fn();
    render(<Sidebar items={[{ id: 'board', label: 'Board' }, { id: 'search', label: 'Recherche' }]} current="board" onNavigate={onNavigate} user={{ name: 'Alice Martin', role: 'Admin' }} />);
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('AM')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recherche' }));
    expect(onNavigate).toHaveBeenCalledWith('search');
  });
});

describe('conformité Hemeria de la feuille de style', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');
  it('ne contient ni ombre, ni dégradé, ni flou, ni arrondi', () => {
    expect(css).not.toMatch(/box-shadow\s*:\s*(?!none)/);
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/border-radius\s*:\s*[1-9]/);
  });
  it('réserve le rouge cérémoniel au bandeau et au point du logo', () => {
    const uses = css.split('\n').filter((l) => l.includes('tricolor-red')).map((l) => l.trim().split(' ')[0]);
    expect(uses.sort()).toEqual(['.ath-sidebar__dot', '.ath-stripe__red'].sort());
  });
  it('n’utilise aucune couleur en dur hors palette', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});
