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
const issues = check(themes, contract);
if (issues.length) {
  console.error(formatIssues(issues));
  process.exit(1);
}
console.log(`@nuance/themes : ${themes.length} thème(s) conforme(s) dans ${contract.modes.length} mode(s), ${contract.contrast.length} paires de contraste.`);
