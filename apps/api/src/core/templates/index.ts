import type { BuiltinNormative } from './common';
import { DEFENSE } from './defense';
import { ECSS_M_ST_10 } from './ecss-m-st-10';
import { IM_1618 } from './im-1618';
import { SPATIAL } from './spatial';

export type { BuiltinNormative, BuiltinVersion } from './common';

/** Gabarits normatifs livrés avec Athena, en données ; chaque version publiée est immuable (elle ne change que par le code livré). */
export const BUILTIN_NORMATIVE: readonly BuiltinNormative[] = [SPATIAL, DEFENSE, ECSS_M_ST_10, IM_1618];
export const builtinNormative = (key: string): BuiltinNormative | undefined => BUILTIN_NORMATIVE.find((t) => t.key === key);
