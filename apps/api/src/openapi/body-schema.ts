import { SetMetadata } from '@nestjs/common';
import type { ZodType } from 'zod';

export const BODY_SCHEMA_KEY = 'athena:body-schema';
export const RAW_BODY_KEY = 'athena:raw-body';

/** Corps binaire brut (ex. envoi d'un fichier) : décrit comme `application/octet-stream`. */
export const RawBody = () => SetMetadata(RAW_BODY_KEY, true);

/** Déclare le schéma zod du corps d'une route : il alimente le document OpenAPI (la validation reste dans parseBody). */
export const BodySchema = (schema: ZodType) => SetMetadata(BODY_SCHEMA_KEY, schema);
