import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Card, IconButton, PageContextProvider, PageHeader, TabLinks } from './components';

/** T-0134 : composants normalisés (onglets-liens, bouton-icône, contexte de page, carte « section »). */
const styles = readdirSync(join(__dirname, 'styles')).map((f) => readFileSync(join(__dirname, 'styles', f), 'utf8')).join('\n');

describe('composants normalisés (T-0134)', () => {
  it('TabLinks : même rendu que les onglets, onglet courant annoncé comme page courante', () => {
    render(<TabLinks label="Vues" items={[{ id: 'a', label: 'Tableau', current: true }, { id: 'b', label: 'Board', current: false }]}
      link={(item, props) => <a href={`#${item.id}`} {...props} />} />);
    const nav = screen.getByRole('navigation', { name: 'Vues' });
    expect(nav).toHaveClass('ath-tabs', 'ath-tabs--links');
    expect(screen.getByRole('link', { name: 'Tableau' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Board' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Board' })).toHaveClass('ath-tab');
  });

  it('IconButton : nom accessible et info-bulle, deux tons, deux tailles', () => {
    render(<><IconButton label="Fermer">×</IconButton><IconButton label="Langue" tone="inverse" size="sm">FR</IconButton></>);
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveClass('ath-iconbtn');
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveAttribute('title', 'Fermer');
    expect(screen.getByRole('button', { name: 'Langue' })).toHaveClass('ath-iconbtn', 'ath-iconbtn--inverse', 'ath-iconbtn--sm');
  });

  it('PageHeader affiche le contexte fourni (projet courant) au-dessus du titre et ses actions', () => {
    render(<PageContextProvider context="Projet ARI · Ariane"><PageContextProvider actions={<button type="button">Épingler</button>}><PageHeader eyebrow="Tracker" title="Bugs" actions={<button type="button">Suivre</button>} /></PageContextProvider></PageContextProvider>);
    expect(screen.getByText('Projet ARI · Ariane')).toHaveClass('ath-pageheader__context');
    // Les actions de la page puis celles du contexte, dans l'en-tête.
    expect([...document.querySelectorAll('.ath-pageheader__actions button')].map((b) => b.textContent)).toEqual(['Suivre', 'Épingler']);
  });

  it('Card en variante section : filet seul', () => {
    render(<Card title="Activité" variant="section">contenu</Card>);
    expect(screen.getByRole('heading', { name: 'Activité' }).closest('section')).toHaveClass('ath-card', 'ath-card--section');
  });

  it('un seul bouton-icône ; en-tête de tableau sur surface claire ; sélection commune', () => {
    expect(styles).not.toContain('ath-icon-btn');
    expect(styles).toMatch(/\.ath-th \{[^}]*background: var\(--ath-surface-muted\)[^}]*color: var\(--ath-text-heading\)/);
    for (const selector of ['.ath-table tbody tr.ath-row-active > td:first-child', '.ath-row--selected', '.ath-tree__row[aria-selected="true"]', '.ath-palette__item--active']) {
      expect(styles).toContain(selector);
    }
    expect((styles.match(/border-left: var\(--ath-border-width-strong\) solid var\(--ath-border-focus\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(styles).not.toMatch(/\.ath-chip__label \{[^}]*opacity/);
  });
});
