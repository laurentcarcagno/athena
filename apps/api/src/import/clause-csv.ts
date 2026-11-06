import { parseCsv } from './csv';

/** Une clause d'une norme lue dans un fichier CSV : référence, titre, texte (et norme, facultative). */
export interface ClauseRow { line: number; reference: string; title: string; text: string; standard: string }
export interface ClauseRowError { line: number; reference: string; message: string }
export interface ParsedClauses { rows: ClauseRow[]; errors: ClauseRowError[] }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = {
  reference: ['reference', 'ref', 'clause', 'id', 'identifiant', 'numero', 'number'],
  title: ['title', 'titre', 'intitule', 'name', 'nom'],
  text: ['text', 'texte', 'statement', 'enonce', 'exigence', 'requirement', 'description'],
  standard: ['standard', 'norme', 'referentiel'],
} as const;
export const CLAUSE_COLUMNS = 'référence, titre, texte';
export const MAX_CLAUSES = 5000;

/**
 * Lit un CSV de clauses (BOM, séparateur `,` `;` ou tabulation, guillemets). Les lignes invalides ou en double sont
 * signalées avec leur numéro (l'en-tête est la ligne 1) et n'empêchent pas l'import des autres.
 */
export function parseClauses(csv: string): ParsedClauses {
  let table: string[][];
  try { table = parseCsv(csv); } catch (e) { throw new Error(`CSV illisible : ${(e as Error).message}`); }
  const header = table[0];
  if (!header) throw new Error('le fichier est vide');
  const column = (names: readonly string[]) => header.findIndex((h) => names.includes(norm(h)));
  const idx = { reference: column(ALIASES.reference), title: column(ALIASES.title), text: column(ALIASES.text), standard: column(ALIASES.standard) };
  if (idx.reference < 0 || idx.title < 0) throw new Error(`colonnes attendues : ${CLAUSE_COLUMNS} (en-tête de la première ligne)`);
  if (table.length - 1 > MAX_CLAUSES) throw new Error(`trop de clauses (maximum ${MAX_CLAUSES})`);
  const rows: ClauseRow[] = [];
  const errors: ClauseRowError[] = [];
  const seen = new Map<string, number>();
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (k: number) => (k < 0 ? '' : (cells[k] ?? '').trim());
    const reference = get(idx.reference), title = get(idx.title);
    if (!reference) return void errors.push({ line, reference, message: 'référence manquante' });
    if (!title) return void errors.push({ line, reference, message: 'titre manquant' });
    if (reference.length > 200 || title.length > 200) return void errors.push({ line, reference, message: 'référence ou titre trop long (200 caractères)' });
    const first = seen.get(reference);
    if (first !== undefined) return void errors.push({ line, reference, message: `doublon de la ligne ${first}` });
    seen.set(reference, line);
    rows.push({ line, reference, title, text: get(idx.text), standard: get(idx.standard) });
  });
  return { rows, errors };
}
