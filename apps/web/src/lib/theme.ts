import { createThemeController, storagePersistence, SYSTEM, type ThemeState } from '@nuance/theming';
import { useThemeState } from '@nuance/theming/react';

/** Réglage du mode : `system` suit la préférence du système (aucun attribut), `light` et `dark` la forcent. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'athena.theme';

/**
 * Contrôleur du moteur `@nuance/theming` (ADR-0004). Jusqu'à T-0129, les jetons générés (tokens.generated.css) lisent le
 * mode dans `data-theme` : le contrôleur pose donc le mode sous ce nom et ne pose ni famille ni densité. La mémoire garde
 * le format historique (le seul mode, clé effacée pour « système ») pour ne rien perdre des réglages existants.
 */
const memory = storagePersistence({
  key: THEME_KEY,
  encode: (state) => (state.mode === SYSTEM ? null : state.mode),
  decode: (raw) => ({ mode: raw }),
});
const controller = createThemeController({
  defaults: { theme: null, mode: SYSTEM, density: null },
  modes: THEME_CHOICES,
  attributes: { theme: null, mode: 'data-theme', density: null },
  persistence: memory,
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
