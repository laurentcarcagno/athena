import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { z, type ZodType } from 'zod';
import { PUBLIC_KEY, ROLES_KEY } from '../auth/auth.guard';
import { BODY_SCHEMA_KEY } from './body-schema';

type Ctor = new (...args: never[]) => unknown;

const VERBS: Partial<Record<number, string>> = {
  [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch', [RequestMethod.DELETE]: 'delete',
};

const join = (...parts: string[]): string => '/' + parts.map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');

/**
 * Construit le document OpenAPI 3.1 depuis les métadonnées des contrôleurs NestJS (routes, méthodes, rôles requis).
 * Les schémas de corps restent décrits dans docs/api/REFERENCE.md ; ici : le contrat de routage et d'accès.
 */
export function buildOpenApi(controllers: Ctor[], version = '0.1.0'): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const controller of controllers) {
    const prefix = String(Reflect.getMetadata('path', controller) ?? '');
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = (controller.prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function' || name === 'constructor') continue;
      const verb = VERBS[Reflect.getMetadata('method', handler) as number];
      if (!verb) continue;
      const route = join(prefix, String(Reflect.getMetadata('path', handler) ?? ''));
      const path = route.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      const params = [...route.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
      const isPublic = Reflect.getMetadata(PUBLIC_KEY, handler) === true || Reflect.getMetadata(PUBLIC_KEY, controller) === true;
      const roles = (Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, controller)) as string[] | undefined;
      const bodySchema = Reflect.getMetadata(BODY_SCHEMA_KEY, handler) as ZodType | undefined;
      const status = Reflect.getMetadata('__httpCode__', handler) as number | undefined ?? (verb === 'post' ? 201 : 200);
      (paths[path] ??= {})[verb] = {
        operationId: `${controller.name.replace(/Controller$/, '')}_${name}`,
        tags: [controller.name.replace(/Controller$/, '')],
        parameters: params,
        ...(bodySchema ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(bodySchema, { io: 'input', unrepresentable: 'any' }) } } } } : {}),
        ...(isPublic ? { security: [] } : { security: [{ bearer: [] }, { session: [] }] }),
        ...(roles ? { 'x-athena-roles': roles } : {}),
        responses: { [String(status)]: { description: 'Succès' }, '401': { description: 'Non authentifié' }, '403': { description: 'Rôle insuffisant' }, '422': { description: 'Validation' } },
      };
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Athena API', version, description: 'Contrat de routage et de droits. Corps et exemples : docs/api/REFERENCE.md.' },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, session: { type: 'apiKey', in: 'cookie', name: 'athena_session' } } },
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
  };
}
