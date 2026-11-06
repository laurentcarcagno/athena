import type { PoolClient } from 'pg';
import { z } from 'zod';
import { parseClauses, type ClauseRowError } from '../import/clause-csv';
import type { ArtifactService } from './artifact.service';
import { Db, type Actor } from './db';
import { notFound, validation } from './errors';
import { builtinSnapshot } from './template.service';
import { audit } from './tracker.service';

export const CLAUSE_TRACKER = 'NORM';
export const APPLICABILITY = ['applicable', 'not_applicable', 'modified'] as const;
export type Applicability = (typeof APPLICABILITY)[number];

export const TailoringInput = z.object({
  clause: z.string().trim().min(1).max(200),
  category: z.string().regex(/^(\*|[A-Za-z0-9][A-Za-z0-9_-]{0,19})$/).default('*'),
  applicability: z.enum(APPLICABILITY),
  justification: z.string().trim().max(2000).default(''),
}).refine((t) => t.applicability === 'applicable' || t.justification.length > 0, { message: 'la justification est obligatoire pour une clause non applicable ou modifiée', path: ['justification'] });
export type TailoringInput = z.infer<typeof TailoringInput>;

export interface TailoringView { clause: string; category: string; applicability: Applicability; justification: string; updatedBy: string; updatedAt: string }
export interface ClauseImportLine { line: number; reference: string; status: 'created' | 'updated' | 'unchanged' | 'error'; key?: string; message?: string }
export interface ClauseImportReport { created: number; updated: number; unchanged: number; errors: number; lines: ClauseImportLine[] }
export interface ConformityRow {
  key: string; reference: string; title: string; standard: string; applicability: Applicability; justification: string;
  evidence: Array<{ key: string; title: string; tracker: string }>; covered: boolean;
}
export interface Conformity {
  category: string | null; categories: string[];
  totals: { clauses: number; applicable: number; notApplicable: number; modified: number; covered: number; rate: number | null };
  rows: ConformityRow[];
}

/** Collation naturelle des références (« 5.2.10 » après « 5.2.9 »). */
const byReference = (a: { reference: string }, b: { reference: string }) => a.reference.localeCompare(b.reference, 'en', { numeric: true });

/** Neutralise l'interprétation d'une cellule comme formule dans un tableur, puis la met entre guillemets si besoin. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Exigences normatives : import des clauses d'une norme, tailoring par catégorie et matrice de conformité clause × preuve. */
export class NormativeService {
  constructor(private readonly db: Db, private readonly artifacts: ArtifactService) {}

  private async project(c: PoolClient, key: string) {
    const p = (await c.query('select id, criticality, template_key, template_version from project where key = $1', [key])).rows[0];
    if (!p) throw notFound(`Projet ${key}`);
    return p as { id: string; criticality: string | null; template_key: string | null; template_version: string | null };
  }

  private async clauseTracker(c: PoolClient, projectId: string, tracker: string): Promise<string> {
    const t = (await c.query('select id from tracker where project_id = $1 and key = $2', [projectId, tracker])).rows[0];
    if (!t) throw validation([`le projet n’a pas de tracker ${tracker} (exigences normatives)`]);
    return t.id as string;
  }

  /** Catégories de criticité du gabarit du projet (vide si le gabarit n'en définit pas). */
  private async categories(c: PoolClient, p: { template_key: string | null; template_version: string | null }): Promise<string[]> {
    if (!p.template_key || !p.template_version) return [];
    const shipped = builtinSnapshot(p.template_key, p.template_version);
    if (shipped) return (shipped.normative.criticality?.categories ?? []).map((x) => x.key);
    const row = (await c.query('select snapshot from project_template_version where template_key = $1 and version = $2', [p.template_key, p.template_version])).rows[0];
    return ((row?.snapshot?.normative?.criticality?.categories ?? []) as Array<{ key: string }>).map((x) => x.key);
  }

  /**
   * Importe les clauses d'un CSV (référence, titre, texte) dans le tracker des exigences normatives. Idempotent : une clause
   * déjà présente (même référence) est mise à jour si son contenu change, sinon laissée telle quelle. Rapport ligne par ligne.
   */
  async importClauses(organizationId: string, projectKey: string, input: { csv: string; standard?: string; tracker?: string }, actor: Actor): Promise<ClauseImportReport> {
    const tracker = input.tracker ?? CLAUSE_TRACKER;
    let parsed: ReturnType<typeof parseClauses>;
    try { parsed = parseClauses(input.csv); } catch (e) { throw validation([(e as Error).message]); }
    const existing = await this.db.tx(organizationId, async (c) => {
      const p = await this.project(c, projectKey);
      const trackerId = await this.clauseTracker(c, p.id, tracker);
      return new Map((await c.query(`select key, version, "values" from artifact where tracker_id = $1 and "values" ? 'reference'`, [trackerId])).rows
        .map((r) => [(r.values as Record<string, unknown>)['reference'] as string, { key: r.key as string, version: r.version as number, values: r.values as Record<string, unknown> }]));
    });
    const lines: ClauseImportLine[] = parsed.errors.map((e: ClauseRowError) => ({ line: e.line, reference: e.reference, status: 'error' as const, message: e.message }));
    for (const row of parsed.rows) {
      const values = { title: row.title, reference: row.reference, ...(row.text ? { statement: row.text } : {}), ...((row.standard || input.standard) ? { standard: row.standard || input.standard! } : {}) };
      try {
        const found = existing.get(row.reference);
        if (!found) {
          const created = await this.artifacts.create(organizationId, projectKey, tracker, values, actor);
          lines.push({ line: row.line, reference: row.reference, status: 'created', key: created.key });
        } else if (Object.entries(values).every(([k, v]) => found.values[k] === v)) {
          lines.push({ line: row.line, reference: row.reference, status: 'unchanged', key: found.key });
        } else {
          await this.artifacts.update(organizationId, projectKey, found.key, values, found.version, actor);
          lines.push({ line: row.line, reference: row.reference, status: 'updated', key: found.key });
        }
      } catch (e) {
        lines.push({ line: row.line, reference: row.reference, status: 'error', message: (e as Error).message });
      }
    }
    lines.sort((a, b) => a.line - b.line);
    const count = (s: ClauseImportLine['status']) => lines.filter((l) => l.status === s).length;
    return { created: count('created'), updated: count('updated'), unchanged: count('unchanged'), errors: count('error'), lines };
  }

  async listTailoring(organizationId: string, projectKey: string): Promise<TailoringView[]> {
    return this.db.tx(organizationId, async (c) => {
      const p = await this.project(c, projectKey);
      return (await c.query('select clause_key, category, applicability, justification, updated_by, updated_at from tailoring where project_id = $1 order by clause_key, category', [p.id])).rows
        .map((r) => ({ clause: r.clause_key as string, category: r.category as string, applicability: r.applicability as Applicability, justification: r.justification as string, updatedBy: r.updated_by as string, updatedAt: (r.updated_at as Date).toISOString() }))
        .sort((a, b) => byReference({ reference: a.clause }, { reference: b.clause }) || a.category.localeCompare(b.category));
    });
  }

  /** Pose le tailoring d'une clause pour une catégorie (ou `*`) ; « applicable » efface la ligne (c'est la valeur par défaut). */
  async setTailoring(organizationId: string, projectKey: string, input: TailoringInput, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const p = await this.project(c, projectKey);
      const trackerId = await this.clauseTracker(c, p.id, CLAUSE_TRACKER);
      if (((await c.query(`select 1 from artifact where tracker_id = $1 and "values"->>'reference' = $2`, [trackerId, input.clause])).rowCount ?? 0) === 0) throw validation([`clause inconnue : ${input.clause}`]);
      const cats = await this.categories(c, p);
      if (input.category !== '*' && cats.length > 0 && !cats.includes(input.category)) throw validation([`catégorie inconnue : ${input.category}`]);
      if (input.applicability === 'applicable') {
        await c.query('delete from tailoring where project_id = $1 and clause_key = $2 and category = $3', [p.id, input.clause, input.category]);
      } else {
        await c.query(
          `insert into tailoring (organization_id, project_id, clause_key, category, applicability, justification, updated_by) values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (project_id, clause_key, category) do update set applicability = excluded.applicability, justification = excluded.justification, updated_by = excluded.updated_by, updated_at = now()`,
          [organizationId, p.id, input.clause, input.category, input.applicability, input.justification, actor.id],
        );
      }
      await audit(c, organizationId, actor, 'tailoring.set', `project:${projectKey}`, { clause: input.clause, category: input.category, applicability: input.applicability });
    });
  }

  /**
   * Matrice de conformité : pour la catégorie demandée (par défaut celle du projet), chaque clause en vigueur est applicable,
   * non applicable ou modifiée (tailoring), et une clause applicable est couverte si elle est liée à au moins une preuve
   * (un item d'un autre tracker : procédure, document, test…).
   */
  async conformity(organizationId: string, projectKey: string, category?: string): Promise<Conformity> {
    return this.db.tx(organizationId, async (c) => {
      const p = await this.project(c, projectKey);
      const trackerId = await this.clauseTracker(c, p.id, CLAUSE_TRACKER);
      const cats = await this.categories(c, p);
      const chosen = category ?? p.criticality;
      if (chosen && cats.length > 0 && !cats.includes(chosen)) throw validation([`catégorie inconnue : ${chosen}`]);
      const clauses = (await c.query(
        `select a.id, a.key, a."values" from artifact a join status s on s.id = a.status_id where a.tracker_id = $1 and s.category <> 'done' and a."values" ? 'reference'`, [trackerId])).rows;
      const tailoring = new Map((await c.query('select clause_key, category, applicability, justification from tailoring where project_id = $1', [p.id])).rows
        .map((r) => [`${r.clause_key}|${r.category}`, { applicability: r.applicability as Applicability, justification: r.justification as string }]));
      const evidenceRows = (await c.query(
        `select e.clause_id, o.key, o."values"->>'title' as title, ot.key as tracker from (
           select l.from_artifact_id as clause_id, l.to_artifact_id as other_id from artifact_link l join artifact a on a.id = l.from_artifact_id where a.tracker_id = $1
           union
           select l.to_artifact_id, l.from_artifact_id from artifact_link l join artifact a on a.id = l.to_artifact_id where a.tracker_id = $1
         ) e join artifact o on o.id = e.other_id join tracker ot on ot.id = o.tracker_id where o.tracker_id <> $1 order by o.key`, [trackerId])).rows;
      const evidence = new Map<string, ConformityRow['evidence']>();
      for (const r of evidenceRows) evidence.set(r.clause_id as string, [...(evidence.get(r.clause_id as string) ?? []), { key: r.key as string, title: (r.title as string | null) ?? '', tracker: r.tracker as string }]);
      const rows: ConformityRow[] = clauses.map((a) => {
        const v = a.values as Record<string, unknown>;
        const reference = String(v['reference']);
        const t = (chosen ? tailoring.get(`${reference}|${chosen}`) : undefined) ?? tailoring.get(`${reference}|*`) ?? { applicability: 'applicable' as const, justification: '' };
        const ev = evidence.get(a.id as string) ?? [];
        return { key: a.key as string, reference, title: String(v['title'] ?? ''), standard: String(v['standard'] ?? ''), applicability: t.applicability, justification: t.justification, evidence: ev, covered: t.applicability !== 'not_applicable' && ev.length > 0 };
      }).sort(byReference);
      const applicable = rows.filter((r) => r.applicability !== 'not_applicable');
      const covered = applicable.filter((r) => r.covered).length;
      return {
        category: chosen ?? null, categories: cats,
        totals: {
          clauses: rows.length, applicable: applicable.length, notApplicable: rows.length - applicable.length, modified: rows.filter((r) => r.applicability === 'modified').length, covered,
          rate: applicable.length === 0 ? null : Math.round((covered / applicable.length) * 1000) / 10,
        },
        rows,
      };
    });
  }

  /** Export CSV de la matrice (audit) : BOM pour les tableurs, cellules protégées contre l'interprétation comme formule. */
  async conformityCsv(organizationId: string, projectKey: string, category?: string): Promise<{ filename: string; csv: string }> {
    const m = await this.conformity(organizationId, projectKey, category);
    const header = ['reference', 'title', 'standard', 'applicability', 'justification', 'evidence', 'covered'];
    const lines = m.rows.map((r) => [r.reference, r.title, r.standard, r.applicability, r.justification, r.evidence.map((e) => e.key).join(' '), r.applicability === 'not_applicable' ? '' : r.covered ? 'yes' : 'no'].map(csvCell).join(','));
    const rate = m.totals.rate === null ? '' : String(m.totals.rate);
    const csv = `﻿${[header.join(','), ...lines, ['', '', '', '', '', `conformity ${rate}%`, ''].join(',')].join('\n')}\n`;
    return { filename: `conformite-${projectKey}${m.category ? `-${m.category}` : ''}.csv`, csv };
  }
}
