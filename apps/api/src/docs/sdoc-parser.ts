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

/** Nœud d'un document avec sa place dans l'arborescence (ordre, profondeur, section parente). */
export interface DocTreeNode extends DocNode {
  /** Ordre de lecture dans le document (0, 1, 2…). */
  position: number;
  /** Profondeur : 0 à la racine du document, +1 par section englobante. */
  depth: number;
  /** UID de la section englobante (réel, ou synthétique si la section n'en porte pas), nul à la racine. */
  parentUid: string | null;
  /** Vrai pour une section ou un texte sans UID : l'UID est alors calculé (`~<doc>:<position>`) et n'est pas affichable. */
  synthetic: boolean;
}

const NODE_TAGS = new Set(['REQUIREMENT', 'TEXT', 'SECTION', 'TABLE', 'FIGURE']);
/** Types qui peuvent exister sans UID (structure et texte courant) ; une exigence, un tableau ou une figure sans UID sont ignorés. */
const STRUCTURAL = new Set(['SECTION', 'TEXT']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_NODES = 50_000;

/**
 * Lecture seule d'un fichier `.sdoc` (StrictDoc 0.30). Les fichiers sont des entrées non fiables :
 * taille bornée, aucune exécution, aucune résolution de chemin. Retourne tous les nœuds dans l'ordre du document, avec leur
 * profondeur et leur section parente ; les sections et textes sans UID reçoivent un UID synthétique (`~<doc>:<position>`).
 */
export function parseSdocTree(content: string, docId = 'doc'): DocTreeNode[] {
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error('fichier .sdoc trop volumineux');
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const nodes: DocTreeNode[] = [];
  let documentTitle = '';
  let inDocument = false;
  let current: { type: string; depth: number; parent: string | null; fields: Map<string, string>; relations: Array<{ type: string; value: string }> } | null = null;
  /** Sections ouvertes : leur UID (réel ou synthétique) sert de parent aux nœuds qu'elles contiennent. */
  const open: string[] = [];
  let sectionCounter = 0;

  const flush = () => {
    if (!current) return;
    const c = current;
    current = null;
    const declared = c.fields.get('UID')?.trim();
    const synthetic = !declared;
    if (synthetic && !STRUCTURAL.has(c.type)) { if (c.type === 'SECTION') open.pop(); return; }
    const position = nodes.length;
    const uid = declared || `~${docId}:${position}`;
    const title = c.fields.get('TITLE') ?? '';
    const statement = c.fields.get('STATEMENT') ?? c.fields.get('CONTENT') ?? '';
    const status = c.fields.get('STATUS') ?? '';
    const parents = c.relations.filter((r) => r.type === 'Parent').map((r) => r.value);
    const refs = (c.fields.get('ATHENA_REFS') ?? '').split(',').map((r) => r.trim()).filter((r) => ITEM_KEY.test(r));
    nodes.push({
      uid, type: c.type, document: documentTitle, title, statement, status, parents, athenaRefs: refs,
      // L'empreinte d'un nœud réel ne dépend ni de sa place ni du document : déplacer une exigence ne la rend pas « modifiée ».
      contentHash: createHash('sha256').update(JSON.stringify([c.type, title, statement, status, parents, refs])).digest('hex'),
      position, depth: c.depth, parentUid: c.parent, synthetic,
    });
    if (c.type === 'SECTION') open[open.length - 1] = uid; // la section ouverte prend son UID définitif
    if (nodes.length > MAX_NODES) throw new Error('trop de nœuds');
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const tag = /^\[\[?(\/?)([A-Z_]+)\]?\]$/.exec(line);
    if (tag) {
      const name = tag[2]!;
      const closing = tag[1] === '/';
      flush();
      inDocument = name === 'DOCUMENT' && !closing;
      if (closing && name === 'SECTION') { open.pop(); continue; }
      if (!closing && NODE_TAGS.has(name)) {
        current = { type: name, depth: open.length, parent: open.length ? open[open.length - 1]! : null, fields: new Map(), relations: [] };
        if (name === 'SECTION') open.push(`~pending-${sectionCounter++}`); // remplacé par l'UID au flush
      }
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

/** Nœuds portant un UID déclaré (ceux qui se lient, se citent et se comparent), dans l'ordre du document. */
export function parseSdoc(content: string): DocNode[] {
  return parseSdocTree(content).filter((n) => !n.synthetic).map(({ position: _p, depth: _d, parentUid: _u, synthetic: _s, ...node }) => node);
}

/** Identifiant stable d'un document dans une source : `<source>.<chemin sans extension, en minuscules séparées par des tirets>`. */
export function docIdOf(source: string, path: string): string {
  const slug = path.replace(/\.sdoc$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'doc';
  return `${source}.${slug}`;
}

/**
 * Assainissement d'un texte documentaire avant renvoi : même principe que les commentaires (du texte, jamais du HTML interprété).
 * Retire les balises, commentaires HTML, blocs script/style et caractères de contrôle ; le client affiche le résultat comme du texte.
 */
export function sanitizeDocText(raw: string): string {
  let text = raw.replace(/\0/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  for (let i = 0; i < 5; i++) {
    const next = text
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\/?[a-zA-Z!?][^>]*>/g, '');
    if (next === text) break;
    text = next;
  }
  return text.replace(/\bjavascript:/gi, 'javascript​:');
}
