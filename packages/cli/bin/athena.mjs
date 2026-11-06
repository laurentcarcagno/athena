#!/usr/bin/env node
// CLI athena. Variables : ATHENA_URL (ex. https://athena.exemple.lan), ATHENA_TOKEN (jeton Bearer), ATHENA_PROJECT.
//   athena branch <CLÉ> [--type bugfix|feature] [--project P] [--checkout]   crée la branche depuis le ticket
//   athena hook commit-msg <fichier>                                           ajoute « Refs <CLÉ> » d'après la branche
//   athena hook install                                                        installe le hook commit-msg du dépôt
//   athena check [--range base..head] [--project P] [--offline]                contrôle les références des commits
import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { branchTypeFor, checkMessage, ensureKeyInMessage, extractKeys, isItemKey, parseGitLog } from '../src/lib.js';

const [, , command, ...args] = process.argv;
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);
const fail = (message, code = 1) => {
  console.error(`athena : ${message}`);
  process.exit(code);
};
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

function api(method, path, body) {
  const base = process.env.ATHENA_URL;
  const token = process.env.ATHENA_TOKEN;
  if (!base || !token) fail('ATHENA_URL et ATHENA_TOKEN sont obligatoires');
  return fetch(`${base.replace(/\/$/, '')}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
}

async function main() {
  const project = option('--project', process.env.ATHENA_PROJECT);
  switch (command) {
    case 'branch': {
      const key = args[0];
      if (!key || !isItemKey(key)) fail('clé d’artefact attendue (ex. SAT1-BUG-0012)');
      if (!project) fail('--project ou ATHENA_PROJECT requis');
      const response = await api('POST', `/v1/projects/${project}/artifacts/${key}/branch`, { type: branchTypeFor(option('--type', 'bugfix')) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) fail(payload.message ? `${payload.message} ${(payload.details ?? []).join(' ; ')}` : `HTTP ${response.status}`);
      console.log(payload.branch);
      if (flag('--checkout')) {
        git('fetch', 'origin', payload.branch);
        git('checkout', '-b', payload.branch, '--track', `origin/${payload.branch}`);
      }
      break;
    }
    case 'hook': {
      if (args[0] === 'install') {
        const file = join(git('rev-parse', '--git-path', 'hooks'), 'commit-msg');
        writeFileSync(file, '#!/bin/sh\nexec athena hook commit-msg "$1"\n');
        try { chmodSync(file, 0o755); } catch { /* Windows */ }
        console.log(`hook installé : ${file}`);
      } else if (args[0] === 'commit-msg') {
        const file = args[1];
        if (!file) fail('fichier de message requis');
        let branch = '';
        try { branch = git('rev-parse', '--abbrev-ref', 'HEAD'); } catch { /* dépôt sans commit */ }
        const original = readFileSync(file, 'utf8');
        const updated = ensureKeyInMessage(original, branch);
        if (updated !== original) writeFileSync(file, updated);
      } else fail('usage : hook install | hook commit-msg <fichier>');
      break;
    }
    case 'check': {
      const range = option('--range', process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ? `${process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA}..HEAD` : 'origin/main..HEAD');
      const commits = parseGitLog(git('log', '--format=%H%x1f%B%x1e', range));
      const problems = [];
      const cache = new Map();
      for (const commit of commits) {
        const verdict = checkMessage(commit.message);
        if (!verdict.ok) { problems.push(`${commit.sha.slice(0, 8)} : ${verdict.reason}`); continue; }
        if (flag('--offline') || !project) continue;
        for (const key of extractKeys(commit.message)) {
          if (!cache.has(key)) cache.set(key, (await api('GET', `/v1/projects/${project}/artifacts/${key}`)).status);
          if (cache.get(key) === 404) problems.push(`${commit.sha.slice(0, 8)} : ${key} n’existe pas dans le projet ${project}`);
          else if (cache.get(key) === 401 || cache.get(key) === 403) fail(`accès refusé à l’API Athena (HTTP ${cache.get(key)})`, 2);
        }
      }
      if (problems.length) {
        console.error(`athena check : ${problems.length} problème(s) sur ${commits.length} commit(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`);
        process.exit(1);
      }
      console.log(`athena check : ${commits.length} commit(s) conforme(s)`);
      break;
    }
    default:
      fail('commandes : branch, hook, check');
  }
}

main().catch((error) => fail(error.message));
