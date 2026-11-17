import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// T-0196 (B14) : test d'architecture. Toute table qui porte `project_id` ou `artifact_id` doit déclarer une politique restrictive
// `acl_read` (besoin d'en connaître), sauf exception justifiée ci-dessous. Analyse des fichiers de migration, sans base.

const dir = join(__dirname, 'migrations');

/** Tables portant un identifiant de projet ou d'artefact SANS politique `acl_read`, avec la raison. Toute entrée doit être justifiée. */
export const EXEMPTIONS: Record<string, string> = {
  access_list: 'Source de vérité de acl_allows() : une politique acl_read sur la liste elle-même rendrait la fonction récursive ; l’accès est réservé aux administrateurs par l’API.',
  export_control_member: 'Source de vérité du marquage de contrôle export lue par les politiques de artifact ; l’écriture est réservée aux responsables par l’API.',
};

interface Table { name: string; scoped: boolean }

/** Tables créées (nom, colonne `project_id` ou `artifact_id` présente) et politiques `acl_read` posées, sur l'ensemble des migrations. */
export function analyse(sources: string[]): { tables: Table[]; policies: Set<string> } {
  const tables = new Map<string, Table>();
  const policies = new Set<string>();
  for (const raw of sources) {
    const sql = raw.replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\)\s*;/gi)) {
      const name = m[1]!;
      const scoped = /(^|[\s,(])(project_id|artifact_id)\s/i.test(m[2]!);
      tables.set(name, { name, scoped: scoped || (tables.get(name)?.scoped ?? false) });
    }
    for (const m of sql.matchAll(/alter\s+table\s+([a-z_][a-z0-9_]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(project_id|artifact_id)\b/gi)) {
      const t = tables.get(m[1]!);
      if (t) t.scoped = true;
    }
    for (const m of sql.matchAll(/create\s+policy\s+(?:"?acl_read"?|[a-z_]*acl[a-z_]*)\s+on\s+([a-z_][a-z0-9_]*)/gi)) policies.add(m[1]!);
    // Politiques posées en boucle (`execute format('create policy acl_read on %I …')` sur un tableau de noms de tables).
    if (/acl_read\s+on\s+%I/i.test(sql)) {
      for (const arr of sql.matchAll(/array\s*\[([^\]]*)\]/gi)) for (const n of arr[1]!.matchAll(/'([a-z_][a-z0-9_]*)'/g)) policies.add(n[1]!);
    }
  }
  return { tables: [...tables.values()], policies };
}

const migrations = () => readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8'));

describe('politiques RLS : architecture des migrations', () => {
  it('toute table avec project_id ou artifact_id déclare une politique acl_read, ou une exception justifiée', () => {
    const { tables, policies } = analyse(migrations());
    const missing = tables.filter((t) => t.scoped && !policies.has(t.name) && !(t.name in EXEMPTIONS)).map((t) => t.name).sort();
    expect(missing).toEqual([]);
  });

  it('cas témoin : une table sans politique est détectée, une table avec politique ne l’est pas', () => {
    const bad = analyse(['create table temoin_a (\n  id uuid primary key,\n  project_id uuid not null\n);']);
    expect(bad.tables.filter((t) => t.scoped && !bad.policies.has(t.name)).map((t) => t.name)).toEqual(['temoin_a']);
    const good = analyse(['create table temoin_b (\n  id uuid,\n  artifact_id uuid\n);\ncreate policy acl_read on temoin_b as restrictive for all using (true);']);
    expect(good.tables.filter((t) => t.scoped && !good.policies.has(t.name))).toEqual([]);
    const other = analyse(['create table temoin_c (\n  id uuid,\n  name text\n);']);
    expect(other.tables.filter((t) => t.scoped)).toEqual([]);
  });

  it('chaque exception est une table qui existe et reste justifiée par une phrase', () => {
    const names = new Set(analyse(migrations()).tables.map((t) => t.name));
    for (const [table, why] of Object.entries(EXEMPTIONS)) {
      expect(names.has(table), table).toBe(true);
      expect(why.length, table).toBeGreaterThan(20);
    }
  });
});
