export type FieldConfig = Record<string, unknown>;

/** Un type de champ valide une valeur. Les plugins en enregistrent d'autres (plan § 6.1, `fieldType`). */
export interface FieldType {
  validate(value: unknown, config: FieldConfig): string | null;
}

const isString = (v: unknown): v is string => typeof v === 'string';

const text: FieldType = {
  validate: (v, c) => {
    const max = typeof c['maxLength'] === 'number' ? c['maxLength'] : 255;
    return isString(v) && v.length <= max ? null : `texte attendu (${max} caractères au plus)`;
  },
};

const richtext: FieldType = {
  validate: (v) => (isString(v) && v.length <= 100_000 ? null : 'texte riche attendu (100000 caractères au plus)'),
};

const number: FieldType = {
  validate: (v, c) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'nombre attendu';
    if (typeof c['min'] === 'number' && v < c['min']) return `valeur inférieure à ${c['min']}`;
    if (typeof c['max'] === 'number' && v > c['max']) return `valeur supérieure à ${c['max']}`;
    return null;
  },
};

const date: FieldType = {
  validate: (v) => {
    if (!isString(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date AAAA-MM-JJ attendue';
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? 'date inexistante' : null;
  },
};

const options = (c: FieldConfig): string[] =>
  Array.isArray(c['options']) ? (c['options'] as unknown[]).filter(isString) : [];

const select: FieldType = {
  validate: (v, c) => (isString(v) && options(c).includes(v) ? null : 'valeur hors liste'),
};

const multiselect: FieldType = {
  validate: (v, c) => {
    if (!Array.isArray(v) || !v.every(isString)) return 'liste de valeurs attendue';
    if (new Set(v).size !== v.length) return 'doublons interdits';
    return v.every((x) => options(c).includes(x)) ? null : 'valeur hors liste';
  },
};

const checkbox: FieldType = { validate: (v) => (typeof v === 'boolean' ? null : 'booléen attendu') };

const user: FieldType = {
  validate: (v) => (isString(v) && v.length > 0 && v.length <= 128 ? null : 'identifiant utilisateur attendu'),
};

export class FieldTypeRegistry {
  private readonly types = new Map<string, FieldType>(
    Object.entries({ text, richtext, number, date, select, multiselect, checkbox, user }),
  );

  register(name: string, type: FieldType): void {
    if (!/^[a-z][a-z0-9.-]{1,49}$/.test(name)) throw new Error(`Nom de type de champ invalide : ${name}`);
    if (this.types.has(name)) throw new Error(`Type de champ déjà enregistré : ${name}`);
    this.types.set(name, type);
  }

  has(name: string): boolean {
    return this.types.has(name);
  }

  names(): string[] {
    return [...this.types.keys()].sort();
  }

  validate(name: string, value: unknown, config: FieldConfig): string | null {
    const type = this.types.get(name);
    return type ? type.validate(value, config) : `type de champ inconnu : ${name}`;
  }
}
