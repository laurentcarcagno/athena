import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T-0129 (ADR-0004) : le CSS généré par @nuance/theming depuis le thème Hemeria (`themes.generated.css`) donne à chaque
 * variable la même valeur calculée que l'ancien générateur (`tokens.generated.css`), en clair et en sombre. Les deux
 * fichiers sont lus comme le ferait le navigateur : blocs applicables au mode, puis résolution des `var(--…)`.
 */
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');

/** Déclarations `--nom: valeur;` du premier bloc dont le sélecteur commence par `selector`. */
function block(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`bloc introuvable : ${selector}`);
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('}', open));
  return new Map([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

/** Valeurs calculées : chaque `var(--x)` est remplacé par la valeur de `--x` dans le même environnement. */
function computed(vars: Map<string, string>): Map<string, string> {
  const resolve = (value: string, depth = 0): string => {
    if (depth > 20) throw new Error(`référence trop profonde : ${value}`);
    return value.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => {
      const target = vars.get(name);
      if (target === undefined) throw new Error(`variable inconnue : ${name}`);
      return resolve(target, depth + 1);
    });
  };
  return new Map([...vars].map(([k, v]) => [k, resolve(v)]));
}

const legacy = read('tokens.generated.css');
const engine = read('themes.generated.css');

const legacyLight = computed(block(legacy, ':root {'));
const legacyDark = computed(new Map([...block(legacy, ':root {'), ...block(legacy, ':root[data-theme="dark"] {')]));
const engineLight = computed(block(engine, ':root[data-theme="hemeria"],'));
const engineDark = computed(new Map([...block(engine, ':root[data-theme="hemeria"],'), ...block(engine, ':root[data-theme="hemeria"][data-mode="dark"],')]));

describe('thème Hemeria généré par @nuance/theming', () => {
  for (const [mode, before, after] of [['clair', legacyLight, engineLight], ['sombre', legacyDark, engineDark]] as const) {
    it(`mode ${mode} : chaque variable de l’ancien CSS a la même valeur calculée`, () => {
      expect(before.size).toBeGreaterThan(100);
      const differences = [...before].filter(([name, value]) => after.get(name) !== value).map(([name, value]) => `${name} : ${value} → ${after.get(name) ?? 'absente'}`);
      expect(differences).toEqual([]);
    });
  }

  it('n’ajoute aucune variable inconnue de l’ancien CSS', () => {
    expect([...engineLight.keys()].filter((name) => !legacyLight.has(name))).toEqual([]);
  });

  it('Hemeria s’applique sans attribut ; le sombre suit le système sauf mode imposé', () => {
    expect(engine).toContain(':root[data-theme="hemeria"],\n:root:not([data-theme]) {');
    expect(engine).toContain('@media (prefers-color-scheme: dark) {\n  :root[data-theme="hemeria"]:not([data-mode]),\n  :root:not([data-theme]):not([data-mode]) {');
    expect(engine).toContain(':root[data-theme="hemeria"][data-mode="dark"],\n:root:not([data-theme])[data-mode="dark"] {');
  });
});
