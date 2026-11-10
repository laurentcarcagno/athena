import { createThemeController, storagePersistence, SYSTEM, type ThemeState } from '@nuance/theming';
import { useThemeState } from '@nuance/theming/react';

/** Réglage du mode : `system` suit la préférence du système (aucun attribut), `light` et `dark` la forcent. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'athena.theme';

/** Densité (T-0135) : normale ou compacte ; mémorisée dans le navigateur et sur le compte. */
export type DensityChoice = 'normal' | 'compact';
export const DENSITIES: DensityChoice[] = ['normal', 'compact'];
export const DENSITY_KEY = 'athena.density';

/**
 * Contrôleur du moteur `@nuance/theming` (ADR-0004) : `data-theme` porte la famille (Hemeria, seul thème jusqu'à T-0136),
 * `data-mode` le mode (absent pour « système »). La densité arrive en T-0135. La mémoire garde le format historique
 * (le seul mode, clé effacée pour « système ») pour ne rien perdre des réglages existants.
 */
const memory = storagePersistence({
  key: THEME_KEY,
  encode: (state) => (state.mode === SYSTEM ? null : state.mode),
  decode: (raw) => ({ mode: raw }),
});
const densityMemory = storagePersistence({
  key: DENSITY_KEY,
  encode: (state) => (state.density === 'normal' || !state.density ? null : state.density),
  decode: (raw) => ({ density: raw }),
});
const controller = createThemeController({
  defaults: { theme: 'hemeria', mode: SYSTEM, density: 'normal' },
  themes: ['hemeria'],
  modes: THEME_CHOICES,
  densities: DENSITIES,
  attributes: { theme: 'data-theme', mode: 'data-mode', density: 'data-density' },
  // Deux clés du navigateur : le mode (format historique) et la densité.
  persistence: {
    load: () => ({ ...memory.load(), ...densityMemory.load() }),
    save: (state) => { memory.save(state); densityMemory.save(state); },
  },
});

const choiceOf = (state: ThemeState): ThemeChoice => state.mode as ThemeChoice;

/** Réglage mémorisé dans ce navigateur ; une valeur absente, illisible ou inconnue donne « système ». */
export function readTheme(): ThemeChoice {
  try {
    const mode = memory.load()?.mode;
    return THEME_CHOICES.includes(mode as ThemeChoice) ? (mode as ThemeChoice) : 'system';
  } catch { return 'system'; }
}

/** Pose un mode sur l'élément `html` sans le mémoriser. */
export function applyTheme(choice: ThemeChoice = readTheme()): void {
  controller.apply({ ...controller.get(), mode: choice });
}

export const getTheme = (): ThemeChoice => choiceOf(controller.get());

export function setTheme(choice: ThemeChoice): void {
  controller.set({ mode: choice });
}

/** Réglage suivant dans l'ordre système, clair, sombre. */
export const nextTheme = (choice: ThemeChoice): ThemeChoice => THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length]!;

export function useTheme(): ThemeChoice {
  return choiceOf(useThemeState(controller));
}

/** Relit le réglage mémorisé (tests, retour dans l'onglet) et l'applique. */
export function initTheme(): void {
  controller.reload();
}

export const getDensity = (): DensityChoice => (controller.get().density as DensityChoice | null) ?? 'normal';
export function setDensity(density: DensityChoice): void {
  controller.set({ density });
}
export function useDensity(): DensityChoice {
  return (useThemeState(controller).density as DensityChoice | null) ?? 'normal';
}
