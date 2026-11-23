import { DEFAULT_THEME, THEME_CATALOG } from '@athena/ui';
import { createThemeController, storagePersistence, SYSTEM, type ThemeState } from '@nuance/theming';
import { useThemeState } from '@nuance/theming/react';

/** Réglage du mode : `system` suit la préférence du système (aucun attribut), `light` et `dark` la forcent. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'athena.theme';

/** Densité (T-0135) : compacte, normale ou confortable ; mémorisée dans le navigateur et sur le compte. */
export type DensityChoice = 'normal' | 'compact' | 'comfortable';
export const DENSITIES: DensityChoice[] = ['compact', 'normal', 'comfortable'];
export const DENSITY_KEY = 'athena.density';

/**
 * Contrôleur du moteur `@nuance/theming` (ADR-0004) : `data-theme` porte la famille (Athena, seul thème jusqu'à T-0136),
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
  defaults: { theme: DEFAULT_THEME, mode: SYSTEM, density: 'normal' },
  themes: THEME_CATALOG.map((t) => t.name),
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

/**
 * Famille de thème (T-0136) : Athena est toujours chargé ; les autres thèmes sont des CSS chargés à la demande. L'attribut
 * `data-theme` ne change qu'une fois le CSS arrivé : jamais de page sans jetons. Mémoire : `athena.themeFamily` (navigateur) ;
 * l'organisation peut restreindre la liste (`setAllowedThemes`), un thème hors liste cède la place au thème par défaut.
 */
export const FAMILY_KEY = 'athena.themeFamily';
const THEME_CSS: Record<string, () => Promise<unknown>> = {
  catppuccin: () => import('@athena/ui/themes/catppuccin.css'),
  contrast: () => import('@athena/ui/themes/contrast.css'),
  github: () => import('@athena/ui/themes/github.css'),
  gruvbox: () => import('@athena/ui/themes/gruvbox.css'),
  'athena-arrondi': () => import('@athena/ui/themes/athena-arrondi.css'),
  nord: () => import('@athena/ui/themes/nord.css'),
  dracula: () => import('@athena/ui/themes/dracula.css'),
  'rose-pine': () => import('@athena/ui/themes/rose-pine.css'),
  solarized: () => import('@athena/ui/themes/solarized.css'),
  'tokyo-night': () => import('@athena/ui/themes/tokyo-night.css'),
};
let allowed: { list: string[]; fallback: string } | null = null;
const permitted = (name: string): string => {
  const known = THEME_CATALOG.some((t) => t.name === name) ? name : DEFAULT_THEME;
  if (!allowed || allowed.list.includes(known)) return known;
  return allowed.list.includes(allowed.fallback) ? allowed.fallback : DEFAULT_THEME;
};
/** Anciens noms de thème (renommés en 062) : le choix déjà enregistré dans le navigateur suit. */
const RENAMED: Record<string, string> = { hemeria: 'athena', 'hemeria-arrondi': 'athena-arrondi' };
const readFamily = (): string | null => { try { const v = window.localStorage.getItem(FAMILY_KEY); return v && RENAMED[v] ? RENAMED[v] : v; } catch { return null; } };

export const getThemeFamily = (): string => controller.get().theme ?? DEFAULT_THEME;
export function useThemeFamily(): string {
  return useThemeState(controller).theme ?? DEFAULT_THEME;
}
/** Change de famille : charge son CSS, puis l'applique ; `remember` la garde dans ce navigateur. */
export async function setThemeFamily(name: string, remember = true): Promise<void> {
  const next = permitted(name);
  await THEME_CSS[next]?.();
  controller.set({ theme: next });
  if (!remember) return;
  try {
    if (next === DEFAULT_THEME) window.localStorage.removeItem(FAMILY_KEY);
    else window.localStorage.setItem(FAMILY_KEY, next);
  } catch { /* stockage indisponible : le choix vaut pour la session */ }
}
/** Thèmes proposés par l'organisation et thème par défaut ; le thème courant est ramené dans la liste si besoin. */
export function setAllowedThemes(list: string[] | null, fallback: string = DEFAULT_THEME): void {
  allowed = list ? { list, fallback } : null;
  if (permitted(getThemeFamily()) !== getThemeFamily()) void setThemeFamily(permitted(getThemeFamily()), false);
}
export const allowedThemes = () => THEME_CATALOG.filter((t) => !allowed || allowed.list.includes(t.name));

/** Relit le réglage mémorisé (tests, retour dans l'onglet) et l'applique. */
export function initTheme(): void {
  controller.reload();
  const family = readFamily();
  if (family && family !== DEFAULT_THEME) void setThemeFamily(family, false);
}

export const getDensity = (): DensityChoice => (controller.get().density as DensityChoice | null) ?? 'normal';
export function setDensity(density: DensityChoice): void {
  controller.set({ density });
}
export function useDensity(): DensityChoice {
  return (useThemeState(controller).density as DensityChoice | null) ?? 'normal';
}

/** Mode effectif (clair ou sombre), préférence système comprise ; suit les changements. */
export function useResolvedMode(): 'light' | 'dark' {
  useThemeState(controller);
  return controller.resolvedMode() === 'dark' ? 'dark' : 'light';
}
