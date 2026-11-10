import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { check, contrast, emitCss, registryOf, resolveTheme, runCli, ThemingError, type Contract, type Theme } from './index.js';

const base: Theme = {
  name: 'base',
  meta: { abstract: true },
  tokens: { palette: { ink: { $value: '#001423' }, paper: { $value: '#FCFDFE' }, night: { $value: '#0E2230' }, mist: { $value: '#F0F7FC' } }, space: { md: { $value: '12px' } } },
  modes: {
    light: { surface: { default: { $value: '{palette.paper}' } }, text: { default: { $value: '{palette.ink}' } } },
    dark: { surface: { default: { $value: '{palette.night}' } }, text: { default: { $value: '{palette.mist}' } } },
  },
};
const child: Theme = { name: 'child', extends: 'base', tokens: { border: { default: { $value: '1px solid {text.default}' } } } };
const contract: Contract = {
  modes: ['light', 'dark'],
  defaultMode: 'light',
  required: ['surface.default', 'text.default'],
  contrast: [{ fg: 'text.default', bg: 'surface.default', min: 4.5, label: 'texte sur surface' }],
};

describe('résolution', () => {
  it('hérite du parent, applique le mode et résout les alias complets et inclus', () => {
    const registry = registryOf([base, child]);
    const light = resolveTheme(child, 'light', registry);
    const dark = resolveTheme(child, 'dark', registry);
    expect(light.get('surface.default')).toBe('#FCFDFE');
    expect(dark.get('surface.default')).toBe('#0E2230');
    expect(light.get('border.default')).toBe('1px solid #001423');
    expect(dark.get('border.default')).toBe('1px solid #F0F7FC');
    expect(light.get('space.md')).toBe('12px');
  });

  it('refuse un alias circulaire en nommant la boucle', () => {
    const loop: Theme = { name: 'loop', tokens: { a: { $value: '{b}' }, b: { $value: '{c}' }, c: { $value: '{a}' } } };
    expect(() => resolveTheme(loop, 'light', registryOf([loop]))).toThrow(new ThemingError('alias circulaire : a → b → c → a'));
  });

  it('refuse un alias inconnu, un parent inconnu et un héritage circulaire', () => {
    const unknown: Theme = { name: 'u', tokens: { a: { $value: '{nope}' } } };
    expect(() => resolveTheme(unknown, 'light', registryOf([unknown]))).toThrow(/alias inconnu : \{nope\}/);
    const orphan: Theme = { name: 'o', extends: 'absent' };
    expect(() => resolveTheme(orphan, 'light', registryOf([orphan]))).toThrow(/thème inconnu/);
    const a: Theme = { name: 'a', extends: 'b' };
    const b: Theme = { name: 'b', extends: 'a' };
    expect(() => resolveTheme(a, 'light', registryOf([a, b]))).toThrow(/héritage circulaire/);
  });
});

describe('contrastes', () => {
  it('calcule le ratio WCAG, tronqué au centième, premier plan translucide compris', () => {
    expect(contrast('#000000', '#FFFFFF')).toBe(21);
    expect(contrast('#006EB1', '#FCFDFE')).toBe(5.33);
    expect(contrast('rgba(0, 0, 0, 0.5)', '#FFFFFF')).toBeCloseTo(3.95, 1);
    expect(() => contrast('#000', 'rgba(0,0,0,0.5)')).toThrow(/opaque/);
  });

  it('un thème conforme ne donne aucun constat ; une paire sous le seuil en donne un, par mode', () => {
    expect(check([base, child], contract)).toEqual([]);
    const pale: Theme = { name: 'pale', extends: 'base', modes: { dark: { text: { default: { $value: '#264E6E' } } } } };
    const issues = check([base, pale], contract, ['pale']);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ theme: 'pale', mode: 'dark', kind: 'contrast' });
    expect(issues[0]!.message).toContain('texte sur surface');
  });

  it('signale un jeton obligatoire absent', () => {
    const bare: Theme = { name: 'bare', tokens: { surface: { default: { $value: '#FFFFFF' } } } };
    expect(check([bare], contract).map((i) => i.message)).toEqual(['jeton obligatoire absent : text.default', 'jeton obligatoire absent : text.default']);
  });
});

describe('CSS', () => {
  it('émet un bloc par thème non abstrait, le mode sombre en différence, et une sortie déterministe', () => {
    const css = emitCss([base, child], contract, { prefix: 'ath-', defaultTheme: 'child' });
    expect(css).toBe(emitCss([base, child], contract, { prefix: 'ath-', defaultTheme: 'child' }));
    expect(css).not.toContain('[data-theme="base"]');
    expect(css).toContain(':root[data-theme="child"],\n:root:not([data-theme]) {\n  color-scheme: light;');
    expect(css).toContain('  --ath-surface-default: #FCFDFE;');
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  :root[data-theme="child"]:not([data-mode]),');
    expect(css).toContain(':root[data-theme="child"][data-mode="dark"],\n:root:not([data-theme])[data-mode="dark"] {\n  color-scheme: dark;');
    const dark = css.slice(css.indexOf('[data-mode="dark"] {'));
    expect(dark).toContain('--ath-text-default: #F0F7FC;');
    expect(dark).not.toContain('--ath-space-md'); // inchangé entre les modes
  });
});

describe('ligne de commande', () => {
  const files: Record<string, string> = {
    'c.json': JSON.stringify(contract),
    'base.json': JSON.stringify(base),
    'child.json': JSON.stringify(child),
    'bad.json': JSON.stringify({ name: 'bad', extends: 'base', modes: { light: { text: { default: { $value: '#EEEEEE' } } } } }),
  };
  const io = () => {
    const written: Record<string, string> = {};
    const logs: string[] = [];
    return { written, logs, readFile: (p: string) => files[p]!, writeFile: (p: string, c: string) => { written[p] = c; }, log: (m: string) => logs.push(m), error: (m: string) => logs.push(m) };
  };

  it('check rend 0 si conforme, 1 sinon ; build n’écrit rien pour un thème non conforme', () => {
    expect(runCli(['check', '--contract', 'c.json', 'base.json', 'child.json'], io())).toBe(0);
    const failing = io();
    expect(runCli(['build', '--contract', 'c.json', '--out', 'x.css', 'base.json', 'bad.json'], failing)).toBe(1);
    expect(failing.written).toEqual({});
    expect(failing.logs.join('\n')).toContain('bad (light) : texte sur surface');
    const ok = io();
    expect(runCli(['build', '--contract', 'c.json', '--out', 'x.css', '--prefix', 'ath-', 'base.json', 'child.json'], ok)).toBe(0);
    expect(ok.written['x.css']).toContain('--ath-text-default');
    expect(runCli(['inconnu'], io())).toBe(2);
  });
});

describe('découplage', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  it('aucun fichier source n’importe un paquet du produit (@athena/*)', () => {
    expect(sources.filter((f) => /from ['"]@athena\//.test(readFileSync(join(dir, f), 'utf8')))).toEqual([]);
  });

  it('React n’est importé que par react.ts, que l’entrée principale n’exporte pas', () => {
    expect(sources.filter((f) => /from ['"]react/.test(readFileSync(join(dir, f), 'utf8')))).toEqual(['react.ts']);
    expect(readFileSync(join(dir, 'index.ts'), 'utf8')).not.toContain('./react');
  });
});
