import { z } from 'zod';

/**
 * Teintes nommées des statuts (ADR-0004, T-0138). L'administration choisit un nom, jamais un code couleur : chaque thème
 * fournit le fond, le texte et la bordure de chaque teinte, vérifiés en contraste. Sans teinte, la catégorie décide.
 */
export const HUES = ['gray', 'slate', 'blue', 'sky', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple'] as const;
export type Hue = (typeof HUES)[number];
export const HueSchema = z.enum(HUES);
