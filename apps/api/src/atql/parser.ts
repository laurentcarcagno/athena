/** ATQL : langage de requête d'Athena (plan § 8). Analyseur lexical et syntaxique. */

export class AtqlError extends Error {
  constructor(message: string, readonly position: number) {
    super(`${message} (position ${position})`);
  }
}

export type Value =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'word'; value: string }
  | { kind: 'func'; name: string; arg?: number };

export type Operator = '=' | '!=' | '~' | '<' | '>' | '<=' | '>=';

export type Expr =
  | { type: 'and' | 'or'; left: Expr; right: Expr }
  | { type: 'not'; operand: Expr }
  | { type: 'cmp'; field: string; op: Operator; value: Value }
  | { type: 'in'; field: string; values: Value[]; negated: boolean }
  | { type: 'empty'; field: string; negated: boolean }
  /** Traçabilité : items ayant un lien suspect, lié à un item donné (éventuellement par un type), ou sans lien (éventuellement d'un type). */
  | { type: 'suspect' }
  | { type: 'linkedTo'; target: string; link?: string }
  | { type: 'notLinked'; link?: string }
  | { type: 'linkCount'; link: string; min: number; direction: 'in' | 'out' | 'any' }
  /** Planning (ADR-0006) : `late()` = échéance dépassée et ticket non terminé ; `critical()` = sur le chemin critique de son projet. */
  | { type: 'late' }
  | { type: 'critical' }
  /** Bloquants (T-0174) : ticket non terminé qui est la cible d'un lien « blocks » dont la source n'est pas terminée. */
  | { type: 'blocked' };

export interface OrderBy {
  field: string;
  descending: boolean;
}

export interface Query {
  where: Expr | null;
  orderBy: OrderBy[];
}

const LINK_FUNCTIONS = new Set(['suspect', 'linkedto', 'notlinked', 'linkcount', 'late', 'critical', 'blocked']);
const LINK_TYPE = /^[a-z][a-z0-9_]{0,39}$/;
const ITEM_REF = /^[A-Za-z0-9_.-]{1,60}$/;
export const LIMITS = { maxLength: 2000, maxDepth: 12, maxConditions: 50, maxInValues: 100 };

type Token =
  | { t: 'str' | 'num' | 'word' | 'op' | 'punct'; v: string; pos: number }
  | { t: 'eof'; v: ''; pos: number };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      let out = '';
      while (j < input.length && input[j] !== '"') {
        if (input[j] === '\\' && j + 1 < input.length) { out += input[j + 1]; j += 2; } else { out += input[j]; j++; }
      }
      if (j >= input.length) throw new AtqlError('Chaîne non fermée', i);
      tokens.push({ t: 'str', v: out, pos: i });
      i = j + 1;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (['!=', '<=', '>='].includes(two)) { tokens.push({ t: 'op', v: two, pos: i }); i += 2; continue; }
    if (['=', '~', '<', '>'].includes(ch)) { tokens.push({ t: 'op', v: ch, pos: i }); i++; continue; }
    if (['(', ')', ','].includes(ch)) { tokens.push({ t: 'punct', v: ch, pos: i }); i++; continue; }
    const number = /^-?\d+(\.\d+)?/.exec(input.slice(i));
    if (number && !/[A-Za-z_]/.test(input[i + number[0].length] ?? '')) {
      tokens.push({ t: 'num', v: number[0], pos: i });
      i += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_.\-]*/.exec(input.slice(i));
    if (word) { tokens.push({ t: 'word', v: word[0], pos: i }); i += word[0].length; continue; }
    throw new AtqlError(`Caractère inattendu « ${ch} »`, i);
  }
  tokens.push({ t: 'eof', v: '', pos: input.length });
  return tokens;
}

const upper = (token: Token) => (token.t === 'word' ? token.v.toUpperCase() : '');

export function parse(input: string): Query {
  if (input.length > LIMITS.maxLength) throw new AtqlError(`Requête trop longue (${LIMITS.maxLength} caractères au plus)`, LIMITS.maxLength);
  const tokens = tokenize(input);
  let index = 0;
  let conditions = 0;
  const peek = () => tokens[index]!;
  const next = () => tokens[index++]!;
  const isKeyword = (word: string) => upper(peek()) === word;
  const expectPunct = (value: string) => {
    const token = next();
    if (token.t !== 'punct' || token.v !== value) throw new AtqlError(`« ${value} » attendu`, token.pos);
  };

  function value(): Value {
    const token = next();
    if (token.t === 'str') return { kind: 'string', value: token.v };
    if (token.t === 'num') return { kind: 'number', value: Number(token.v) };
    if (token.t === 'word') {
      if (peek().t === 'punct' && peek().v === '(') {
        next();
        if (peek().t === 'num') {
          const arg = Number(next().v);
          expectPunct(')');
          return { kind: 'func', name: token.v, arg };
        }
        expectPunct(')');
        return { kind: 'func', name: token.v };
      }
      return { kind: 'word', value: token.v };
    }
    throw new AtqlError('Valeur attendue', token.pos);
  }

  /** `suspect()`, `linkedTo(CLÉ[, "type"])`, `notLinked(["type"])`, `linkCount("type", n[, "in"|"out"])` : prédicats de traçabilité sans opérateur. */
  function linkFunction(): Expr {
    const name = next();
    expectPunct('(');
    const args: Array<{ value: string; pos: number }> = [];
    while (!(peek().t === 'punct' && peek().v === ')')) {
      const token = next();
      if (token.t !== 'str' && token.t !== 'word' && !(token.t === 'num' && name.v.toLowerCase() === 'linkcount')) throw new AtqlError('Clé ou type de lien attendu', token.pos);
      args.push({ value: token.v, pos: token.pos });
      if (peek().t === 'punct' && peek().v === ',') next();
      else if (!(peek().t === 'punct' && peek().v === ')')) throw new AtqlError('« , » ou « ) » attendu', peek().pos);
    }
    expectPunct(')');
    const kind = name.v.toLowerCase();
    const linkType = (arg?: { value: string; pos: number }): string | undefined => {
      if (!arg) return undefined;
      if (!LINK_TYPE.test(arg.value)) throw new AtqlError(`Type de lien invalide : ${arg.value}`, arg.pos);
      return arg.value;
    };
    if (kind === 'late' || kind === 'critical' || kind === 'blocked') {
      if (args.length > 0) throw new AtqlError(`${kind}() ne prend pas d’argument`, name.pos);
      return { type: kind };
    }
    if (kind === 'suspect') {
      if (args.length > 0) throw new AtqlError('suspect() ne prend pas d’argument', name.pos);
      return { type: 'suspect' };
    }
    if (kind === 'linkedto') {
      if (args.length < 1 || args.length > 2) throw new AtqlError('linkedTo() attend une clé de ticket et, facultatif, un type de lien', name.pos);
      if (!ITEM_REF.test(args[0]!.value)) throw new AtqlError(`Clé de ticket invalide : ${args[0]!.value}`, args[0]!.pos);
      const link = linkType(args[1]);
      return link === undefined ? { type: 'linkedTo', target: args[0]!.value } : { type: 'linkedTo', target: args[0]!.value, link };
    }
    if (kind === 'linkcount') {
      if (args.length < 2 || args.length > 3) throw new AtqlError('linkCount() attend un type de lien, un nombre minimal de liens et, facultatif, « in » ou « out »', name.pos);
      const link = linkType(args[0])!;
      const min = Number(args[1]!.value);
      if (!/^\d+$/.test(args[1]!.value) || min < 1 || min > 100) throw new AtqlError('Nombre minimal de liens invalide (1 à 100)', args[1]!.pos);
      const direction = args[2]?.value ?? 'any';
      if (direction !== 'in' && direction !== 'out') {
        if (args[2]) throw new AtqlError('Sens attendu : « in » ou « out »', args[2].pos);
      }
      return { type: 'linkCount', link, min, direction: direction as 'in' | 'out' | 'any' };
    }
    if (args.length > 1) throw new AtqlError('notLinked() attend au plus un type de lien', name.pos);
    const link = linkType(args[0]);
    return link === undefined ? { type: 'notLinked' } : { type: 'notLinked', link };
  }

  function condition(): Expr {
    if (++conditions > LIMITS.maxConditions) throw new AtqlError(`Trop de conditions (${LIMITS.maxConditions} au plus)`, peek().pos);
    const first = peek();
    const after = tokens[index + 1];
    if (first.t === 'word' && after?.t === 'punct' && after.v === '(' && LINK_FUNCTIONS.has(first.v.toLowerCase())) return linkFunction();
    const fieldToken = next();
    if (fieldToken.t !== 'word') throw new AtqlError('Nom de champ attendu', fieldToken.pos);
    const field = fieldToken.v;
    if (isKeyword('IS')) {
      next();
      let negated = false;
      if (isKeyword('NOT')) { next(); negated = true; }
      if (!isKeyword('EMPTY')) throw new AtqlError('« EMPTY » attendu', peek().pos);
      next();
      return { type: 'empty', field, negated };
    }
    let negated = false;
    if (isKeyword('NOT') && upper(tokens[index + 1]!) === 'IN') { next(); negated = true; }
    if (isKeyword('IN')) {
      next();
      expectPunct('(');
      const values: Value[] = [value()];
      while (peek().t === 'punct' && peek().v === ',') {
        next();
        values.push(value());
        if (values.length > LIMITS.maxInValues) throw new AtqlError(`Liste trop longue (${LIMITS.maxInValues} valeurs au plus)`, peek().pos);
      }
      expectPunct(')');
      return { type: 'in', field, values, negated };
    }
    const op = next();
    if (op.t !== 'op') throw new AtqlError('Opérateur attendu', op.pos);
    return { type: 'cmp', field, op: op.v as Operator, value: value() };
  }

  function primary(depth: number): Expr {
    if (depth > LIMITS.maxDepth) throw new AtqlError(`Imbrication trop profonde (${LIMITS.maxDepth} niveaux au plus)`, peek().pos);
    if (peek().t === 'punct' && peek().v === '(') {
      next();
      const inner = or(depth + 1);
      expectPunct(')');
      return inner;
    }
    return condition();
  }
  function not(depth: number): Expr {
    if (isKeyword('NOT')) {
      next();
      if (depth + 1 > LIMITS.maxDepth) throw new AtqlError('Imbrication trop profonde', peek().pos);
      return { type: 'not', operand: not(depth + 1) };
    }
    return primary(depth);
  }
  function and(depth: number): Expr {
    let left = not(depth);
    while (isKeyword('AND')) { next(); left = { type: 'and', left, right: not(depth) }; }
    return left;
  }
  function or(depth: number): Expr {
    let left = and(depth);
    while (isKeyword('OR')) { next(); left = { type: 'or', left, right: and(depth) }; }
    return left;
  }

  let where: Expr | null = null;
  if (peek().t !== 'eof' && !isKeyword('ORDER')) where = or(0);
  const orderBy: OrderBy[] = [];
  if (isKeyword('ORDER')) {
    next();
    if (!isKeyword('BY')) throw new AtqlError('« BY » attendu', peek().pos);
    next();
    for (;;) {
      const field = next();
      if (field.t !== 'word') throw new AtqlError('Nom de champ attendu', field.pos);
      let descending = false;
      if (isKeyword('ASC')) next();
      else if (isKeyword('DESC')) { next(); descending = true; }
      orderBy.push({ field: field.v, descending });
      if (orderBy.length > 5) throw new AtqlError('5 critères de tri au plus', peek().pos);
      if (peek().t === 'punct' && peek().v === ',') { next(); continue; }
      break;
    }
  }
  if (peek().t !== 'eof') throw new AtqlError(`Élément inattendu « ${peek().v} »`, peek().pos);
  return { where, orderBy };
}
