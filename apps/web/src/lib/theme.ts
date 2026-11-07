import { useSyncExternalStore } from 'react';

/** Réglage du thème : `system` suit la préférence du système (aucun attribut), `light` et `dark` la forcent. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'athena.theme';

const listeners = new Set<() => void>();

/** Réglage mémorisé dans ce navigateur ; une valeur absente, illisible ou inconnue donne « système ». */
export function readTheme(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch { return 'system'; }
}

/** Pose le thème sur l'élément `html` : l'attribut `data-theme` pilote les jetons générés (tokens.generated.css). */
export function applyTheme(choice: ThemeChoice = readTheme()): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

let current: ThemeChoice = readTheme();
export const getTheme = (): ThemeChoice => current;

export function setTheme(choice: ThemeChoice): void {
  current = choice;
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
  applyTheme(choice);
  listeners.forEach((l) => l());
}

/** Réglage suivant dans l'ordre système, clair, sombre. */
export const nextTheme = (choice: ThemeChoice): ThemeChoice => THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length]!;

export function useTheme(): ThemeChoice {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getTheme, getTheme);
}

/** Relit le réglage mémorisé (tests, retour dans l'onglet) et l'applique. */
export function initTheme(): void {
  current = readTheme();
  applyTheme(current);
}
