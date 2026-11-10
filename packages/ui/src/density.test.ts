import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** T-0135 : densité Compacte et écrans tactiles. Jamais de texte sous 12 px ni de cible sous 24 px ; 44 px au doigt. */
const density = readFileSync(join(__dirname, 'styles', 'density.css'), 'utf8');
const theme = readFileSync(join(__dirname, 'themes.generated.css'), 'utf8');
const block = (css: string, selector: string) => {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  return new Map([...css.slice(open + 1, css.indexOf('}', open)).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
};
const px = (v: string | undefined) => Number(/^(\d+)px$/.exec(v ?? '')?.[1] ?? NaN);
const normal = block(theme, ':root[data-theme="hemeria"],');
const compact = new Map([...normal, ...block(density, ':root[data-density="compact"] {')]);
const coarse = block(density, ':root[data-density], :root:not([data-density]) {');

describe('densité (T-0135)', () => {
  it('Compacte resserre contrôles, lignes et titres', () => {
    expect(px(compact.get('--ath-size-control-md'))).toBeLessThan(px(normal.get('--ath-size-control-md')));
    expect(px(compact.get('--ath-font-size-body'))).toBeLessThan(px(normal.get('--ath-font-size-body')));
    expect(density).toMatch(/:root\[data-density="compact"\] \{[^}]*--ath-row-y: var\(--ath-space-xs\)/);
  });

  it('jamais de texte sous 12 px ni de cible sous 24 px, même en Compacte', () => {
    for (const [name, value] of compact) if (name.startsWith('--ath-font-size-')) expect(px(value), name).toBeGreaterThanOrEqual(12);
    for (const name of ['--ath-size-control-sm', '--ath-size-control-md', '--ath-size-icon-button', '--ath-size-icon-button-compact', '--ath-size-touch-target-min']) {
      expect(px(compact.get(name)), name).toBeGreaterThanOrEqual(24);
    }
  });

  it('écran tactile : cibles de 44 px quelle que soit la densité', () => {
    expect(density).toContain('@media (pointer: coarse)');
    for (const name of ['--ath-size-control-sm', '--ath-size-control-md', '--ath-size-icon-button', '--ath-size-icon-button-compact', '--ath-size-touch-target-min']) {
      expect(px(coarse.get(name)), name).toBe(44);
    }
  });
});
