import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_THEME, THEME_CATALOG } from '@athena/ui';
import { api } from '../api';

/**
 * Icône de marque (T-0137) : celle que l'organisation a téléversée pour le thème (ou pour tous les thèmes), sinon l'icône
 * par défaut du thème (URI data: du catalogue). Toujours affichée par `<img>` ; la favicon suit le thème actif.
 */
export interface BrandEntry { theme: string; kind: 'mark' | 'logo'; contentType: string; size: number; updatedAt: string }

let entries: BrandEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadBrand(): Promise<void> {
  try {
    const list = await api<BrandEntry[]>('GET', '/v1/brand');
    entries = Array.isArray(list) ? list : [];
  } catch { entries = []; }
  emit();
}
export function setBrandEntries(list: BrandEntry[]): void {
  entries = list;
  emit();
}

/** Adresse de l'icône d'un thème ; `null` si ni l'organisation ni le thème n'en fournissent. */
export function markUrl(theme: string): string | null {
  const own = entries.find((e) => e.kind === 'mark' && e.theme === theme) ?? entries.find((e) => e.kind === 'mark' && e.theme === '*');
  if (own) return `/v1/brand/${theme}/mark?v=${encodeURIComponent(own.updatedAt)}`;
  return (THEME_CATALOG.find((t) => t.name === theme) ?? THEME_CATALOG.find((t) => t.name === DEFAULT_THEME))?.mark ?? null;
}

/** Logo horizontal téléversé par l'organisation pour le thème (ou tous les thèmes) ; aucun logo par défaut. */
export function logoUrl(theme: string): string | null {
  const own = entries.find((e) => e.kind === 'logo' && e.theme === theme) ?? entries.find((e) => e.kind === 'logo' && e.theme === '*');
  return own ? `/v1/brand/${theme}/logo?v=${encodeURIComponent(own.updatedAt)}` : null;
}

export function useBrand(): BrandEntry[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => entries, () => entries);
}

/** La favicon de la page suit l'icône du thème actif. */
export function useFavicon(theme: string): void {
  useBrand();
  const href = markUrl(theme);
  useEffect(() => {
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }, [href]);
}
