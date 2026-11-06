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
  it('décrit le corps des routes qui déclarent un schéma', () => {
    const body = (doc.paths['/v1/projects/{project}/artifacts/{key}/transitions']!['post'] as unknown as { requestBody: { content: Record<string, { schema: { required: string[]; properties: Record<string, { type: string }> } }> } }).requestBody;
    const schema = body.content['application/json']!.schema;
    expect(schema.required).toEqual(expect.arrayContaining(['name', 'version']));
    expect(schema.properties['version']!.type).toBe('integer');
    expect(JSON.stringify(doc)).not.toContain('"undefined"');
  });
  it('documente un corps pour toute écriture qui en reçoit un, sauf les actions sans corps connues', () => {
    const noBody = new Set([
      'POST /auth/logout', 'POST /v1/automations/{id}/{state}', 'POST /v1/plugins/{id}/{state}', 'POST /v1/projects/{project}/links/{id}/clear-suspect',
      'POST /v1/projects/{project}/rebuild', 'POST /v1/projects/{project}/history/migrate-keys', 'POST /v1/projects/{project}/releases/{id}/publish', 'POST /v1/projects/{project}/sprints/{id}/close',
      'POST /v1/projects/{project}/sprints/{id}/start', 'POST /v1/webhooks/deliveries/{id}/replay',
      'POST /v1/projects/{project}/integrations/gitlab', 'POST /v1/projects/{project}/integrations/history',
      'POST /hooks/in/source/{org}/{project}/{name}', // charge externe signée (HMAC) lue en octets bruts : forme fixée par l’émetteur
    ]);
    const missing: string[] = [];
    for (const [path, ops] of Object.entries(doc.paths)) for (const [method, op] of Object.entries(ops)) {
      if (['post', 'put', 'patch'].includes(method) && !(op as { requestBody?: unknown }).requestBody && !noBody.has(`${method.toUpperCase()} ${path}`)) missing.push(`${method.toUpperCase()} ${path}`);
    }
    expect(missing).toEqual([]);
    const upload = doc.paths['/v1/projects/{project}/artifacts/{key}/attachments']!['post'] as unknown as { requestBody: { content: Record<string, unknown> } };
    expect(Object.keys(upload.requestBody.content)).toEqual(['application/octet-stream']);
  });
});
