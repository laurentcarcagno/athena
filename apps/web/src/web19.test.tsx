import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ProtectionBanner } from './components/ProtectionBanner';
import { matrixCsv } from './components/MatrixView';
import { markCsv, setProtectionLevel } from './lib/protection';

afterEach(() => { setProtectionLevel(''); vi.unstubAllGlobals(); });

describe('bandeau de niveau de protection', () => {
  it('niveau vide : aucun bandeau', () => {
    const { container } = render(<ProtectionBanner level="" />);
    expect(container).toBeEmptyDOMElement();
    expect(render(<ProtectionBanner level={undefined} />).container).toBeEmptyDOMElement();
  });

  it('niveau renseigné : bandeau annoncé aux lecteurs d’écran, sans violation axe', async () => {
    const { container } = render(<main><ProtectionBanner level="Diffusion Restreinte" /><h1>Page</h1></main>);
    const note = screen.getByRole('note', { name: 'Niveau de protection de l’instance' });
    expect(note).toHaveTextContent('Diffusion Restreinte');
    expect(note).toHaveClass('ath-protection');
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});

describe('bandeau dans l’application', () => {
  const stub = (session: unknown) => vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(/auth\/session/.test(url) ? session : []), { status: 200 })));

  it('apparaît en tête d’une page connectée, avant le contenu', async () => {
    stub({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-team-member'], groups: [] }, csrf: 'x', protectionLevel: 'Diffusion Restreinte' });
    const { container } = render(<App />);
    const note = await screen.findByRole('note', { name: 'Niveau de protection de l’instance' });
    expect(note).toHaveTextContent('Diffusion Restreinte');
    expect(container.querySelector('.ath-root')!.firstElementChild).toBe(note);
    expect(container.querySelector('.ath-root')).toHaveClass('ath-root--protected');
  });

  it('absent quand la session n’en porte pas', async () => {
    stub({ authenticated: true, user: { username: 'u', name: 'Ulysse', email: null, roles: ['athena-team-member'], groups: [] }, csrf: 'x' });
    render(<App />);
    await screen.findByRole('img', { name: 'Ulysse' });
    expect(screen.queryByRole('note', { name: 'Niveau de protection de l’instance' })).toBeNull();
  });
});

describe('exports côté navigateur', () => {
  const data = { rows: [{ key: 'A-1', title: 'a' }], cols: [{ key: 'B-1', title: 'b' }], links: [{ row: 'A-1', col: 'B-1', suspect: false }] } as never;
  it('le CSV de la matrice reprend la mention en en-tête et en pied quand le niveau est renseigné', () => {
    expect(matrixCsv(data)).toBe(',B-1\nA-1,1\n');
    setProtectionLevel('Diffusion Restreinte');
    const lines = matrixCsv(data).trimEnd().split('\n');
    expect(lines[0]).toBe('"Diffusion Restreinte"');
    expect(lines.at(-1)).toBe('"Diffusion Restreinte"');
    expect(lines.slice(1, -1)).toEqual([',B-1', 'A-1,1']);
  });
  it('markCsv conserve le BOM en tête', () => {
    expect(markCsv('﻿a\n1\n', 'DR')).toBe('﻿"DR"\na\n1\n"DR"\n');
    expect(markCsv('a\n', '')).toBe('a\n');
  });
});

describe('charte du bandeau', () => {
  it('n’utilise ni le rouge de cérémonie, ni ombre, ni dégradé, ni coin arrondi', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(process.cwd(), '../../packages/ui/src/styles/documents.css'), 'utf8'); // bandeau de protection (T-0131 : feuille découpée)
    const rule = css.split('\n').filter((l) => l.startsWith('.ath-protection') || l.startsWith('.ath-root--protected')).join('\n');
    expect(rule).toContain('.ath-protection {');
    expect(rule).not.toMatch(/tricolor-red|brand-accent|C80A26|gradient|shadow|radius/i);
    expect(rule).toMatch(/sticky/);
  });
});
