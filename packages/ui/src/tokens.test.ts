import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokens } from './tokens.generated.js';
// @ts-expect-error module JS sans types
import { lintSource, palette } from '../scripts/lint-design.mjs';

describe('jetons Hemeria', () => {
  it('expose les couleurs de la charte', () => {
    expect(tokens.colors['sovereign-deep-blue']).toBe('#12293A');
    expect(tokens.colors['console-sky']).toBe('#006EB1');
    expect(tokens.colors['tricolor-red']).toBe('#C80A26');
    expect(tokens.colors['signal-danger']).toBe('#BA1A1A');
  });
  it('aucun arrondi', () => {
    expect(tokens.radius.none).toBe('0');
  });
  it('typographie IBM Plex', () => {
    expect(tokens.typography.body.fontFamily).toContain('IBM Plex Sans');
    expect(tokens.typography.mono.fontFamily).toContain('IBM Plex Mono');
  });
});

describe('palette du lint', () => {
  it('vient des seules couleurs du front matter (19 couleurs + blanc et noir purs)', () => {
    expect(palette.size).toBe(21);
    expect(palette.has('#12293a')).toBe(true);
  });
});

describe('lint design', () => {
  it('accepte une feuille conforme', () => {
    expect(lintSource('a{border-radius:0;color:#12293A;box-shadow:none}')).toEqual([]);
  });
  it.each([
    ['a{border-radius:4px}', 'border-radius'],
    ['a{box-shadow:0 1px 2px #12293A}', 'box-shadow'],
    ['a{background:linear-gradient(#12293A,#006EB1)}', 'dégradé'],
    ['a{backdrop-filter:blur(4px)}', 'backdrop-filter'],
    ['a{color:#123456}', 'hors palette'],
  ])('refuse %s', (src, word) => {
    expect(lintSource(src).join()).toContain(word);
  });
});

describe('thème sombre généré', () => {
  const css = readFileSync(join(__dirname, 'tokens.generated.css'), 'utf8');
  const block = (start: string): string => {
    const from = css.indexOf(start);
    expect(from, start).toBeGreaterThan(-1);
    return css.slice(from, css.indexOf('\n}', from));
  };
  const names = (text: string): string[] => [...text.matchAll(/^\s*(--ath-[a-z0-9-]+):/gm)].map((m) => m[1]!);
  const light = block(':root {');
  const dark = block(':root[data-theme="dark"] {');

  it('déclare les deux sélecteurs sombres : attribut explicite et préférence du système', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(light).toContain('color-scheme: light;');
    expect(dark).toContain('color-scheme: dark;');
  });

  it('le thème sombre redéfinit chaque variable sémantique du thème clair (mêmes clés)', () => {
    const semantic = (n: string) => /^--ath-(surface|text|border|action|state|focus)-/.test(n);
    expect(names(dark).filter(semantic).sort()).toEqual(names(light).filter(semantic).sort());
  });

  it('valeurs sombres de DESIGN.json et réaffectation des primitives par rôle', () => {
    expect(dark).toContain('--ath-surface-default: #0E2230;');
    expect(dark).toContain('--ath-text-default: #F0F7FC;');
    expect(dark).toContain('--ath-color-instrument-white: var(--ath-surface-default);');
    expect(dark).toContain('--ath-color-ink: var(--ath-text-default);');
    expect(dark).not.toContain('--ath-color-tricolor-red'); // couleur de marque : jamais réaffectée
    expect(dark).not.toContain('--ath-color-tricolor-blue');
  });

  it('le thème clair garde les valeurs d’avant (texte secondaire, lien, signal danger)', () => {
    expect(light).toContain('--ath-text-mute: #505358;');
    expect(light).toContain('--ath-text-link: #005E96;');
    expect(light).toContain('--ath-state-danger-fg: #9E1616;');
    expect(light).toContain('--ath-surface-default: var(--ath-color-instrument-white);');
  });

  it('aucune référence sémantique ne reste non résolue', () => {
    expect(css).not.toMatch(/\{(colors|semantic|overlays)\./);
  });

  it('la feuille de style n’écrit aucune couleur sombre en dur : elle consomme les jetons', () => {
    const styles = readFileSync(join(__dirname, 'styles.css'), 'utf8').toLowerCase();
    for (const hex of ['#0e2230', '#0a1b27', '#06121c', '#264e6e', '#5c95bb']) expect(styles).not.toContain(hex);
    expect(lintSource(styles, 'styles.css')).toEqual([]);
  });
});

describe('garde-fous de l’audit d’interface (F-05, F-06)', () => {
  const styles = readFileSync(join(__dirname, 'styles.css'), 'utf8');

  it('aucun texte sous 11 px (F-05)', () => {
    const sizes = [...styles.matchAll(/(?<![-\w])font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(10);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });

  it('les liens des tableaux, cartes et listes ont une cible de 24 px au moins (F-06)', () => {
    expect(styles).toMatch(/\.ath-table \.ath-link[^{]*\{[^}]*min-height: 24px/);
  });

  it('le texte d’état n’emploie jamais la couleur de signal brute (contraste, trouvé par l’audit rejoué en T-0096)', () => {
    const rawText = [...styles.matchAll(/(?<![-\w])color:\s*var\(--ath-color-signal-[a-z]+\)/g)].map((m) => m[0]);
    expect(rawText).toEqual([]);
  });
});

