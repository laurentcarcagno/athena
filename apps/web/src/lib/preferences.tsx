import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import { getLocale, setLocale, type Locale } from '../i18n';
import { readHome, setHome, type HomeChoice } from './home';
import { getDensity, getTheme, setDensity, setTheme, type DensityChoice, type ThemeChoice } from './theme';

/** Préférences enregistrées sur le compte (migration 052) : `null` = aucune, le réglage local du navigateur s'applique. */
interface Stored { home: HomeChoice | null; locale: Locale | null; theme: ThemeChoice | null; density?: DensityChoice | null }
export type PreferencePatch = Partial<Stored>;

interface PreferencesApi { loaded: boolean; home: HomeChoice; setHomePreference: (home: HomeChoice) => void }
const Context = createContext<PreferencesApi>({ loaded: true, home: 'work', setHomePreference: () => undefined });
export const usePreferences = () => useContext(Context);

/** Enregistre une préférence sur le compte ; l'échec est sans effet visible (le réglage local reste appliqué). */
export function savePreference(patch: PreferencePatch): void {
  void api('PUT', '/v1/me/preferences', patch).catch(() => undefined);
}

/**
 * Charge une fois les préférences du compte et les applique : langue et thème suivent la personne d'un navigateur à l'autre
 * (T-0123). Sans préférence enregistrée, le réglage local reste en place. L'accueil attend ce chargement pour éviter un clignotement.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ loaded: boolean; home: HomeChoice }>({ loaded: false, home: readHome() });
  useEffect(() => {
    let alive = true;
    // Un réglage changé ici pendant le chargement (clic sur le thème, choix de langue) est plus récent que celui du compte :
    // il n'est pas écrasé à l'arrivée de la réponse.
    const localeAtStart = getLocale();
    const themeAtStart = getTheme();
    const densityAtStart = getDensity();
    api<Stored>('GET', '/v1/me/preferences').then((stored) => {
      if (!alive) return;
      if (stored?.locale && stored.locale !== getLocale() && getLocale() === localeAtStart) setLocale(stored.locale);
      if (stored?.theme && stored.theme !== getTheme() && getTheme() === themeAtStart) setTheme(stored.theme);
      if (stored?.density && stored.density !== getDensity() && getDensity() === densityAtStart) setDensity(stored.density);
      const home = stored?.home ?? readHome();
      setHome(home); // copie locale : l'accueil se décide sans attendre au prochain chargement
      setState({ loaded: true, home });
    }).catch(() => { if (alive) setState((s) => ({ ...s, loaded: true })); });
    return () => { alive = false; };
  }, []);
  const value = useMemo<PreferencesApi>(() => ({
    loaded: state.loaded, home: state.home,
    setHomePreference: (home) => { setHome(home); setState((s) => ({ ...s, home })); savePreference({ home }); },
  }), [state]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
