export interface LinkPair { from: string; to: string }
export interface BuiltinLinkType { key: string; outwardLabel: string; inwardLabel: string; hierarchical: boolean; pairs: LinkPair[] }

const pairs = (...p: Array<[string, string]>): LinkPair[] => p.map(([from, to]) => ({ from, to }));

/**
 * Types de liens livrés avec Athena : des données, comme les templates. Un type livré n'est écrit en base qu'à son premier
 * usage ou à sa première modification ; il reste modifiable et réinitialisable. Les paires sont des clés de types de tracker.
 */
export function builtinLinkTypes(): BuiltinLinkType[] {
  return [
    { key: 'refines', outwardLabel: 'raffine', inwardLabel: 'est raffiné par', hierarchical: true, pairs: pairs(['requirement', 'requirement'], ['design', 'requirement'], ['interface', 'requirement']) },
    { key: 'satisfies', outwardLabel: 'satisfait', inwardLabel: 'est satisfait par', hierarchical: false, pairs: pairs(['design', 'requirement'], ['interface', 'requirement'], ['task', 'requirement']) },
    { key: 'verifies', outwardLabel: 'vérifie', inwardLabel: 'est vérifié par', hierarchical: false, pairs: pairs(['test', 'requirement'], ['campaign', 'requirement']) },
    { key: 'implements', outwardLabel: 'implémente', inwardLabel: 'est implémenté par', hierarchical: false, pairs: pairs(['task', 'design'], ['task', 'requirement'], ['task', 'interface']) },
    { key: 'blocks', outwardLabel: 'bloque', inwardLabel: 'est bloqué par', hierarchical: false, pairs: [] },
    { key: 'duplicates', outwardLabel: 'duplique', inwardLabel: 'duplique', hierarchical: false, pairs: [] },
  ];
}
