// Contrôle des licences d'un SBOM CycloneDX (plan § 13.2 : « licences vérifiées »).
// Usage : node tools/check-licenses.mjs sbom.cdx.json
// Échec (code 1) si un composant porte une licence hors de la liste autorisée, ou aucune licence déclarée et absente de la liste d'exceptions.
import { readFileSync } from 'node:fs';

/** Licences permissives ou à copyleft faible acceptées pour des dépendances utilisées sans modification. */
export const ALLOWED = new Set([
  'MIT', 'MIT-0', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'Unlicense', 'Python-2.0', 'MPL-2.0', 'Zlib', 'WTFPL', 'OFL-1.1',
]);
/** Exceptions justifiées : composant sans licence déclarée mais examiné (nom exact du paquet). */
export const EXCEPTIONS = new Set([]);

/** Une expression SPDX est acceptée si, pour chaque « AND », une des alternatives « OR » est autorisée. */
export function acceptable(expression) {
  const text = String(expression).replace(/[()]/g, ' ');
  return text.split(/\s+AND\s+/i).every((part) => part.split(/\s+OR\s+/i).some((id) => ALLOWED.has(id.trim())));
}

export function check(sbom) {
  const problems = [];
  for (const c of sbom.components ?? []) {
    const name = `${c.group ? `${c.group}/` : ''}${c.name}@${c.version ?? '?'}`;
    const licenses = (c.licenses ?? []).map((l) => l.expression ?? l.license?.id ?? l.license?.name).filter(Boolean);
    if (licenses.length === 0) { if (!EXCEPTIONS.has(c.name)) problems.push(`${name} : aucune licence déclarée`); continue; }
    if (!licenses.some((l) => acceptable(l))) problems.push(`${name} : licence non autorisée (${licenses.join(', ')})`);
  }
  return problems;
}

if (process.argv[1] && process.argv[1].endsWith('check-licenses.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('Usage : node tools/check-licenses.mjs sbom.cdx.json'); process.exit(2); }
  const problems = check(JSON.parse(readFileSync(file, 'utf8')));
  if (problems.length) { console.error(`${problems.length} composant(s) à examiner :\n${problems.join('\n')}`); process.exit(1); }
  console.log('Licences conformes.');
}
