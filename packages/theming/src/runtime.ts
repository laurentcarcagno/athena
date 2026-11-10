/**
 * Runtime navigateur : pose le thème, le mode et la densité en attributs sur l'élément racine, suit la préférence du
 * système, mémorise le choix par un adaptateur injectable et prévient les abonnés. Aucun style en ligne : compatible avec
 * une politique de sécurité sans `unsafe-inline`. Les noms d'attributs sont configurables.
 */

/** Choix courant. `mode` vaut `system` pour suivre `prefers-color-scheme`. */
export interface ThemeState {
  theme: string | null;
  mode: string;
  density: string | null;
}

/** Mémoire du choix (navigateur, compte, rien…). `load` rend `null` si rien n'est mémorisé. */
export interface ThemePersistence {
  load(): Partial<ThemeState> | null;
  save(state: ThemeState): void;
}

export interface ThemeControllerOptions {
  defaults: ThemeState;
  /** Valeurs admises ; une valeur mémorisée hors liste est ignorée. */
  themes?: readonly string[];
  modes?: readonly string[];
  densities?: readonly string[];
  /** Attributs de l'élément racine ; `null` = axe non posé. */
  attributes?: { theme?: string | null; mode?: string | null; density?: string | null };
  persistence?: ThemePersistence;
  root?: () => HTMLElement | null;
  /** Fenêtre utilisée pour `matchMedia` (tests, iframes). */
  view?: () => (Window & typeof globalThis) | null;
}

export interface ThemeController {
  get(): ThemeState;
  /** Change le choix, l'applique, le mémorise et prévient les abonnés. */
  set(patch: Partial<ThemeState>): void;
  /** Applique un état sans le mémoriser ni changer le choix courant. */
  apply(state?: ThemeState): void;
  /** Relit la mémoire, applique et prévient. */
  reload(): void;
  /** Mode effectif : le mode choisi, ou celui du système si le choix est `system`. */
  resolvedMode(): string;
  subscribe(listener: (state: ThemeState) => void): () => void;
}

export const SYSTEM = 'system';
export const THEME_CHANGE_EVENT = 'themechange';

const DEFAULT_ATTRIBUTES = { theme: 'data-theme', mode: 'data-mode', density: 'data-density' } as const;

export function createThemeController(options: ThemeControllerOptions): ThemeController {
  const attributes = { ...DEFAULT_ATTRIBUTES, ...options.attributes };
  const root = options.root ?? (() => (typeof document === 'undefined' ? null : document.documentElement));
  const view = options.view ?? (() => (typeof window === 'undefined' ? null : window));
  const listeners = new Set<(state: ThemeState) => void>();
  const allowed = (list: readonly string[] | undefined, value: unknown): value is string => typeof value === 'string' && (!list || list.includes(value));

  const sanitize = (raw: Partial<ThemeState> | null): ThemeState => ({
    theme: raw && allowed(options.themes, raw.theme) ? raw.theme : options.defaults.theme,
    mode: raw && allowed(options.modes, raw.mode) ? raw.mode : options.defaults.mode,
    density: raw && allowed(options.densities, raw.density) ? raw.density : options.defaults.density,
  });
  const load = (): ThemeState => {
    try {
      return sanitize(options.persistence?.load() ?? null);
    } catch {
      return { ...options.defaults };
    }
  };

  let current = load();

  const put = (element: HTMLElement, name: string | null, value: string | null) => {
    if (!name) return;
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  };
  const apply = (state: ThemeState = current) => {
    const element = root();
    if (!element) return;
    put(element, attributes.theme, state.theme);
    put(element, attributes.mode, state.mode === SYSTEM ? null : state.mode);
    put(element, attributes.density, state.density);
  };
  const notify = () => {
    const snapshot = { ...current };
    listeners.forEach((l) => l(snapshot));
    root()?.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: snapshot }));
  };

  // Préférence du système : en mode `system`, un changement côté OS est signalé aux abonnés (le CSS suit seul).
  const media = view()?.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', () => { if (current.mode === SYSTEM) notify(); });

  return {
    get: () => current,
    set(patch) {
      current = sanitize({ ...current, ...patch });
      try {
        options.persistence?.save(current);
      } catch { /* mémoire indisponible : le choix vaut pour la session */ }
      apply();
      notify();
    },
    apply,
    reload() {
      current = load();
      apply();
      notify();
    },
    resolvedMode: () => (current.mode === SYSTEM ? (media?.matches ? 'dark' : 'light') : current.mode),
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/**
 * Mémoire dans `localStorage` (ou un autre `Storage`). Par défaut l'état entier en JSON ; `encode` et `decode` permettent
 * un format plus simple (ex. le seul mode). `encode` rendant `null` efface la clé.
 */
export function storagePersistence(options: {
  key: string;
  storage?: () => Storage | null;
  encode?: (state: ThemeState) => string | null;
  decode?: (raw: string) => Partial<ThemeState> | null;
}): ThemePersistence {
  const storage = options.storage ?? (() => (typeof window === 'undefined' ? null : window.localStorage));
  const encode = options.encode ?? ((state: ThemeState) => JSON.stringify(state));
  const decode = options.decode ?? ((raw: string) => JSON.parse(raw) as Partial<ThemeState>);
  return {
    load() {
      const raw = storage()?.getItem(options.key);
      return raw === null || raw === undefined ? null : decode(raw);
    },
    save(state) {
      const value = encode(state);
      if (value === null) storage()?.removeItem(options.key);
      else storage()?.setItem(options.key, value);
    },
  };
}
