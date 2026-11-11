import { describe, expect, it } from 'vitest';
import { dictionaryFor } from './i18n';

/**
 * T-0124 (ADR-0003 § 3) : glossaire. Les textes français affichés disent « ticket », « version » et « gabarit » ; « artefact »,
 * « release », « template » et « item » (lot 10) n'y figurent plus. Les identifiants techniques (clés, routes d'API, noms de composants) ne sont pas des textes.
 */
const FORBIDDEN = /\b(artefacts?|releases?|templates?|items?)\b/i;
const SAMPLES = ['X', 'Y', 'Z'];

function texts(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') out.push([path, value]);
  else if (typeof value === 'function') {
    try {
      const produced = (value as (...args: unknown[]) => unknown)(...SAMPLES, 2);
      if (typeof produced === 'string') out.push([`${path}()`, produced]);
    } catch { /* fonction à arguments structurés : ses textes sont couverts par les autres entrées */ }
  } else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) texts(item, `${path}.${key}`, out);
}

describe('vocabulaire (glossaire de l’ADR-0003)', () => {
  const fr: Array<[string, string]> = [];
  texts(dictionaryFor('fr'), 'fr', fr);

  it('parcourt le dictionnaire français en entier', () => {
    expect(fr.length).toBeGreaterThan(1000);
  });

  it('n’emploie ni « artefact », ni « release », ni « template », ni « item » dans les textes français', () => {
    expect(fr.filter(([, text]) => FORBIDDEN.test(text)).map(([path, text]) => `${path} : ${text}`)).toEqual([]);
  });

  it('aucun état ni étiquette en anglais dans les textes français (T-0152)', () => {
    const ENGLISH = /\b(planned|released|nothing here|mission console|query mode|filter mode)\b/i;
    expect(fr.filter(([, text]) => ENGLISH.test(text)).map(([path, text]) => `${path} : ${text}`)).toEqual([]);
  });

  it('emploie les termes du glossaire', () => {
    const all = fr.map(([, text]) => text).join('\n');
    for (const term of ['Ticket', 'Version', 'Gabarit', 'Backlog', 'Roadmap', 'Rapports', 'Paramètres', 'Administration', 'Membre']) expect(all).toContain(term);
  });
});
