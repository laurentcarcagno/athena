import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { ThemeController, ThemeState } from './runtime.js';

/** Liaisons React, facultatives : React est une dépendance pair, importée seulement par `@nuance/theming/react`. */

/** État courant d'un contrôleur ; le composant se rend à nouveau à chaque changement. */
export function useThemeState(controller: ThemeController): ThemeState {
  return useSyncExternalStore(controller.subscribe, controller.get, controller.get);
}

const ThemeContext = createContext<ThemeController | null>(null);

export function ThemeProvider({ controller, children }: { controller: ThemeController; children?: ReactNode }) {
  return createElement(ThemeContext.Provider, { value: controller }, children);
}

/** Contrôleur fourni par `ThemeProvider`, son état et son mode effectif. */
export function useTheme(): { state: ThemeState; resolvedMode: string; set: ThemeController['set'] } {
  const controller = useContext(ThemeContext);
  if (!controller) throw new Error('useTheme() doit être appelé sous <ThemeProvider>');
  const state = useThemeState(controller);
  return { state, resolvedMode: controller.resolvedMode(), set: controller.set };
}
