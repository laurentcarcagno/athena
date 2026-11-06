/** Niveau de protection de l'instance (ex. « Diffusion Restreinte »), lu dans la session : bandeau et exports côté navigateur. */
let level = '';
export const setProtectionLevel = (value: string | undefined): void => { level = (value ?? '').replace(/[\r\n]+/g, ' ').trim(); };
export const getProtectionLevel = (): string => level;

/** Reporte la mention en première et dernière lignes d'un CSV (BOM conservé en tête). Niveau vide : texte inchangé. */
export function markCsv(csv: string, mention = level): string {
  if (!mention) return csv;
  const bom = csv.startsWith('﻿') ? '﻿' : '';
  const cell = `"${mention.replace(/"/g, '""')}"`;
  return `${bom}${cell}\n${csv.slice(bom.length).replace(/\n+$/, '')}\n${cell}\n`;
}
