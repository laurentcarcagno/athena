export const CSV_LIMITS = { maxBytes: 20 * 1024 * 1024, maxRows: 100_000, maxColumns: 200 };

/**
 * Lecteur CSV conforme à la RFC 4180 : champs entre guillemets, guillemets doublés, retours à la ligne dans les champs,
 * BOM ignoré, séparateur `,`, `;` ou tabulation détecté sur l'en-tête. Les tailles sont bornées (entrée non fiable).
 */
export function parseCsv(input: string): string[][] {
  if (Buffer.byteLength(input) > CSV_LIMITS.maxBytes) throw new Error('fichier CSV trop volumineux');
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (d: string) => firstLine.split(d).length - 1;
  const delimiter = count('\t') > Math.max(count(';'), count(',')) ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
    if (row.length > CSV_LIMITS.maxColumns) throw new Error('trop de colonnes');
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '') rows.push(row); // ignore les lignes vides
    row = [];
    if (rows.length > CSV_LIMITS.maxRows) throw new Error('trop de lignes');
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === '\n') endRow();
    else if (ch === '\r') { /* ignoré : \r\n traité sur \n */ }
    else field += ch;
  }
  if (quoted) throw new Error('guillemet non fermé');
  if (field !== '' || row.length > 0) endRow();
  return rows;
}
