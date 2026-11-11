// Contrôle chaque thème (dossier contenant theme.json) contre le contrat : jetons obligatoires et contrastes, par mode.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, formatIssues } from '@nuance/theming';

const here = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(here, 'contract.json'), 'utf8'));
const themes = readdirSync(here, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(here, d.name, 'theme.json')))
  .map((d) => JSON.parse(readFileSync(join(here, d.name, 'theme.json'), 'utf8')));
// Un thème marqué AAA (meta.aaa) doit tenir 7:1 sur toutes les paires de texte (4,5 au contrat).
const aaa = themes.filter((t) => t.meta?.aaa).map((t) => t.name);
const strict = { ...contract, contrast: contract.contrast.map((p) => (p.min >= 4.5 ? { ...p, min: 7 } : p)) };
const issues = [...check(themes, contract), ...(aaa.length ? check(themes, strict, aaa) : [])];
const concrete = themes.filter((t) => t.meta?.abstract !== true);
if (issues.length) {
  console.error(formatIssues(issues));
  process.exit(1);
}
console.log(`@nuance/themes : ${concrete.length} thème(s) conforme(s) (${concrete.map((t) => t.name).join(", ")}) dans ${contract.modes.length} mode(s), ${contract.contrast.length} paires de contraste.`);
