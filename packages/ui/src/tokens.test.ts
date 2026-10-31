import { describe, expect, it } from 'vitest';
import { tokens } from './tokens.generated.js';
// @ts-expect-error module JS sans types
import { lintSource } from '../scripts/lint-design.mjs';

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
