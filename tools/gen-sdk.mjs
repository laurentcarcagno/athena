// Générateur des SDK (plan § 7.3) : clients TypeScript et Python produits depuis le contrat OpenAPI de l'API.
//   node tools/gen-sdk.mjs --spec docs/api/openapi.json          (fichier produit par tools/dump-openapi.mjs)
//   node tools/gen-sdk.mjs --url https://athena.exemple.lan --token athp_...   (contrat d'une instance en marche)
// Sorties : packages/sdk-ts/src/client.ts et packages/sdk-python/athena_sdk/client.py (générés : ne pas modifier à la main).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

export const camel = (s) => s.replace(/_([a-z0-9])/gi, (_m, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
export const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
const PY_KEYWORDS = new Set(['import', 'from', 'class', 'def', 'return', 'pass', 'global', 'lambda', 'in', 'is', 'not', 'or', 'and', 'if', 'else', 'for', 'while', 'with', 'try', 'except', 'raise', 'yield', 'del', 'as', 'assert', 'break', 'continue', 'finally', 'nonlocal', 'None', 'True', 'False']);
const pyName = (s) => (PY_KEYWORDS.has(snake(s)) ? `${snake(s)}_` : snake(s));

/** Opérations du contrat : { tag, name, verb, path, pathParams, body, roles, doc }. Les noms viennent de l'identifiant d'opération `Groupe_méthode`. */
export function operations(spec) {
  const out = [];
  for (const [path, verbs] of Object.entries(spec.paths)) {
    for (const [verb, op] of Object.entries(verbs)) {
      const [group, ...rest] = String(op.operationId).split('_');
      out.push({
        group, name: rest.join('_') || 'call', verb: verb.toUpperCase(), path,
        pathParams: (op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name),
        hasBody: Boolean(op.requestBody), schema: op.requestBody?.content?.['application/json']?.schema ?? null,
        roles: op['x-athena-roles'] ?? [], isPublic: Array.isArray(op.security) && op.security.length === 0,
      });
    }
  }
  // un nom de méthode unique par groupe (deux routes d'un même gestionnaire reçoivent un suffixe)
  const seen = new Map();
  for (const o of out) { const k = `${o.group}.${o.name}`; const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); if (n > 1) o.name = `${o.name}${n}`; }
  return out.sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name));
}

/** Type TypeScript d'un schéma JSON simple (objets, tableaux, scalaires, énumérations) ; `unknown` au-delà. */
export function tsType(schema, depth = 0) {
  if (!schema || depth > 4) return 'unknown';
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (Array.isArray(schema.type)) return schema.type.map((t) => tsType({ ...schema, type: t }, depth)).join(' | ');
  switch (schema.type) {
    case 'string': return 'string';
    case 'integer': case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'null': return 'null';
    case 'array': return `Array<${tsType(schema.items, depth + 1)}>`;
    case 'object': {
      const props = Object.entries(schema.properties ?? {});
      if (props.length === 0) return 'Record<string, unknown>';
      const req = new Set(schema.required ?? []);
      return `{ ${props.map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}${req.has(k) ? '' : '?'}: ${tsType(v, depth + 1)}`).join('; ')} }`;
    }
    default: return 'unknown';
  }
}

export function generateTs(spec) {
  const ops = operations(spec);
  const groups = new Map();
  for (const o of ops) (groups.get(o.group) ?? groups.set(o.group, []).get(o.group)).push(o);
  const lines = [
    '// Code généré par tools/gen-sdk.mjs depuis le contrat OpenAPI : ne pas modifier à la main.',
    `// Contrat : ${spec.info?.title ?? 'Athena API'} ${spec.info?.version ?? ''}`,
    '',
    'export interface AthenaClientOptions { baseUrl: string; token: string; fetch?: typeof fetch }',
    'export class AthenaError extends Error { constructor(readonly status: number, readonly body: unknown) { super(`HTTP ${status}`); } }',
    '',
    'export class AthenaClient {',
    '  constructor(private readonly options: AthenaClientOptions) {}',
    '',
    '  /** Appel brut : chemin avec paramètres déjà remplacés. Lève AthenaError si le statut n’est pas 2xx. */',
    '  async request<T = unknown>(method: string, path: string, init: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {}): Promise<T> {',
    '    const url = new URL(path, this.options.baseUrl);',
    '    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));',
    '    const response = await (this.options.fetch ?? fetch)(url, {',
    "      method, headers: { Authorization: `Bearer ${this.options.token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },",
    '      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),',
    '    });',
    '    const text = await response.text();',
    '    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined;',
    '    if (!response.ok) throw new AthenaError(response.status, data);',
    '    return data as T;',
    '  }',
    '',
    "  private path(template: string, params: Record<string, string>): string { return template.replace(/\\{(\\w+)\\}/g, (_m, k: string) => encodeURIComponent(params[k] ?? '')); }",
    '',
  ];
  for (const [group, list] of groups) {
    lines.push(`  readonly ${camel(group)} = {`);
    for (const o of list) {
      const params = o.pathParams.length ? `path: { ${o.pathParams.map((p) => `${p}: string`).join('; ')} }` : '';
      const body = o.hasBody ? `body${o.schema ? '' : '?'}: ${o.schema ? tsType(o.schema) : 'unknown'}` : '';
      const args = [params, 'query?: Record<string, string | number | boolean | undefined>', body].filter(Boolean);
      const sig = [params, body, 'query?: Record<string, string | number | boolean | undefined>'].filter(Boolean).join(', ');
      void args;
      lines.push(`    /** ${o.verb} ${o.path}${o.roles.length ? ` · rôles : ${o.roles.join(', ')}` : ''}${o.isPublic ? ' · public' : ''} */`);
      lines.push(`    ${camel(o.name)}: (${sig}): Promise<unknown> => this.request('${o.verb}', this.path('${o.path}', ${o.pathParams.length ? 'path' : '{}'}), { ${o.hasBody ? 'body, ' : ''}query }),`);
    }
    lines.push('  };', '');
  }
  lines.push('}', '');
  return lines.join('\n');
}

export function generatePython(spec) {
  const ops = operations(spec);
  const groups = new Map();
  for (const o of ops) (groups.get(o.group) ?? groups.set(o.group, []).get(o.group)).push(o);
  const out = [
    '"""Client Python de l\'API Athena. Code généré par tools/gen-sdk.mjs depuis le contrat OpenAPI : ne pas modifier à la main."""',
    'import json',
    'import urllib.error',
    'import urllib.parse',
    'import urllib.request',
    'from typing import Any, Dict, Optional',
    '',
    '',
    'class AthenaError(Exception):',
    '    """Réponse HTTP non 2xx."""',
    '',
    '    def __init__(self, status: int, body: Any):',
    '        super().__init__(f"HTTP {status}")',
    '        self.status = status',
    '        self.body = body',
    '',
    '',
    'class _Group:',
    '    def __init__(self, client: "AthenaClient"):',
    '        self._client = client',
    '',
  ];
  const classes = [];
  for (const [group, list] of groups) {
    const cls = `_${group.replace(/[^A-Za-z0-9]/g, '')}`;
    classes.push([group, cls]);
    out.push(`class ${cls}(_Group):`);
    for (const o of list) {
      const args = ['self', ...o.pathParams.map((p) => pyName(p)), ...(o.hasBody ? ['body: Any = None'] : []), 'query: Optional[Dict[str, Any]] = None'];
      out.push(`    def ${pyName(o.name)}(${args.join(', ')}) -> Any:`);
      out.push(`        """${o.verb} ${o.path}${o.roles.length ? ` (rôles : ${o.roles.join(', ')})` : ''}${o.isPublic ? ' (public)' : ''}"""`);
      out.push(`        path = "${o.path}"${o.pathParams.map((p) => `.replace("{${p}}", urllib.parse.quote(str(${pyName(p)}), safe=""))`).join('')}`);
      out.push(`        return self._client.request("${o.verb}", path, query=query${o.hasBody ? ', body=body' : ''})`);
    }
    out.push('', '');
  }
  out.push('class AthenaClient:', '    def __init__(self, base_url: str, token: str, timeout: float = 30.0):', '        self.base_url = base_url.rstrip("/")', '        self.token = token', '        self.timeout = timeout');
  for (const [group, cls] of classes) out.push(`        self.${pyName(group)} = ${cls}(self)`);
  out.push('', '    def request(self, method: str, path: str, query: Optional[Dict[str, Any]] = None, body: Any = None) -> Any:',
    '        url = self.base_url + path',
    '        if query:',
    '            url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})',
    '        data = json.dumps(body).encode("utf-8") if body is not None else None',
    '        headers = {"Authorization": "Bearer " + self.token}',
    '        if data is not None:',
    '            headers["Content-Type"] = "application/json"',
    '        request = urllib.request.Request(url, data=data, method=method, headers=headers)',
    '        try:',
    '            with urllib.request.urlopen(request, timeout=self.timeout) as response:',
    '                text = response.read().decode("utf-8")',
    '        except urllib.error.HTTPError as error:',
    '            raw = error.read().decode("utf-8")',
    '            try:',
    '                raise AthenaError(error.code, json.loads(raw)) from None',
    '            except ValueError:',
    '                raise AthenaError(error.code, raw) from None',
    '        if not text:',
    '            return None',
    '        try:',
    '            return json.loads(text)',
    '        except ValueError:',
    '            return text',
    '');
  return out.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('gen-sdk.mjs')) {
  let spec;
  if (arg('spec')) spec = JSON.parse(readFileSync(arg('spec'), 'utf8'));
  else if (arg('url')) spec = await (await fetch(new URL('/v1/openapi.json', arg('url')), { headers: { Authorization: `Bearer ${arg('token') ?? ''}` } })).json();
  else { console.error('Usage : node tools/gen-sdk.mjs --spec <openapi.json> | --url <instance> --token <jeton>'); process.exit(2); }
  mkdirSync(join(root, 'packages/sdk-ts/src'), { recursive: true });
  mkdirSync(join(root, 'packages/sdk-python/athena_sdk'), { recursive: true });
  writeFileSync(join(root, 'packages/sdk-ts/src/client.ts'), generateTs(spec));
  writeFileSync(join(root, 'packages/sdk-python/athena_sdk/client.py'), generatePython(spec));
  console.log(`SDK générés : ${operations(spec).length} opérations.`);
}
