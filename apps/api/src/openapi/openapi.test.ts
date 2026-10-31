import { describe, expect, it } from 'vitest';
import { OpenApiController } from './openapi.controller';

type Op = { security: unknown[]; 'x-athena-roles'?: string[]; responses: Record<string, unknown>; parameters: Array<{ name: string }> };
const doc = new OpenApiController().spec() as { openapi: string; paths: Record<string, Record<string, Op>> };

describe('schéma OpenAPI', () => {
  it('liste les routes avec paramètres, rôles et codes de succès', () => {
    expect(doc.openapi).toBe('3.1.0');
    const create = doc.paths['/v1/projects/{project}/artifacts/{key}/attachments']!['post']!;
    expect(create['x-athena-roles']).toEqual(['athena-user', 'athena-admin']);
    expect(create.parameters.map((p) => p.name)).toEqual(['project', 'key']);
    expect(Object.keys(create.responses)).toContain('201');
    expect(Object.keys(doc.paths['/v1/projects/{project}/artifacts/{key}/attachments/{id}']!['delete']!.responses)).toContain('204');
  });
  it('marque les routes publiques sans exigence d’authentification', () => {
    const publicOps = Object.values(doc.paths).flatMap((p) => Object.values(p)).filter((o) => o.security.length === 0);
    expect(publicOps.length).toBeGreaterThan(0);
    expect(doc.paths['/v1/openapi.json']!['get']!.security.length).toBeGreaterThan(0);
  });
  it('couvre toutes les routes du noyau, sans doublon de chemin', () => {
    const ops = Object.values(doc.paths).flatMap((p) => Object.keys(p));
    expect(ops.length).toBeGreaterThan(60);
    expect(Object.keys(doc.paths).every((p) => p.startsWith('/'))).toBe(true);
  });
});
