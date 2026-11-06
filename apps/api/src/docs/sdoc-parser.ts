import { ITEM_KEY } from '../core/key';
import { createHash } from 'node:crypto';

export interface DocNode {
  uid: string;
  type: string;
  document: string;
  title: string;
  statement: string;
  status: string;
  parents: string[];
  athenaRefs: string[];
  contentHash: string;
}

const NODE_TAGS = new Set(['REQUIREMENT', 'TEXT', 'SECTION', 'TABLE', 'FIGURE']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_NODES = 50_000;

/**
 * Lecture seule d'un fichier `.sdoc` (StrictDoc 0.30). Les fichiers sont des entrées non fiables :
 * taille bornée, aucune exécution, aucune résolution de chemin. Seuls les nœuds portant un UID sont retenus.
 */
export function parseSdoc(content: string): DocNode[] {
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error('fichier .sdoc trop volumineux');
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const nodes: DocNode[] = [];
  let documentTitle = '';
  let inDocument = false;
  let current: { type: string; fields: Map<string, string>; relations: Array<{ type: string; value: string }> } | null = null;

  const flush = () => {
    if (!current) return;
    const uid = current.fields.get('UID')?.trim();
    if (uid) {
      const title = current.fields.get('TITLE') ?? '';
      const statement = current.fields.get('STATEMENT') ?? '';
      const status = current.fields.get('STATUS') ?? '';
      const parents = current.relations.filter((r) => r.type === 'Parent').map((r) => r.value);
      const refs = (current.fields.get('ATHENA_REFS') ?? '').split(',').map((r) => r.trim()).filter((r) => ITEM_KEY.test(r));
      nodes.push({
        uid, type: current.type, document: documentTitle, title, statement, status, parents, athenaRefs: refs,
        contentHash: createHash('sha256').update(JSON.stringify([current.type, title, statement, status, parents, refs])).digest('hex'),
      });
      if (nodes.length > MAX_NODES) throw new Error('trop de nœuds');
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const tag = /^\[\[?(\/?)([A-Z_]+)\]?\]$/.exec(line);
    if (tag) {
      const name = tag[2]!;
      const closing = tag[1] === '/';
      flush();
      inDocument = name === 'DOCUMENT' && !closing;
      if (!closing && NODE_TAGS.has(name)) current = { type: name, fields: new Map(), relations: [] };
      continue;
    }
    if (inDocument) {
      const title = /^TITLE:\s*(.*)$/.exec(line);
      if (title) { documentTitle = title[1]!.trim(); inDocument = false; }
      continue;
    }
    if (!current) continue;
    const multi = /^([A-Z_][A-Z0-9_]*):\s*>>>\s*$/.exec(line);
    if (multi) {
      const body: string[] = [];
      while (++i < lines.length && lines[i] !== '<<<') body.push(lines[i]!);
      current.fields.set(multi[1]!, body.join('\n'));
      continue;
    }
    if (line === 'RELATIONS:') {
      while (i + 1 < lines.length && /^(- |  )/.test(lines[i + 1]!)) {
        const typeLine = /^- TYPE:\s*(\S+)/.exec(lines[++i]!);
        if (!typeLine) continue;
        const valueLine = /^  VALUE:\s*(\S+)/.exec(lines[i + 1] ?? '');
        if (valueLine) i++;
        current.relations.push({ type: typeLine[1]!, value: valueLine?.[1] ?? '' });
      }
      continue;
    }
    const single = /^([A-Z_][A-Z0-9_]*):\s*(.*)$/.exec(line);
    if (single) current.fields.set(single[1]!, single[2]!.trim());
  }
  flush();
  return nodes;
}
