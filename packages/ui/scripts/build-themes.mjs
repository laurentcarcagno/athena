// Génère src/themes.generated.css depuis @nuance/themes avec le moteur @nuance/theming (ADR-0004, T-0129).
// Variables préfixées `ath-` ; thème par défaut Hemeria ; attributs data-theme (famille) et data-mode (mode).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, emitCss, formatIssues } from '@nuance/theming';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const themesDir = dirname(createRequire(import.meta.url).resolve('@nuance/themes/contract.json'));
const contract = JSON.parse(readFileSync(join(themesDir, 'contract.json'), 'utf8'));
const themes = readdirSync(themesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(themesDir, d.name, 'theme.json')))
  .map((d) => JSON.parse(readFileSync(join(themesDir, d.name, 'theme.json'), 'utf8')));
const issues = check(themes, contract);
if (issues.length) {
  console.error(formatIssues(issues));
  process.exit(1);
}
writeFileSync(join(root, 'src', 'themes.generated.css'), emitCss(themes, contract, { prefix: 'ath-', defaultTheme: 'hemeria' }));
console.log(`themes.generated.css : ${themes.map((t) => t.name).join(', ')}`);
