import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error module JS sans types
import { lintSource } from '../scripts/lint-design.mjs';

/**
 * Thème Hemeria généré par @nuance/theming (`themes.generated.css`, ADR-0004).
 * T-0129 : chaque variable de l'ancien générateur garde sa valeur calculée, en clair et en sombre. Depuis T-0131 l'ancien
 * générateur n'existe plus : ses valeurs sont figées dans `__fixtures__/hemeria-legacy.json` (hors primitives --ath-color-*).
 * T-0132 remplace volontairement les rôles typographiques --ath-type-* par l'échelle --ath-font-* : ils sortent de la comparaison.
 */
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
/** Feuille de style complète : styles.css et ses imports, dans l'ordre. */
const readStyles = (): string => read('styles.css').replace(/@import "\.\/(styles\/[a-z-]+\.css)";/g, (_, part: string) => read(part));
const legacy = JSON.parse(read('__fixtures__/hemeria-legacy.json')) as { light: Record<string, string>; dark: Record<string, string> };

/** Déclarations `--nom: valeur;` du premier bloc dont le sélecteur commence par `selector`. */
function block(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`bloc introuvable : ${selector}`);
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('}', open));
  return new Map([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const engine = read('themes.generated.css');
const light = block(engine, ':root[data-theme="hemeria"],');
const dark = new Map([...light, ...block(engine, ':root[data-theme="hemeria"][data-mode="dark"],')]);
const px = (value: string | undefined) => Number(/^(\d+(?:\.\d+)?)px$/.exec(value ?? '')?.[1] ?? NaN);

describe('thème Hemeria généré par @nuance/theming', () => {
  for (const [mode, reference, actual] of [['clair', legacy.light, light], ['sombre', legacy.dark, dark]] as const) {
    it(`mode ${mode} : chaque variable de l’ancien générateur garde sa valeur calculée`, () => {
      const entries = Object.entries(reference).filter(([name]) => !name.startsWith('--ath-type-'));
      expect(entries.length).toBeGreaterThan(50);
      expect(entries.filter(([name, value]) => actual.get(name) !== value).map(([name, value]) => `${name} : ${value} → ${actual.get(name) ?? 'absente'}`)).toEqual([]);
    });
  }

  it('Hemeria s’applique sans attribut ; le sombre suit le système sauf mode imposé', () => {
    expect(engine).toContain(':root[data-theme="hemeria"],\n:root:not([data-theme]) {');
    expect(engine).toContain('@media (prefers-color-scheme: dark) {\n  :root[data-theme="hemeria"]:not([data-mode]),\n  :root:not([data-theme]):not([data-mode]) {');
    expect(engine).toContain(':root[data-theme="hemeria"][data-mode="dark"],\n:root:not([data-theme])[data-mode="dark"] {');
  });
});

describe('feuille de style : rien que des jetons (T-0130, T-0131)', () => {
  const styles = readStyles();

  it('styles.css importe chaque partie, dans l’ordre de la cascade', () => {
    expect(read('styles.css').match(/@import/g)?.length).toBe(14);
    expect(styles).not.toContain('@import');
  });

  it('aucune primitive, couleur, taille de police, graisse, interlettrage, couche ou durée écrite en dur', () => {
    expect(styles.match(/--ath-(color|palette)-[a-z-]+/g) ?? []).toEqual([]);
    expect(styles.match(/rgba?\(|color-mix\(|#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(styles.match(/(font-size|font-weight|letter-spacing|line-height|z-index):\s*[\d.]/g) ?? []).toEqual([]);
    expect(styles.match(/\d+ms\b/g) ?? []).toEqual([]);
    expect(lintSource(styles, 'styles.css')).toEqual([]);
  });

  it('le lint refuse taille de police, couche et transition en dur, et accepte les jetons (T-0131)', () => {
    for (const bad of ['.a{font-size:14px}', '.a{z-index:10}', '.a{transition: color .2s}']) expect(lintSource(bad, 'x.css'), bad).toHaveLength(1);
    for (const good of ['.a{font-size:var(--ath-font-size-body)}', '.a{z-index:calc(var(--ath-z-modal) + 1)}', '.a{transition:none}', '.a{transition:left var(--ath-motion-default)}', ':root{--ath-font-size-body:14px}'])
      expect(lintSource(good, 'x.css'), good).toEqual([]);
  });

  it('aucun texte sous 11 px (audit F-05) : toutes les tailles viennent d’un jeton d’au moins 11 px', () => {
    const used = [...styles.matchAll(/font-size:\s*var\((--ath-[a-z0-9-]+)\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(40);
    for (const name of new Set(used)) expect(px(light.get(name)), name).toBeGreaterThanOrEqual(11);
  });

  it('les liens des tableaux, cartes et listes ont une cible de 24 px au moins (audit F-06)', () => {
    expect(styles).toMatch(/\.ath-table \.ath-link[^{]*\{[^}]*min-height: var\(--ath-size-touch-target-min\)/);
    expect(px(light.get('--ath-size-touch-target-min'))).toBeGreaterThanOrEqual(24);
  });

  it('le texte d’état n’emploie jamais la couleur de bordure du signal (contraste, audit rejoué en T-0096)', () => {
    expect([...styles.matchAll(/(?<![-\w])color:\s*var\(--ath-state-[a-z]+-border\)/g)].map((m) => m[0])).toEqual([]);
  });
});
