/**
 * Mention de protection de l'instance (ATHENA_PROTECTION_LEVEL, une instance = un niveau). Vide : aucune mention.
 * Renseignée, elle est reportée en en-tête et en pied de tout export : CSV, YAML, documents Markdown, charges JSON.
 */
export class ExportMarker {
  readonly level: string;
  constructor(level: string | undefined) {
    // une mention tient sur une ligne : sauts de ligne et guillemets neutralisés pour ne pas casser le format marqué
    this.level = (level ?? '').replace(/[\r\n]+/g, ' ').trim();
  }

  get active(): boolean { return this.level !== ''; }

  /** CSV : une ligne de mention avant l'en-tête et une après les données (le BOM reste en tête du fichier). */
  csv(text: string): string {
    if (!this.active) return text;
    const bom = text.startsWith('﻿') ? '﻿' : '';
    const body = text.slice(bom.length).replace(/\n+$/, '');
    const cell = `"${this.level.replace(/"/g, '""')}"`;
    return `${bom}${cell}\n${body}\n${cell}\n`;
  }

  /** YAML et textes à commentaires `#` : première et dernière lignes. */
  yaml(text: string): string {
    if (!this.active) return text;
    return `# ${this.level}\n${text.replace(/\n+$/, '')}\n# ${this.level}\n`;
  }

  /** Document Markdown (notes de version, rapports) : mention en gras en tête et en pied. */
  markdown(text: string): string {
    if (!this.active) return text;
    return `**${this.level}**\n\n${text.replace(/\n+$/, '')}\n\n**${this.level}**\n`;
  }

  /** Charge JSON d'export : le niveau accompagne les données. */
  json<T extends object>(payload: T): T & { protection?: string } {
    return this.active ? { ...payload, protection: this.level } : payload;
  }
}
