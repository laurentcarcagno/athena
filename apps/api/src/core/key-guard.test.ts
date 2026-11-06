import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'migrations' ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });

/** Une requête qui compare la clé brute d'un artefact ignorerait les anciennes clés (alias) : ADR-0002 § 2. */
describe('résolution des clés d’item', () => {
  it('aucune requête ne compare a.key à un paramètre sans passer par resolve_artifact', () => {
    const offenders = sources(root).flatMap((file) =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, i) =>
        /\ba\.key\s*=\s*\$\d/.test(line) || /from artifact where (?:project_id = \$\d and )?key\s*=\s*\$\d/.test(line) ? [`${file.slice(root.length + 1)}:${i + 1}`] : []));
    expect(offenders).toEqual([]);
  });
});
