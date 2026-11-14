// Ajoute à un thème écrit à la main (Athena) les teintes nommées des statuts, calculées sur sa surface (T-0138).
// Usage : node tools/hues.mjs athena/theme.json
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { registryOf, resolveTheme } from '@nuance/theming';
import { dataOf, hues, raisedOf } from './derive.mjs';

const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const themes = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'theme.json')))
  .map((d) => JSON.parse(readFileSync(join(root, d.name, 'theme.json'), 'utf8')));
const registry = registryOf(themes);
const tok = (v) => ({ $value: v });
for (const file of process.argv.slice(2)) {
  const theme = JSON.parse(readFileSync(file, 'utf8'));
  for (const mode of ['light', 'dark']) {
    const surface = String(resolveTheme(registry.get(theme.name), mode, registry).get('surface.default'));
    const values = hues(surface, mode === 'dark');
    theme.modes[mode].hue = Object.fromEntries(Object.entries(values).map(([n, v]) => [n, { bg: tok(v.bg), fg: tok(v.fg), border: tok(v.border) }]));
    theme.modes[mode].data = Object.fromEntries(Object.entries(dataOf(values)).map(([n, v]) => [n, tok(v)]));
    const text = String(resolveTheme(registry.get(theme.name), mode, registry).get('text.default'));
    theme.modes[mode].surface = { ...theme.modes[mode].surface, raised: tok(raisedOf(surface, text, mode === 'dark')) };
  }
  writeFileSync(file, `${JSON.stringify(theme, null, 2)}\n`);
  console.log(`${theme.name} : teintes, données et surface flottante ajoutées`);
}
