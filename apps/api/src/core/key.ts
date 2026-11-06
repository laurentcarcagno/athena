/**
 * Clés d'item (ADR-0002 § 2) : `<PROJET>-<TRACKER>-<n sur 4 chiffres minimum>`, par exemple `SAT1-REQ-0042`.
 * L'ancien format `<TRACKER>-<n>` subsiste comme alias, résolu dans le contexte d'un projet.
 */
const SEGMENT = '[A-Z][A-Z0-9]{1,9}';

/** Clé canonique (ancrée). */
export const CANONICAL_KEY = new RegExp(`^${SEGMENT}-${SEGMENT}-\\d{4,9}$`);
/** Ancienne clé (ancrée) : `REQ-42`. */
export const LEGACY_KEY = new RegExp(`^${SEGMENT}-\\d{1,9}$`);

export const formatKey = (projectKey: string, trackerKey: string, number: number): string =>
  `${projectKey}-${trackerKey}-${String(number).padStart(4, '0')}`;

export const isCanonicalKey = (key: string): boolean => CANONICAL_KEY.test(key);
export const isLegacyKey = (key: string): boolean => LEGACY_KEY.test(key);
/** Vrai pour une clé acceptée en entrée (canonique ou ancienne). */
export const isItemKey = (key: string): boolean => isCanonicalKey(key) || isLegacyKey(key);

/** Découpe une clé canonique ; `null` pour tout autre texte. */
export function parseKey(key: string): { project: string; tracker: string; number: number } | null {
  if (!isCanonicalKey(key)) return null;
  const [project, tracker, number] = key.split('-') as [string, string, string];
  return { project, tracker, number: Number(number) };
}

/** Motif (sans ancres) reconnaissant une clé dans un texte : la forme canonique est essayée avant l'ancienne. */
export const ITEM_KEY_PATTERN = `(?:${SEGMENT}-${SEGMENT}-\\d{4,9}|${SEGMENT}-\\d{1,9})`;
/** Fichier d'artefact de l'historique : `trackers/<TRACKER>/artifacts/<clé>.yaml` ; groupe 1 = la clé (ancienne ou canonique). */
export const ARTIFACT_FILE = new RegExp(`^trackers/[A-Z0-9]+/artifacts/(${ITEM_KEY_PATTERN})\\.yaml$`);
/** Clé complète (ancrée), canonique ou ancienne. */
export const ITEM_KEY = new RegExp(`^${ITEM_KEY_PATTERN}$`);
/** Balayage d'un texte ; à recréer ou réinitialiser (`lastIndex`) avant chaque usage car l'indicateur `g` garde un état. */
export const itemKeyScanner = (): RegExp => new RegExp(`\\b(${ITEM_KEY_PATTERN})\\b`, 'g');
