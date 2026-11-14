// Génère la feuille du thème de connexion Keycloak (T-0139) : jetons du thème par défaut (clair et sombre selon le
// système, via @nuance/theming) suivis des règles de login.source.css, qui n'emploient que ces jetons.
// Le thème est celui par défaut de l'organisation : Keycloak sert une feuille statique, elle est donc générée au déploiement
// avec ce thème (`--theme <nom>`, Athena par défaut). Voir docs/admin (apparence).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, emitCss, formatIssues } from '@nuance/theming';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cssDir = join(root, 'deploy', 'dev', 'keycloak', 'themes', 'athena', 'login', 'resources', 'css');
const themesDir = dirname(createRequire(import.meta.url).resolve('@nuance/themes/contract.json'));
const contract = JSON.parse(readFileSync(join(themesDir, 'contract.json'), 'utf8'));
const themes = readdirSync(themesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(themesDir, d.name, 'theme.json')))
  .map((d) => JSON.parse(readFileSync(join(themesDir, d.name, 'theme.json'), 'utf8')));
const issues = check(themes, contract);
if (issues.length) { console.error(formatIssues(issues)); process.exit(1); }
const flag = process.argv.indexOf('--theme');
const themeName = flag > 0 ? process.argv[flag + 1] : 'athena';
if (!themes.some((t) => t.name === themeName && t.meta?.abstract !== true)) { console.error(`thème inconnu : ${themeName}`); process.exit(1); }
const rules = readFileSync(join(cssDir, 'login.source.css'), 'utf8');
const tokens = emitCss(themes, contract, { prefix: 'ath-', defaultTheme: themeName, only: [themeName] });
writeFileSync(join(cssDir, 'login.css'), `/* Généré par packages/ui/scripts/build-login.mjs depuis @nuance/themes et login.source.css. Ne pas modifier. */\n${tokens}\n${rules}`);
console.log(`login.css généré (thème ${themeName})`);
