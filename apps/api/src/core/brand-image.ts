import { validation } from './errors';

/**
 * Images de marque téléversées par l'organisation (ADR-0004, T-0137). Un SVG peut porter du script : on n'accepte que PNG,
 * WebP, ou un SVG reconstruit à partir d'une liste blanche d'éléments et d'attributs (aucun script, aucun style, aucun lien
 * hors du document). L'image est ensuite servie avec un type strict et `Content-Security-Policy: sandbox`, et affichée par
 * `<img>`, jamais intégrée dans le DOM.
 */
export const MAX_BRAND_BYTES = 64 * 1024;
export type BrandContentType = 'image/png' | 'image/webp' | 'image/svg+xml';

const ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'title', 'desc', 'defs', 'use', 'symbol', 'clippath', 'mask']);
const ATTRIBUTES = new Set([
  'xmlns', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity',
  'stroke-miterlimit', 'opacity', 'transform', 'clip-rule', 'clip-path', 'mask', 'id', 'href', 'xlink:href', 'xmlns:xlink',
  'preserveaspectratio', 'version',
]);
/** Valeur sûre : pas de schéma (javascript:, data:, http:…), pas d'url() hors référence interne (#id). */
const safeValue = (name: string, value: string): boolean => {
  if (/[<>]/.test(value)) return false;
  if (name === 'href' || name === 'xlink:href') return /^#[\w-]+$/.test(value);
  if (/url\s*\(/i.test(value)) return /^url\(\s*#[\w-]+\s*\)$/i.test(value.trim());
  return !/(javascript|data|vbscript)\s*:/i.test(value);
};

/** Reconstruit un SVG sûr ; refuse ce qui ne relève pas de la liste blanche d'éléments. */
export function sanitizeSvg(input: string): string {
  const text = input.replace(/^﻿/, '').replace(/<\?xml[^>]*\?>/i, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?/i.test(text)) throw validation(['SVG refusé : déclarations XML (DOCTYPE, entités, instructions) interdites.']);
  const out: string[] = [];
  const open: string[] = [];
  let rest = text;
  while (rest.length) {
    const tag = /^<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(rest);
    if (tag) {
      const [whole, closing, rawName, attrs, selfClosing] = tag;
      const name = rawName!.toLowerCase();
      if (!ELEMENTS.has(name)) throw validation([`SVG refusé : élément <${rawName}> interdit.`]);
      if (closing) {
        if (open.pop() !== name) throw validation(['SVG refusé : balises mal imbriquées.']);
        out.push(`</${name}>`);
      } else {
        const kept = [...attrs!.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
          .map((m) => [m[1]!, m[2] ?? m[3] ?? ''] as const)
          .filter(([attr, value]) => ATTRIBUTES.has(attr.toLowerCase()) && safeValue(attr.toLowerCase(), value))
          .map(([attr, value]) => ` ${attr}="${value.replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;')}"`);
        out.push(`<${name}${kept.join('')}${selfClosing ? '/' : ''}>`);
        if (!selfClosing) open.push(name);
      }
      rest = rest.slice(whole.length);
      continue;
    }
    const textNode = /^[^<]+/.exec(rest);
    if (!textNode) throw validation(['SVG refusé : balise illisible.']);
    out.push(textNode[0].replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;'));
    rest = rest.slice(textNode[0].length);
  }
  if (open.length || !out[0]?.startsWith('<svg')) throw validation(['SVG refusé : document incomplet ou racine absente.']);
  return out.join('');
}

/** Vérifie et normalise une image de marque : type par les octets (pas par le nom ni l'en-tête), taille, SVG nettoyé. */
export function checkBrandImage(data: Buffer): { contentType: BrandContentType; data: Buffer } {
  if (data.length === 0) throw validation(['Image vide.']);
  if (data.length > MAX_BRAND_BYTES) throw validation([`Image trop volumineuse (maximum ${MAX_BRAND_BYTES / 1024} Ko).`]);
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { contentType: 'image/png', data };
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return { contentType: 'image/webp', data };
  const text = data.toString('utf8');
  if (/<svg[\s>]/i.test(text)) return { contentType: 'image/svg+xml', data: Buffer.from(sanitizeSvg(text), 'utf8') };
  throw validation(['Format refusé : PNG, WebP ou SVG seulement.']);
}
