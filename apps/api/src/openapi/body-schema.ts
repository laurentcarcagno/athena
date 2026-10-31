import { SetMetadata } from '@nestjs/common';
import type { ZodType } from 'zod';

export const BODY_SCHEMA_KEY = 'athena:body-schema';

/** Déclare le schéma zod du corps d'une route : il alimente le document OpenAPI (la validation reste dans parseBody). */
export const BodySchema = (schema: ZodType) => SetMetadata(BODY_SCHEMA_KEY, schema);
