import { useSyncExternalStore } from 'react';
import { api } from '../api';

/**
 * Interrupteurs de fonctionnalité de l'organisation (`GET /v1/features`). Tant qu'ils ne sont pas connus, `useFeature` répond `true` :
 * l'interface n'efface jamais une entrée sur une simple attente ; la route côté serveur reste, elle, protégée (404).
 */
export type Features = Record<string, boolean>;

let current: Features | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadFeatures(): Promise<void> {
  try {
    const list = await api<Features>('GET', '/v1/features');
    current = list && typeof list === 'object' ? list : null;
  } catch { current = null; }
  emit();
}
export function setFeatures(next: Features | null): void { current = next; emit(); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => current;

/** Vrai si la fonctionnalité est active (ou si l'état n'est pas encore connu). */
export function useFeature(key: string): boolean {
  const features = useSyncExternalStore(subscribe, snapshot, snapshot);
  return features === null ? true : features[key] !== false;
}
