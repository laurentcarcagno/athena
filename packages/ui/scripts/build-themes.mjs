// Génère les CSS des thèmes depuis @nuance/themes avec le moteur @nuance/theming (ADR-0004, T-0129, T-0136).
// - src/themes.generated.css : Athena, thème par défaut (appliqué aussi sans attribut data-theme) ;
// - src/themes/<nom>.generated.css : un fichier par autre thème, chargé à la demande par l'application ;
// - src/themes.catalog.generated.ts : nom, libellé, couleurs d'aperçu (vignettes du Profil) et icône de marque par défaut
//   (mark.svg du thème ou hérité, `currentColor` remplacé par le texte sur surface inverse, en URI data: : CSP img-src data:).
// Variables préfixées `ath-` ; attributs data-theme (famille) et data-mode (mode). Un thème non conforme n'est jamais émis.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, emitCss, formatIssues, registryOf, resolveTheme } from '@nuance/theming';

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
const DEFAULT = 'athena';
const concrete = themes.filter((t) => t.meta?.abstract !== true);
const options = { prefix: 'ath-', defaultTheme: DEFAULT };
writeFileSync(join(root, 'src', 'themes.generated.css'), emitCss(themes, contract, { ...options, only: [DEFAULT] }));
mkdirSync(join(root, 'src', 'themes'), { recursive: true });
for (const theme of concrete.filter((t) => t.name !== DEFAULT)) {
  writeFileSync(join(root, 'src', 'themes', `${theme.name}.generated.css`), emitCss(themes, contract, { ...options, only: [theme.name] }));
}
// Catalogue : de quoi dessiner une vignette sans charger le thème (fond, carte, rail, accent, texte, par mode).
const registry = registryOf(themes);
const preview = (theme, mode) => {
  const t = resolveTheme(theme, mode, registry);
  return { app: t.get('surface.app'), surface: t.get('surface.default'), inverse: t.get('surface.inverse'), accent: t.get('action.primary.bg'), text: t.get('text.default') };
};
/** Icône de marque par défaut : mark.svg du thème, sinon celui de son parent (base). */
const markOf = (theme) => {
  for (let t = theme; t; t = t.extends ? registry.get(t.extends) : undefined) {
    const file = join(themesDir, t.name, 'mark.svg');
    if (existsSync(file)) {
      const svg = readFileSync(file, 'utf8').trim().replace(/currentColor/g, String(resolveTheme(theme, 'light', registry).get('text.on-inverse')));
      return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
  }
  return null;
};
const catalog = concrete
  .sort((a, b) => (a.name === DEFAULT ? -1 : b.name === DEFAULT ? 1 : a.label.localeCompare(b.label, 'fr')))
  .map((t) => ({ name: t.name, label: t.label, mark: markOf(t), light: preview(t, 'light'), dark: preview(t, 'dark') }));
writeFileSync(join(root, 'src', 'themes.catalog.generated.ts'), `// Généré par scripts/build-themes.mjs. Ne pas modifier.
export interface ThemePreview { app: string; surface: string; inverse: string; accent: string; text: string }
export interface ThemeEntry { name: string; label: string; mark: string | null; light: ThemePreview; dark: ThemePreview }
export const THEME_CATALOG: ThemeEntry[] = ${JSON.stringify(catalog, null, 2)};
export const DEFAULT_THEME = '${DEFAULT}';
`);
console.log(`thèmes générés : ${catalog.map((t) => t.name).join(', ')}`);
