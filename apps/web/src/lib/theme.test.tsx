import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from '../components/ThemeToggle';
import { applyTheme, DENSITY_KEY, getDensity, initTheme, nextTheme, readTheme, setDensity, setTheme, THEME_KEY } from './theme';

beforeEach(() => { window.localStorage.clear(); initTheme(); });
afterEach(() => { window.localStorage.clear(); initTheme(); });

describe('réglage du thème', () => {
  it('« système » par défaut : thème Hemeria, aucun attribut de mode sur html', () => {
    expect(readTheme()).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('hemeria');
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false);
  });

  it('clair et sombre posent data-mode et sont mémorisés ; système efface la mémoire', () => {
    setTheme('dark');
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(readTheme()).toBe('dark');
    setTheme('light');
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    setTheme('system');
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false);
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('une valeur mémorisée inconnue retombe sur « système »', () => {
    window.localStorage.setItem(THEME_KEY, 'violet');
    expect(readTheme()).toBe('system');
    initTheme();
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false);
  });

  it('une mémoire inaccessible ne casse rien', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('refusé'); };
    try {
      expect(readTheme()).toBe('system');
      expect(() => applyTheme()).not.toThrow();
    } finally { Storage.prototype.getItem = original; }
  });

  it('l’ordre de bascule est système, clair, sombre', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
});

describe('bouton de thème', () => {
  it('dit le réglage courant en texte, bascule au clavier et mémorise', async () => {
    const user = userEvent.setup();
    const { container } = render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Thème : système. Changer de thème.' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Thème : clair. Changer de thème.' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Thème : sombre. Changer de thème.' })).toHaveFocus();
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    const result = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
    await user.keyboard('{Enter}');
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false);
  });
});

describe('densité (T-0135)', () => {
  it('Normale par défaut ; Compacte posée en attribut et mémorisée ; Normale efface la mémoire', () => {
    expect(getDensity()).toBe('normal');
    expect(document.documentElement.getAttribute('data-density')).toBe('normal');
    setDensity('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(window.localStorage.getItem(DENSITY_KEY)).toBe('compact');
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
    setDensity('normal');
    expect(window.localStorage.getItem(DENSITY_KEY)).toBeNull();
  });
});

describe('thèmes du lot 13', () => {
  it('le catalogue propose « Hemeria arrondi » et « GitHub », chargeables et applicables', async () => {
    const { THEME_CATALOG } = await import('@athena/ui');
    const labels = THEME_CATALOG.map((t) => t.label);
    expect(labels).toContain('Hemeria arrondi');
    expect(labels).toContain('GitHub');
    const { setThemeFamily, getThemeFamily } = await import('./theme');
    for (const name of ['hemeria-arrondi', 'github']) {
      await setThemeFamily(name, false);
      expect(getThemeFamily()).toBe(name);
      expect(document.documentElement.getAttribute('data-theme')).toBe(name);
    }
    await setThemeFamily('hemeria', false);
  });
});
