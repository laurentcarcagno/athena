import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = __dirname;
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

describe('garde-fous de l’interface (constats d’audit F-01 et F-03)', () => {
  it('aucune confirmation native du navigateur (F-03)', () => {
    const offenders = sources(root).filter((f) => /\b(window\.)?confirm\(/.test(readFileSync(f, 'utf8').replace(/confirm\.ask\(/g, '')));
    expect(offenders.map((f) => f.slice(root.length + 1))).toEqual([]);
  });

  it('toute suppression irréversible passe par la boîte de confirmation (F-01) : un DELETE est précédé de confirm.ask ou annoté « sans confirmation : … »', () => {
    const offenders = sources(root).flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      return lines.flatMap((line, i) => {
        if (!/api\([^)]*'DELETE'/.test(line)) return [];
        const context = lines.slice(Math.max(0, i - 12), i + 1).join('\n');
        return /confirm\.ask\(/.test(context) || /sans confirmation :/.test(line) ? [] : [`${file.slice(root.length + 1)}:${i + 1}`];
      });
    });
    expect(offenders).toEqual([]);
  });
});
