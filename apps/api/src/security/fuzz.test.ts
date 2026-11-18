import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { AtqlError, parse } from '../atql/parser';
import { compile } from '../atql/compile';
import { parseSdoc, sanitizeDocText } from '../docs/sdoc-parser';
import { MappingSchema, pointer, render, resolveValues } from '../inbound/mapper';

/**
 * Fuzzing des analyseurs d'entrées non fiables (plan § 13.2 : parseur ATQL, mappeurs de webhooks entrants, import YAML des tickets, import `.sdoc`).
 * Graine fixe : exécutions reproductibles. Propriété commune : une entrée arbitraire ne provoque jamais autre chose qu'un rejet net (erreur de domaine ou de syntaxe attendue),
 * ni blocage (durée bornée), ni écriture de propriété héritée.
 */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
const ALPHABET = ['"', "'", '\\', '(', ')', '[', ']', '{', '}', '$', '.', ',', ';', ':', '-', '#', '@', '<', '>', '=', '!', '~', ' ', '\n', '\0', '%', '*', '`', 'é', '‮', 'a', 'Z', '0', '9'];
function mutate(rand: () => number, seedText: string): string {
  let t = seedText;
  const n = 1 + Math.floor(rand() * 6);
  for (let i = 0; i < n; i++) {
    const pos = Math.floor(rand() * (t.length + 1));
    const kind = rand();
    if (kind < 0.4) t = t.slice(0, pos) + ALPHABET[Math.floor(rand() * ALPHABET.length)] + t.slice(pos);
    else if (kind < 0.7) t = t.slice(0, pos) + t.slice(pos + 1 + Math.floor(rand() * 3));
    else if (kind < 0.85) t = t.slice(0, pos) + t.slice(Math.floor(rand() * t.length));
    else t = t + t.slice(0, Math.floor(rand() * t.length));
  }
  return t.slice(0, 6000);
}
const ITERATIONS = 4000;

describe('fuzzing : parseur et compilateur ATQL', () => {
  const seeds = [
    'project = ARI AND tracker = Bug AND status in (Open, "In Progress") AND assignee = currentUser() ORDER BY priority DESC',
    'title ~ "crash" OR (due < "2026-12-01" AND NOT status = Done)', 'linkedTo(BUG-1, "blocks") AND changedBy("u-1")', 'tracker in (BUG, REQ) ORDER BY created ASC, key DESC',
  ];
  it('toute entrée est acceptée ou refusée par AtqlError ; jamais d’autre exception, jamais de SQL issu de l’entrée', () => {
    const rand = prng(20261118);
    let accepted = 0;
    const started = Date.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const input = mutate(rand, seeds[i % seeds.length]!);
      try {
        const query = parse(input);
        accepted += 1;
        const compiled = compile(query, { currentUser: 'u-1' });
        // le SQL ne contient que des paramètres et des noms de colonnes générés : aucune partie de l'entrée brute
        expect(compiled.where).not.toMatch(/DROP|--|;|\0/i);
      } catch (error) {
        expect(error, `entrée : ${JSON.stringify(input)}`).toBeInstanceOf(Error);
        const name = (error as Error).constructor.name;
        expect(['AtqlError', 'DomainError'], `exception inattendue ${name} pour ${JSON.stringify(input)} : ${(error as Error).message}`).toContain(name);
      }
    }
    expect(accepted).toBeGreaterThan(0); // le fuzzer atteint aussi le chemin nominal
    expect(Date.now() - started).toBeLessThan(20_000);
  });

  it('des entrées dégénérées (imbrication profonde, répétitions, très longues) sont refusées vite', () => {
    const started = Date.now();
    for (const input of ['('.repeat(5000), 'a'.repeat(100_000), 'x = 1 AND '.repeat(2000) + 'y = 2', 'NOT '.repeat(3000) + 'a = 1', '"' .repeat(7000), '\\'.repeat(7000)]) {
      expect(() => parse(input)).toThrow(AtqlError);
    }
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('fuzzing : mappeurs de webhooks entrants', () => {
  const payload = { a: { b: [1, { c: 'x' }] }, title: 'T', n: 3 };
  it('un chemin arbitraire ne lit jamais de propriété héritée et ne lève qu’une erreur nette', () => {
    const rand = prng(7);
    const seeds = ['$.a.b[1].c', '$.title', '$.a.b[0]', '$.__proto__.polluted', '$.constructor.prototype'];
    for (let i = 0; i < ITERATIONS; i++) {
      const path = mutate(rand, seeds[i % seeds.length]!);
      try {
        const value = pointer(payload, path);
        expect(typeof value === 'function').toBe(false);
      } catch (error) {
        expect((error as Error).message).toMatch(/chemin (invalide|trop profond)/);
      }
    }
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(pointer(payload, '$.__proto__')).toBeUndefined();
    expect(pointer(payload, '$.constructor')).toBeUndefined();
  });

  it('les gabarits et les valeurs ne lèvent que des erreurs nettes, la sortie est bornée', () => {
    const rand = prng(11);
    for (let i = 0; i < ITERATIONS; i++) {
      const template = mutate(rand, 'Alerte {{$.title}} : {{$.a.b[1].c}} ({{$.n}})');
      try {
        expect(render(template, payload).length).toBeLessThanOrEqual(5000);
        resolveValues({ f: { from: mutate(rand, '$.title') }, g: template }, payload);
      } catch (error) {
        expect((error as Error).message).toMatch(/chemin|profond/);
      }
    }
  });

  it('un schéma de mappage arbitraire est accepté ou refusé sans exception', () => {
    const rand = prng(13);
    const seed = JSON.stringify({ action: 'create', tracker: 'BUG', values: { title: { from: '$.title' } } });
    for (let i = 0; i < ITERATIONS; i++) {
      let candidate: unknown;
      try { candidate = JSON.parse(mutate(rand, seed)); } catch { continue; }
      expect(() => MappingSchema.safeParse(candidate)).not.toThrow();
    }
  });
});

describe('fuzzing : import YAML des tickets (synchronisation inverse et reconstruction)', () => {
  it('un YAML arbitraire est rejeté nettement ; la pollution de prototype et les alias récursifs ne passent pas', () => {
    const rand = prng(17);
    const seed = 'key: BUG-1\ntracker: BUG\nstatus: open\nvalues:\n  title: Crash\n  tags: [a, b]\nversion: 3\n';
    for (let i = 0; i < ITERATIONS; i++) {
      const text = mutate(rand, seed);
      try { parseYaml(text, { logLevel: 'error' }); } catch (error) { expect(error).toBeInstanceOf(Error); expect(['YAMLParseError', 'YAMLWarning', 'ReferenceError']).toContain((error as Error).name); } // l'analyseur signale un alias non résolu par ReferenceError : les appelants l'encadrent (synchronisation inverse : « YAML illisible » ; reconstruction : fichier nommé)
    }
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    const parsed = parseYaml('a: &x [1, 2]\nb: *x\n') as { a: number[]; b: number[] };
    expect(parsed.b).toEqual([1, 2]);
    // bombe d'alias : l'analyseur plafonne l'expansion (maxAliasCount par défaut)
    const bomb = ['a: &a [x, x, x, x, x, x, x, x, x]', ...Array.from({ length: 12 }, (_, i) => `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [${Array(9).fill(`*${String.fromCharCode(97 + i)}`).join(', ')}]`)].join('\n');
    const started = Date.now();
    expect(() => parseYaml(bomb)).toThrow();
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});

describe('fuzzing : lecteur .sdoc et assainissement documentaire', () => {
  const seed = '[DOCUMENT]\nTITLE: Spécification\n\n[REQUIREMENT]\nUID: REQ-001\nTITLE: Capteur\nSTATEMENT: >>>\nLe capteur <b>doit</b> mesurer.\n<<<\nATHENA_REFS: BUG-1, STORY-2\n';
  it('un document arbitraire est lu ou ignoré sans exception ; le texte renvoyé ne contient ni balise ni caractère de contrôle', () => {
    const rand = prng(19);
    const started = Date.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const text = mutate(rand, seed);
      const nodes = parseSdoc(text);
      for (const node of nodes) {
        const clean = sanitizeDocText(String(node.statement ?? '') + String(node.title ?? ''));
        expect(clean).not.toMatch(/<\s*\/?\s*(script|style|img|iframe)/i);
        expect(clean).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/);
      }
    }
    expect(Date.now() - started).toBeLessThan(20_000);
  });

  it('des entrées dégénérées sont traitées en temps borné', () => {
    const started = Date.now();
    for (const text of ['[REQUIREMENT]\n'.repeat(20_000), '>>>'.repeat(50_000), '<script>'.repeat(30_000) + 'x', 'UID: '.repeat(40_000)]) {
      parseSdoc(text); sanitizeDocText(text);
    }
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
