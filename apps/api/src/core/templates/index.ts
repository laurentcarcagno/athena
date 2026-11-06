import type { BuiltinNormative } from './common';
import { DEFENSE } from './defense';
import { SPATIAL } from './spatial';

export type { BuiltinNormative, BuiltinVersion } from './common';

/** Gabarits normatifs livrés avec Athena, en données ; chaque version publiée est immuable (elle ne change que par le code livré). */
export const BUILTIN_NORMATIVE: readonly BuiltinNormative[] = [SPATIAL, DEFENSE];
export const builtinNormative = (key: string): BuiltinNormative | undefined => BUILTIN_NORMATIVE.find((t) => t.key === key);
