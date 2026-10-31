import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1),
  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_AUDIENCE: z.string().min(1).default('athena-api'),
  OPENBAO_ADDR: z.string().url().optional(),
  OPENBAO_TOKEN: z.string().min(1).optional(),
  WEBHOOK_ALLOW_PRIVATE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  KEYCLOAK_WEB_CLIENT_ID: z.string().default('athena-web'),
  KEYCLOAK_WEB_CLIENT_SECRET: z.string().min(8).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400 * 7).default(28_800),
  GITLAB_URL: z.string().url().optional(),
  GITLAB_TOKEN: z.string().min(10).optional(),
  GITLAB_NAMESPACE: z.string().min(1).optional(),
  /** Éditeurs de confiance : JSON `{"éditeur": "clé publique Ed25519 PEM"}`. Vide : aucune installation possible. */
  PLUGIN_TRUSTED_KEYS: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export type AppConfig = z.infer<typeof schema>;

/** Valide l'environnement au démarrage. Échec explicite plutôt que valeurs dangereuses par défaut. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration invalide : ${detail}`);
  }
  return parsed.data;
}
