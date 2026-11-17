/** Rôles sémantiques d'un champ : ce que le champ représente, quel que soit son nom (« Début », « Avancement »…). Unique par tracker. */
export const SEMANTIC_ROLES = ['title', 'description', 'status', 'assignee', 'due_date', 'estimate', 'priority', 'version', 'start_date', 'progress', 'remaining', 'probability', 'impact'] as const;
export type SemanticRole = (typeof SEMANTIC_ROLES)[number];

/** Rôles de planification (lot 12) et de risque (lot 17 : probabilité et impact de 1 à 5, criticité = produit, calculée) et type de champ qu'ils exigent. Les autres rôles ne contraignent pas le type. */
export const ROLE_FIELD_TYPE: Partial<Record<SemanticRole, string>> = { start_date: 'date', progress: 'number', remaining: 'number', probability: 'number', impact: 'number' };

/** Messages d'erreur pour les champs dont le rôle exige un autre type. */
export function roleTypeProblems(fields: Array<{ key: string; type: string; semanticRole?: string | null }>): string[] {
  const problems: string[] = [];
  for (const f of fields) {
    const need = f.semanticRole ? ROLE_FIELD_TYPE[f.semanticRole as SemanticRole] : undefined;
    if (need && f.type !== need) problems.push(`champ ${f.key} : le rôle ${f.semanticRole} exige un champ de type ${need} (type ${f.type})`);
  }
  return problems;
}
