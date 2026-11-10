// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './react.js';
import { createThemeController, storagePersistence, THEME_CHANGE_EVENT, type ThemeControllerOptions } from './runtime.js';

const html = () => document.documentElement;
let darkSystem = false;
const changeHandlers: Array<() => void> = [];

beforeEach(() => {
  window.localStorage.clear();
  for (const a of ['data-theme', 'data-mode', 'data-density']) html().removeAttribute(a);
  darkSystem = false;
  changeHandlers.length = 0;
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() { return darkSystem; },
    addEventListener: (_: string, handler: () => void) => changeHandlers.push(handler),
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => window.localStorage.clear());

const options = (extra: Partial<ThemeControllerOptions> = {}): ThemeControllerOptions => ({
  defaults: { theme: 'hemeria', mode: 'system', density: 'normal' },
  themes: ['hemeria', 'nord'],
  modes: ['system', 'light', 'dark'],
  densities: ['normal', 'compact'],
  persistence: storagePersistence({ key: 'test.theme' }),
  ...extra,
});

describe('contrôleur', () => {
  it('pose les attributs ; `system` retire l’attribut de mode', () => {
    const c = createThemeController(options());
    c.apply();
    expect(html().getAttribute('data-theme')).toBe('hemeria');
    expect(html().hasAttribute('data-mode')).toBe(false);
    expect(html().getAttribute('data-density')).toBe('normal');
    c.set({ mode: 'dark', theme: 'nord', density: 'compact' });
    expect(html().getAttribute('data-mode')).toBe('dark');
    expect(html().getAttribute('data-theme')).toBe('nord');
    expect(html().getAttribute('data-density')).toBe('compact');
  });

  it('mémorise le choix, le relit, et ignore une valeur mémorisée inconnue', () => {
    createThemeController(options()).set({ mode: 'dark', theme: 'nord' });
    expect(createThemeController(options()).get()).toEqual({ theme: 'nord', mode: 'dark', density: 'normal' });
    window.localStorage.setItem('test.theme', JSON.stringify({ theme: 'violet', mode: 'sepia' }));
    expect(createThemeController(options()).get()).toEqual({ theme: 'hemeria', mode: 'system', density: 'normal' });
    window.localStorage.setItem('test.theme', '{illisible');
    expect(createThemeController(options()).get().mode).toBe('system');
  });

  it('résout le mode système et prévient les abonnés quand le système change', () => {
    const c = createThemeController(options());
    const seen = vi.fn();
    c.subscribe(seen);
    expect(c.resolvedMode()).toBe('light');
    darkSystem = true;
    changeHandlers.forEach((h) => h());
    expect(c.resolvedMode()).toBe('dark');
    expect(seen).toHaveBeenCalledTimes(1);
    c.set({ mode: 'light' });
    changeHandlers.forEach((h) => h()); // mode imposé : le système ne compte plus
    expect(seen).toHaveBeenCalledTimes(2);
    expect(c.resolvedMode()).toBe('light');
  });

  it('émet un événement DOM et accepte des noms d’attributs propres au produit, ou aucun', () => {
    const c = createThemeController(options({ attributes: { theme: null, mode: 'data-theme', density: null } }));
    const events: unknown[] = [];
    html().addEventListener(THEME_CHANGE_EVENT, (e) => events.push((e as CustomEvent).detail));
    c.set({ mode: 'dark' });
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(html().hasAttribute('data-density')).toBe(false);
    expect(events).toEqual([{ theme: 'hemeria', mode: 'dark', density: 'normal' }]);
  });

  it('format de mémoire libre : `encode` rendant null efface la clé ; une mémoire en panne ne bloque rien', () => {
    const persistence = storagePersistence({ key: 'mode', encode: (s) => (s.mode === 'system' ? null : s.mode), decode: (raw) => ({ mode: raw }) });
    const c = createThemeController(options({ persistence }));
    c.set({ mode: 'dark' });
    expect(window.localStorage.getItem('mode')).toBe('dark');
    c.set({ mode: 'system' });
    expect(window.localStorage.getItem('mode')).toBeNull();
    const broken = createThemeController(options({ persistence: { load: () => { throw new Error('x'); }, save: () => { throw new Error('x'); } } }));
    expect(() => broken.set({ mode: 'dark' })).not.toThrow();
    expect(broken.get().mode).toBe('dark');
  });
});

describe('liaisons React', () => {
  function Probe() {
    const { state, resolvedMode, set } = useTheme();
    return <button type="button" onClick={() => set({ mode: 'dark' })}>{`${state.theme} ${state.mode} ${resolvedMode}`}</button>;
  }

  it('rend l’état courant et se met à jour au changement', () => {
    const c = createThemeController(options());
    render(<ThemeProvider controller={c}><Probe /></ThemeProvider>);
    expect(screen.getByRole('button')).toHaveProperty('textContent', 'hemeria system light');
    act(() => screen.getByRole('button').click());
    expect(screen.getByRole('button')).toHaveProperty('textContent', 'hemeria dark dark');
  });

  it('refuse un usage hors fournisseur', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
  });
});
