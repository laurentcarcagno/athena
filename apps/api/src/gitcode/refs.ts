export type Action = 'refs' | 'fixes' | 'closes' | 'implements' | 'reverts';

export interface KeyAction {
  key: string;
  action: Action;
}

const KEY = /\b([A-Z][A-Z0-9]{1,9}-\d{1,9})\b/g;
const KEYWORD = /\b(refs?|fix(?:es|ed)?|close[sd]?|implements?|reverts?)\b[:\s]+((?:[A-Z][A-Z0-9]{1,9}-\d{1,9}(?:\s*(?:,|et|and|&)\s*)?)+)/gi;

const canonical = (word: string): Action => {
  const w = word.toLowerCase();
  if (w.startsWith('fix')) return 'fixes';
  if (w.startsWith('close')) return 'closes';
  if (w.startsWith('implement')) return 'implements';
  if (w.startsWith('revert')) return 'reverts';
  return 'refs';
};

/**
 * Extrait les clés d'artefact d'un texte (message, titre, description, nom de branche).
 * Une clé précédée d'un mot-clé (`Fixes BUG-1, BUG-2`) reçoit cette action, sinon `refs`.
 * Le texte est non fiable : tailles bornées, aucune évaluation.
 */
export function extractKeyActions(text: string, limit = 50): KeyAction[] {
  const bounded = text.slice(0, 20_000);
  const result = new Map<string, Action>();
  for (const match of bounded.matchAll(KEYWORD)) {
    const action = canonical(match[1]!);
    for (const key of match[2]!.match(KEY) ?? []) result.set(key, action);
  }
  for (const match of bounded.matchAll(KEY)) if (!result.has(match[1]!)) result.set(match[1]!, 'refs');
  return [...result.entries()].slice(0, limit).map(([key, action]) => ({ key, action }));
}

/** Clés présentes dans un nom de branche (`bugfix/BUG-12-resume`). Jamais d'action : une branche ne résout rien. */
export function keysFromBranch(branch: string): string[] {
  return [...new Set(branch.slice(0, 255).match(KEY) ?? [])];
}

export const branchName = (type: 'bugfix' | 'feature', key: string, summary: string): string => {
  const slug = summary.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${type}/${key}${slug ? `-${slug}` : ''}`;
};
