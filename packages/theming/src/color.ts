import { ThemingError } from './tokens.js';

export interface Rgba { r: number; g: number; b: number; a: number }

/** Lit `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, `rgb(…)` et `rgba(…)`. */
export function parseColor(input: string): Rgba {
  const value = input.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (hex) {
    let h = hex[1]!;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value);
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return { r: +fn[1]!, g: +fn[2]!, b: +fn[3]!, a: alpha };
  }
  throw new ThemingError(`couleur illisible : ${input}`);
}

/** Pose une couleur translucide sur un fond opaque. */
export function composite(top: Rgba, under: Rgba): Rgba {
  const mix = (a: number, b: number) => a * top.a + b * (1 - top.a);
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 };
}

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = ({ r, g, b }: Rgba): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/**
 * Ratio de contraste WCAG 2.x, tronqué au centième (un 4,499 ne passe pas pour 4,5).
 * Le premier plan peut être translucide ; le fond doit être opaque.
 */
export function contrast(foreground: string, background: string): number {
  const bg = parseColor(background);
  if (bg.a < 1) throw new ThemingError(`le fond ${background} doit être opaque pour calculer un contraste`);
  const fg = composite(parseColor(foreground), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
