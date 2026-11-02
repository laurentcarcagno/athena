import { z } from 'zod';

/**
 * Disposition de la vue détails d'un artefact : des sections titrées, chacune une grille de 3 colonnes ;
 * un attribut occupe 1, 2 ou 3 colonnes. Les attributs absents de la disposition sont affichés à la suite
 * (un champ ajouté plus tard n'est donc jamais masqué).
 */
export const LayoutSchema = z.object({
  sections: z.array(z.object({
    title: z.string().trim().max(100),
    fields: z.array(z.object({ key: z.string().min(1).max(60), span: z.union([z.literal(1), z.literal(2), z.literal(3)]) })).max(100),
  })).min(1).max(20),
});
export type Layout = z.infer<typeof LayoutSchema>;

/** Erreurs de cohérence entre une disposition et les champs du tracker (liste vide si valide). */
export function layoutProblems(layout: Layout, fieldKeys: string[]): string[] {
  const known = new Set(fieldKeys);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const section of layout.sections) {
    for (const f of section.fields) {
      if (!known.has(f.key)) out.push(`disposition : champ inconnu ${f.key}`);
      else if (seen.has(f.key)) out.push(`disposition : champ placé deux fois ${f.key}`);
      seen.add(f.key);
    }
  }
  return out;
}
