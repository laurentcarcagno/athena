/**
 * Filtres en puces ⇄ fragment ATQL. Le fragment ne contient ni la clause `tracker = …` (imposée par l'écran Tracker)
 * ni `ORDER BY` (le tri a son propre paramètre). Une requête qui n'est pas une simple conjonction de ces puces
 * n'est pas représentable : `fromAtql` renvoie `null` et l'écran reste en mode requête.
 */
export interface FilterModel {
  status?: string;
  /** Assigné à l'utilisateur courant. */
  mine?: boolean;
  /** Recherche plein texte. */
  text?: string;
  /** Items ayant un lien suspect (`suspect()`). */
  suspect?: boolean;
  /** Égalités sur des champs du tracker (`severity = majeure`). */
  fields: Record<string, string>;
}

const WORD = /^[A-Za-z_][A-Za-z0-9_.\-]*$/;
const FIELD = /^[a-z][a-z0-9_]{0,39}$/;
const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
/** Valeur ATQL : mot nu quand c'est possible, sinon chaîne entre guillemets. */
export const atqlValue = (value: string) => (WORD.test(value) ? value : quote(value));

export const emptyModel = (): FilterModel => ({ fields: {} });
export const isEmpty = (m: FilterModel) => !m.status && !m.mine && !m.text && !m.suspect && Object.keys(m.fields).length === 0;

export function toAtql(model: FilterModel, username: string): string {
  const clauses: string[] = [];
  if (model.status) clauses.push(`status = ${atqlValue(model.status)}`);
  if (model.mine) clauses.push(`assignee = ${quote(username)}`);
  if (model.suspect) clauses.push('suspect()');
  for (const [field, value] of Object.entries(model.fields).sort(([a], [b]) => a.localeCompare(b))) clauses.push(`${field} = ${atqlValue(value)}`);
  if (model.text) clauses.push(`text ~ ${quote(model.text)}`);
  return clauses.join(' AND ');
}

/** Découpe sur les `AND` hors guillemets ; `null` si la requête contient autre chose (OR, NOT, parenthèses…). */
function clauses(query: string): string[] | null {
  const out: string[] = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < query.length; i += 1) {
    const ch = query[i]!;
    if (inString) {
      current += ch;
      if (ch === '\\' && i + 1 < query.length) { current += query[i + 1]; i += 1; } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; current += ch; continue; }
    if (ch === '(' && query[i + 1] === ')' && /(^|\s)suspect$/i.test(current)) { current += '()'; i += 1; continue; } // seule fonction représentable en puce
    if (ch === '(' || ch === ')') return null;
    const rest = query.slice(i);
    const and = /^\s+AND\s+/i.exec(rest);
    if (and && current.length > 0) { out.push(current.trim()); current = ''; i += and[0].length - 1; continue; }
    current += ch;
  }
  if (inString) return null;
  if (current.trim()) out.push(current.trim());
  return out;
}

const unquote = (raw: string): string | null => {
  if (raw.startsWith('"')) return raw.length >= 2 && raw.endsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : null;
  return WORD.test(raw) ? raw : null;
};

export function fromAtql(query: string, username: string): FilterModel | null {
  const model = emptyModel();
  if (!query.trim()) return model;
  const parts = clauses(query);
  if (!parts) return null;
  for (const part of parts) {
    if (/^suspect\(\)$/i.test(part)) {
      if (model.suspect) return null;
      model.suspect = true;
      continue;
    }
    const text = /^text\s*~\s*(.+)$/i.exec(part);
    if (text) {
      const value = unquote(text[1]!.trim());
      if (value === null || model.text !== undefined) return null;
      model.text = value;
      continue;
    }
    const eq = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(part);
    if (!eq) return null;
    const field = eq[1]!.toLowerCase() === 'status' ? 'status' : eq[1]!;
    const value = unquote(eq[2]!.trim());
    if (value === null) return null;
    if (field === 'status') {
      if (model.status !== undefined) return null;
      model.status = value;
    } else if (field === 'assignee' && value === username && model.mine === undefined) {
      model.mine = true;
    } else {
      if (!FIELD.test(field) || field in model.fields) return null;
      model.fields[field] = value;
    }
  }
  return model;
}
