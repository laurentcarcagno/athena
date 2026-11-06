import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkMessage, ensureKeyInMessage, extractKeys, isItemKey, keysFromBranch, parseGitLog } from './lib.js';

const CLI = join(import.meta.dirname, '..', 'bin', 'athena.mjs');

describe('références', () => {
  it('extrait les clés et ignore le reste', () => {
    expect(extractKeys('Fixes BUG-12 et REQ-3, voir BUG-12 ; utf-8, sha-256, bug-1')).toEqual(['BUG-12', 'REQ-3']);
    expect(keysFromBranch('bugfix/BUG-12-crash')).toEqual(['BUG-12']);
    expect(keysFromBranch('main')).toEqual([]);
    expect(extractKeys('Fixes SAT1-BUG-0012, REQ-3 et SAT1-REQ-0042')).toEqual(['SAT1-BUG-0012', 'REQ-3', 'SAT1-REQ-0042']);
    expect(keysFromBranch('bugfix/SAT1-BUG-0012-crash')).toEqual(['SAT1-BUG-0012']);
    expect(isItemKey('SAT1-REQ-0042') && isItemKey('REQ-42')).toBe(true);
    expect(isItemKey('sat1-req-0042') || isItemKey('REQ-')).toBe(false);
  });
  it('ajoute Refs depuis la branche, sans toucher aux messages déjà référencés, aux fusions ni aux commentaires', () => {
    expect(ensureKeyInMessage('Corrige le crash\n', 'bugfix/BUG-12-crash')).toBe('Corrige le crash\n\nRefs BUG-12\n');
    expect(ensureKeyInMessage('Corrige le crash\n\n# Please enter\n# comments', 'feature/STORY-3-x')).toBe('Corrige le crash\n\nRefs STORY-3\n\n# Please enter\n# comments');
    expect(ensureKeyInMessage('Fixes BUG-9\n', 'bugfix/BUG-12-crash')).toBe('Fixes BUG-9\n');
    expect(ensureKeyInMessage('Merge branch x\n', 'bugfix/BUG-12-crash')).toBe('Merge branch x\n');
    expect(ensureKeyInMessage('Message\n', 'main')).toBe('Message\n');
  });
  it('contrôle les messages avec exemptions conventionnelles', () => {
    expect(checkMessage('fix: crash\n\nRefs BUG-1').ok).toBe(true);
    expect(checkMessage('chore(deps): maj').ok).toBe(true);
    expect(checkMessage('Merge branch x into main').ok).toBe(true);
    expect(checkMessage('fix: sans clé')).toMatchObject({ ok: false });
    expect(checkMessage('feat: nouveau', { exemptPrefixes: ['feat'] }).ok).toBe(true);
  });
  it('découpe la sortie de git log', () => {
    expect(parseGitLog('abc\x1fMessage un\n\nCorps\x1e\ndef\x1fMessage deux\x1e')).toEqual([{ sha: 'abc', message: 'Message un\n\nCorps' }, { sha: 'def', message: 'Message deux' }]);
  });
});

describe('commande athena', () => {
  let dir;
  let server;
  let url;
  const requests = [];
  // Asynchrone : le serveur HTTP de test vit dans ce processus et doit pouvoir répondre pendant l'exécution du CLI.
  const exec = (cwd, env, args) => new Promise((resolve) => execFile(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env }, (error, stdout, stderr) => resolve({ status: error ? (error.code ?? 1) : 0, stdout, stderr })));
  const run = (cwd, ...args) => exec(cwd, { ...process.env, ATHENA_URL: url, ATHENA_TOKEN: 'jeton-test', ATHENA_PROJECT: 'ARI' }, args);
  const git = (...a) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@e.test', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8' });

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests.push(`${req.method} ${req.url} ${req.headers.authorization}`);
      const known = /\/artifacts\/(BUG-1|BUG-2)$/.test(req.url);
      if (req.method === 'POST' && req.url.endsWith('/branch')) { res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ branch: 'bugfix/BUG-1-crash' })); return; }
      res.writeHead(known ? 200 : 404, { 'content-type': 'application/json' });
      res.end('{}');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
    dir = mkdtempSync(join(tmpdir(), 'athena-cli-'));
    git('init', '-b', 'main');
    writeFileSync(join(dir, 'a.txt'), 'a');
    git('add', '.'); git('commit', '-m', 'chore: init');
    git('checkout', '-b', 'bugfix/BUG-1-crash');
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  it('crée la branche depuis le ticket avec le jeton Bearer', async () => {
    const result = await run(dir, 'branch', 'BUG-1', '--type', 'bugfix');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('bugfix/BUG-1-crash');
    expect(requests.at(-1)).toBe('POST /v1/projects/ARI/artifacts/BUG-1/branch Bearer jeton-test');
    expect((await run(dir, 'branch', 'pas-une-cle')).status).toBe(1);
  });

  it('complète le message depuis la branche via le hook commit-msg', async () => {
    const file = join(dir, 'msg.txt');
    writeFileSync(file, 'Corrige le crash\n');
    expect((await run(dir, 'hook', 'commit-msg', file)).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe('Corrige le crash\n\nRefs BUG-1\n');
  });

  it('contrôle les commits d’une plage : clé manquante, clé inconnue, puis conformité', async () => {
    writeFileSync(join(dir, 'b.txt'), 'b'); git('add', '.'); git('commit', '-m', 'fix: sans clé');
    const missing = await run(dir, 'check', '--range', 'main..HEAD', '--offline');
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('aucune clé d’artefact');

    writeFileSync(join(dir, 'c.txt'), 'c'); git('add', '.'); git('commit', '-m', 'fix: autre\n\nRefs BUG-404');
    const unknown = await run(dir, 'check', '--range', 'HEAD~1..HEAD');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('BUG-404 n’existe pas dans le projet ARI');

    writeFileSync(join(dir, 'd.txt'), 'd'); git('add', '.'); git('commit', '-m', 'fix: ok\n\nRefs BUG-2');
    const fine = await run(dir, 'check', '--range', 'HEAD~1..HEAD');
    expect(fine.status).toBe(0);
    expect(fine.stdout).toContain('1 commit(s) conforme(s)');
  });

  it('refuse sans configuration et verifie hors ligne', async () => {
    const bare = { PATH: process.env.PATH };
    const offline = await exec(dir, bare, ['check', '--range', 'HEAD~1..HEAD']); // dernier commit conforme, aucun projet : pas de contrôle d'existence
    expect(offline.status).toBe(0);
    const noToken = await exec(dir, bare, ['branch', 'BUG-1', '--project', 'ARI']);
    expect(noToken.status).toBe(1);
    expect(noToken.stderr).toContain('ATHENA_URL et ATHENA_TOKEN');
  });
});
