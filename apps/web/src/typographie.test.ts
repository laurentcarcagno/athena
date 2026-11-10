import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import { formatDate, formatDateTime } from './lib/dates';

/** T-0132 (ADR-0004) : casse de phrase, un traitement par niveau de titre, dates localisées. */
const root = resolve(process.cwd(), '../..');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === 'node_modules' || name === 'dist') return [];
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const sources = [...walk(join(root, 'apps/web/src')), join(root, 'packages/ui/src/components.tsx')].filter((f) => f.endsWith('.tsx') && !/\.test\.tsx$/.test(f));
const styles = walk(join(root, 'packages/ui/src/styles')).map((f) => readFileSync(f, 'utf8')).join('\n');

describe('typographie (T-0132)', () => {
  it('aucun texte n’est mis en capitales par la feuille de style', () => {
    expect(styles).not.toMatch(/text-transform:\s*uppercase/);
  });

  it('chaque niveau de titre a un seul traitement (h2 section, h3 sous-section, h4 groupe), hors navigation du rail', () => {
    const expected: Record<string, string> = { h2: 'ath-section-title', h3: 'ath-subsection-title', h4: 'ath-group-title' };
    const offenders: string[] = [];
    for (const file of sources) {
      for (const m of readFileSync(file, 'utf8').matchAll(/<(h[234])\b([^>]*)>/g)) {
        const classes = /className="([^"]*)"/.exec(m[2]!)?.[1]?.split(/\s+/) ?? [];
        if (classes.includes('ath-nav__title')) continue;
        if (!classes.includes(expected[m[1]!]!)) offenders.push(`${file.slice(root.length)} : <${m[1]}${m[2]}>`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('aucune date n’est affichée en ISO tronqué', () => {
    const raw = sources.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/\.slice\(0, ?1[06]\)|toLocaleString\(\)/g)].map(() => file.slice(root.length)));
    expect(raw).toEqual([]);
  });
});

describe('dates localisées', () => {
  afterEach(() => setLocale('fr'));

  it('suivent la langue de l’interface', () => {
    expect(formatDateTime('2026-11-07T09:30:00Z')).toBe('07/11/2026 09:30');
    expect(formatDate('2026-11-07T09:30:00Z')).toBe('07/11/2026');
    setLocale('en');
    expect(formatDateTime('2026-11-07T09:30:00Z')).toBe('07/11/2026, 09:30');
  });

  it('rendent une valeur vide ou illisible sans planter', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('pas une date')).toBe('pas une date');
  });
});
