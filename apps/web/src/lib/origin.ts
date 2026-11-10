import { useLocation, type Location } from 'react-router-dom';

/**
 * Origine d'une fiche (T-0113) : la liste ou le ticket d'où l'on vient, transmis dans l'état de navigation. La fiche en
 * tire « Retour » et, depuis une liste, « Précédent » / « Suivant ». L'origine se chaîne (liste › A › B) : revenir de B
 * rend à A sa propre origine. L'état de navigation survit au rechargement de la page, pas à un nouvel onglet.
 */
export interface Origin {
  /** Adresse de retour (chemin et paramètres : filtres, tri, page). */
  href: string;
  /** Libellé de l'origine : nom de la liste ou clé du ticket. */
  label: string;
  /** Clés de la liste d'origine, dans son ordre (précédent et suivant). */
  keys?: string[];
  /** Origine de l'origine (chaîne liste › ticket › ticket), bornée à `DEPTH` niveaux. */
  from?: Origin;
}

const DEPTH = 5;

function valid(value: unknown, depth = 0): Origin | null {
  if (!value || typeof value !== 'object' || depth >= DEPTH) return null;
  const v = value as Record<string, unknown>;
  if (typeof v['href'] !== 'string' || !v['href'].startsWith('/') || v['href'].startsWith('//') || typeof v['label'] !== 'string') return null;
  const keys = Array.isArray(v['keys']) ? v['keys'].filter((k): k is string => typeof k === 'string') : undefined;
  const parent = valid(v['from'], depth + 1);
  return { href: v['href'], label: v['label'], ...(keys ? { keys } : {}), ...(parent ? { from: parent } : {}) };
}

/** Origine portée par l'adresse courante, ou `null`. */
export const originOf = (location: Pick<Location, 'state'>): Origin | null => valid((location.state as { from?: unknown } | null)?.from);
export const useOrigin = (): Origin | null => originOf(useLocation());

/** État de navigation « je viens d'ici », à passer à `<Link state>` ou `navigate(…, { state })`. */
export function fromHere(location: Pick<Location, 'pathname' | 'search' | 'state'>, label: string, keys?: string[]): { from: Origin } {
  const parent = originOf(location);
  return { from: { href: location.pathname + location.search, label, ...(keys ? { keys } : {}), ...(parent ? { from: parent } : {}) } };
}
