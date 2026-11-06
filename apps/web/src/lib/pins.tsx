import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';

export interface PinEntry { kind: 'project' | 'tracker' | 'view' | 'item'; project: string; ref: string; label: string }
export interface Pin extends PinEntry { id: string; favorite: boolean }

/** Adresse d'un favori ou d'un récent. Une vue est désignée par `TRACKER:identifiant`. */
export function pinHref(pin: PinEntry): string {
  switch (pin.kind) {
    case 'project': return `/p/${pin.project}`;
    case 'tracker': return `/p/${pin.project}/t/${pin.ref}/tableau`;
    case 'view': { const [tracker, id] = pin.ref.split(':'); return `/p/${pin.project}/t/${tracker}/tableau?v=${id}`; }
    case 'item': return `/p/${pin.project}/a/${pin.ref}`;
  }
}

const CANONICAL_ITEM = /^[A-Z][A-Z0-9]{1,9}-[A-Z][A-Z0-9]{1,9}-\d{4,9}$/;

/** Éléments à noter comme « ouverts » pour une adresse : le projet, puis le tracker ou l'item. */
export function entriesOf(pathname: string): PinEntry[] {
  const out: PinEntry[] = [];
  const project = /^\/p\/([A-Z][A-Z0-9]{1,9})(?:\/|$)/.exec(pathname)?.[1];
  if (!project) return out;
  out.push({ kind: 'project', project, ref: project, label: project });
  const tracker = /^\/p\/[^/]+\/t\/([A-Z][A-Z0-9]{1,9})(?:\/|$)/.exec(pathname)?.[1];
  if (tracker) out.push({ kind: 'tracker', project, ref: tracker, label: `${project} · ${tracker}` });
  const item = /^\/p\/[^/]+\/a\/([^/]+)$/.exec(pathname)?.[1];
  if (item && CANONICAL_ITEM.test(item)) out.push({ kind: 'item', project, ref: item, label: item });
  return out;
}

interface PinsApi {
  favorites: Pin[];
  recents: Pin[];
  isFavorite: (entry: PinEntry) => boolean;
  toggle: (entry: PinEntry) => Promise<void>;
  move: (id: string, delta: -1 | 1) => Promise<void>;
  visit: (entry: PinEntry) => void;
}
const empty: PinsApi = { favorites: [], recents: [], isFavorite: () => false, toggle: async () => undefined, move: async () => undefined, visit: () => undefined };
const Context = createContext<PinsApi>(empty);
export const usePins = () => useContext(Context);

const same = (a: PinEntry, b: PinEntry) => a.kind === b.kind && a.project === b.project && a.ref === b.ref;

/** Favoris et récents de l'utilisateur, chargés une fois puis tenus à jour par les actions. Une erreur laisse les listes vides. */
export function PinsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ favorites: Pin[]; recents: Pin[] }>({ favorites: [], recents: [] });
  const load = useCallback(async () => {
    try {
      const r = await api<{ favorites: Array<Omit<Pin, 'favorite'>>; recents: Array<Omit<Pin, 'favorite'>> }>('GET', '/v1/me/pins');
      setState({ favorites: (r.favorites ?? []).map((p) => ({ ...p, favorite: true })), recents: (r.recents ?? []).map((p) => ({ ...p, favorite: false })) });
    } catch { /* le rail reste utilisable sans favoris */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const value = useMemo<PinsApi>(() => ({
    favorites: state.favorites,
    recents: state.recents,
    isFavorite: (entry) => state.favorites.some((p) => same(p, entry)),
    toggle: async (entry) => {
      const favorite = !state.favorites.some((p) => same(p, entry));
      await api('PUT', '/v1/me/pins/favorite', { ...entry, favorite }).catch(() => undefined);
      await load();
    },
    move: async (id, delta) => {
      const ids = state.favorites.map((p) => p.id);
      const index = ids.indexOf(id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
      await api('PUT', '/v1/me/pins/order', { ids }).catch(() => undefined);
      await load();
    },
    visit: (entry) => { void api('POST', '/v1/me/pins/visit', entry).then(load).catch(() => undefined); },
  }), [state, load]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
