// Fonctions pures du CLI athena (références de tickets dans le code). Aucune dépendance.

const KEY = /\b([A-Z][A-Z0-9]{1,9}-\d{1,9})\b/g;

/** Clés d'artefact présentes dans un texte (message, nom de branche), dans l'ordre, sans doublon. */
export function extractKeys(text) {
  return [...new Set(String(text).slice(0, 20000).match(KEY) ?? [])];
}

/** Clés d'un nom de branche (`bugfix/BUG-12-resume`). */
export const keysFromBranch = (branch) => extractKeys(String(branch).slice(0, 255));

/**
 * Ajoute `Refs <CLÉ>` au message si aucune clé n'y figure et que la branche en porte une.
 * Les commentaires de git (lignes `#`) et les messages de fusion ou de revert automatiques sont laissés intacts.
 */
export function ensureKeyInMessage(message, branch) {
  const body = message.split('\n').filter((l) => !l.startsWith('#')).join('\n');
  if (extractKeys(body).length > 0) return message;
  if (/^(Merge |Revert ")/.test(body)) return message;
  const keys = keysFromBranch(branch);
  if (keys.length === 0) return message;
  const lines = message.split('\n');
  const firstComment = lines.findIndex((l) => l.startsWith('#'));
  const content = (firstComment >= 0 ? lines.slice(0, firstComment) : lines).join('\n').replace(/\s+$/, '');
  const comments = firstComment >= 0 ? `\n\n${lines.slice(firstComment).join('\n')}` : '\n';
  return `${content}\n\nRefs ${keys.join(', ')}${comments}`;
}

/**
 * Contrôle d'un commit : une clé est exigée sauf préfixes conventionnels exemptés (chore, docs, ci…),
 * commits de fusion et de revert automatiques.
 */
export function checkMessage(message, { exemptPrefixes = ['chore', 'docs', 'ci', 'build', 'style'] } = {}) {
  const subject = message.split('\n', 1)[0] ?? '';
  if (/^(Merge |Revert ")/.test(subject)) return { ok: true, keys: [], reason: 'fusion ou revert automatique' };
  const keys = extractKeys(message);
  if (keys.length > 0) return { ok: true, keys };
  const prefix = /^([a-z]+)(\([^)]*\))?!?:/.exec(subject)?.[1];
  if (prefix && exemptPrefixes.includes(prefix)) return { ok: true, keys: [], reason: `préfixe exempté : ${prefix}` };
  return { ok: false, keys: [], reason: 'aucune clé d’artefact (par exemple « Refs BUG-12 »)' };
}

/** Découpe la sortie de `git log --format=%H%x1f%B%x1e`. */
export function parseGitLog(output) {
  return output
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, ...rest] = record.split('\x1f');
      return { sha: sha.trim(), message: rest.join('\x1f').trim() };
    });
}

export const branchTypeFor = (type) => {
  if (type !== 'bugfix' && type !== 'feature') throw new Error('type attendu : bugfix ou feature');
  return type;
};
