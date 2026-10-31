import { AtqlError, parse, type Expr, type Operator, type Query, type Value } from './parser';

export interface CompileContext {
  currentUser: string;
}

export interface Compiled {
  /** Clause WHERE (sans le mot-clé) ; `true` si la requête est vide. */
  where: string;
  orderBy: string;
  /** Tous les paramètres : ceux de tête, ceux du WHERE, puis ceux du tri. */
  params: unknown[];
  /** Nombre de paramètres utilisés par le WHERE (têtes comprises) ; le reste appartient au tri. */
  whereParamCount: number;
}

/** Champs natifs : colonne SQL et type. Tout autre champ est un champ de tracker (JSONB). */
const BUILTIN: Record<string, { column: string; type: 'text' | 'time' }> = {
  key: { column: 'a.key', type: 'text' },
  tracker: { column: 't.key', type: 'text' },
  status: { column: 's.key', type: 'text' },
  project: { column: 'p.key', type: 'text' },
  created_by: { column: 'a.created_by', type: 'text' },
  created: { column: 'a.created_at', type: 'time' },
  updated: { column: 'a.updated_at', type: 'time' },
};
const CUSTOM_FIELD = /^[a-z][a-z0-9_]{0,39}$/;
const SQL_OP: Record<Operator, string> = { '=': '=', '!=': '<>', '~': 'ILIKE', '<': '<', '>': '>', '<=': '<=', '>=': '>=' };

/**
 * Compile une requête ATQL en SQL paramétré. Aucune donnée utilisateur n'est concaténée :
 * valeurs et noms de champs personnalisés passent par des paramètres liés.
 */
export function compile(input: string | Query, context: CompileContext, leading: unknown[] = []): Compiled {
  const query = typeof input === 'string' ? parse(input) : input;
  const params: unknown[] = [...leading];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const bindText = (value: string): string => `${bind(value)}::text`;

  const scalar = (value: Value, position = 0): string | number => {
    if (value.kind === 'string' || value.kind === 'word') return value.value;
    if (value.kind === 'number') return value.value;
    if (value.name.toLowerCase() === 'currentuser') return context.currentUser;
    throw new AtqlError(`Fonction inconnue : ${value.name}()`, position);
  };

  const fieldRef = (field: string): { builtin?: (typeof BUILTIN)[string]; name: string } => {
    const lower = field.toLowerCase();
    const builtin = BUILTIN[lower];
    if (builtin) return { builtin, name: lower };
    if (!CUSTOM_FIELD.test(field)) throw new AtqlError(`Champ inconnu ou invalide : ${field}`, 0);
    return { name: field };
  };

  function cmp(field: string, op: Operator, value: Value): string {
    const { builtin, name } = fieldRef(field);
    const v = scalar(value);
    if (builtin) {
      if (builtin.type === 'time') {
        if (op === '~') throw new AtqlError(`L'opérateur ~ ne s'applique pas à ${name}`, 0);
        return `${builtin.column} ${SQL_OP[op]} ${bind(String(v))}::timestamptz`;
      }
      return op === '~' ? `${builtin.column} ILIKE ${bind(`%${escapeLike(String(v))}%`)}` : `${builtin.column} ${SQL_OP[op]} ${bind(String(v))}`;
    }
    const key = bindText(name);
    const text = `(a."values" ->> ${key})`;
    if (op === '~') return `${text} ILIKE ${bind(`%${escapeLike(String(v))}%`)}`;
    if (typeof v === 'number') {
      const num = `(case when jsonb_typeof(a."values" -> ${key}) = 'number' then ${text}::numeric end)`;
      return `${num} ${SQL_OP[op]} ${bind(v)}::numeric`;
    }
    const param = bind(v);
    if (op === '=') return `(${text} = ${param} or (jsonb_typeof(a."values" -> ${key}) = 'array' and a."values" -> ${key} @> to_jsonb(${param}::text)))`;
    if (op === '!=') return `not (${text} = ${param} or (jsonb_typeof(a."values" -> ${key}) = 'array' and a."values" -> ${key} @> to_jsonb(${param}::text)))`;
    return `${text} ${SQL_OP[op]} ${param}`;
  }

  function expr(e: Expr): string {
    switch (e.type) {
      case 'and': return `(${expr(e.left)} and ${expr(e.right)})`;
      case 'or': return `(${expr(e.left)} or ${expr(e.right)})`;
      case 'not': return `(not ${expr(e.operand)})`;
      case 'cmp': return cmp(e.field, e.op, e.value);
      case 'in': {
        const inner = `(${e.values.map((v) => cmp(e.field, '=', v)).join(' or ')})`;
        return e.negated ? `(not ${inner})` : inner;
      }
      case 'empty': {
        const { builtin, name } = fieldRef(e.field);
        const sql = builtin
          ? `(${builtin.column} is null)`
          : `(a."values" -> ${bindText(name)} is null or a."values" ->> ${bindText(name)} = '' or a."values" -> ${bindText(name)} = '[]'::jsonb)`;
        return e.negated ? `(not ${sql})` : sql;
      }
    }
  }

  const where = query.where ? expr(query.where) : 'true';
  const whereParamCount = params.length;
  const order: string[] = [];
  for (const o of query.orderBy) {
    const { builtin, name } = fieldRef(o.field);
    const direction = o.descending ? 'desc' : 'asc';
    if (builtin) {
      order.push(`${builtin.column} ${direction} nulls last`);
    } else {
      // Les nombres se trient numériquement, le reste comme du texte (sinon « 10 » précéderait « 8 »).
      const key = bindText(name);
      order.push(
        `(case when jsonb_typeof(a."values" -> ${key}) = 'number' then (a."values" ->> ${key})::numeric end) ${direction} nulls last`,
        `a."values" ->> ${key} ${direction} nulls last`,
      );
    }
  }
  order.push('a.created_at asc', 'a.id asc');
  return { where, orderBy: order.join(', '), params, whereParamCount };
}

const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);
