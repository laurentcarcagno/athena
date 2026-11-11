import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { logoUrl, markUrl, setBrandEntries, useFavicon } from './lib/brand';

/** T-0137 : icône de marque par thème ; l'organisation peut la remplacer ; la favicon suit le thème actif. */
afterEach(() => { setBrandEntries([]); document.querySelector('link[rel="icon"]')?.remove(); });
const entry = (theme: string, updatedAt = '2026-11-11T00:00:00.000Z') => ({ theme, kind: 'mark' as const, contentType: 'image/png', size: 10, updatedAt });

describe('icône de marque', () => {
  it('par défaut : l’icône du thème, embarquée (URI data: autorisée par la CSP)', () => {
    expect(markUrl('nord')).toMatch(/^data:image\/svg\+xml,/);
    expect(markUrl('hemeria')).not.toBe(markUrl('nord'));
    expect(decodeURIComponent(markUrl('nord')!)).not.toMatch(/<script|on\w+=/i);
  });

  it('l’icône du thème téléversée l’emporte sur celle de tous les thèmes, elle-même sur l’icône par défaut', () => {
    setBrandEntries([entry('*')]);
    expect(markUrl('nord')).toBe('/v1/brand/nord/mark?v=2026-11-11T00%3A00%3A00.000Z');
    setBrandEntries([entry('*'), entry('nord', '2026-11-12T00:00:00.000Z')]);
    expect(markUrl('nord')).toContain('v=2026-11-12');
    expect(markUrl('gruvbox')).toContain('/v1/brand/gruvbox/mark?v=2026-11-11');
  });

  it('logo horizontal : seulement s’il est téléversé, celui du thème avant celui de tous les thèmes', () => {
    expect(logoUrl('nord')).toBeNull();
    setBrandEntries([{ ...entry('*'), kind: 'logo' }]);
    expect(logoUrl('nord')).toContain('/v1/brand/nord/logo?v=');
    expect(markUrl('nord')).toMatch(/^data:/); // l'icône reste celle du thème
  });

  it('la favicon suit l’icône du thème actif', () => {
    function Probe({ theme }: { theme: string }) { useFavicon(theme); return null; }
    const { rerender } = render(<Probe theme="nord" />);
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!;
    expect(link.href).toContain('data:image/svg+xml');
    setBrandEntries([entry('gruvbox')]);
    rerender(<Probe theme="gruvbox" />);
    expect(link.getAttribute('href')).toContain('/v1/brand/gruvbox/mark');
  });
});
