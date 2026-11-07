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
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(3).optional(),
  S3_SECRET_KEY: z.string().min(8).optional(),
  S3_BUCKET: z.string().min(3).default('athena-attachments'),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  PLUGIN_TRUSTED_KEYS: z.string().optional(),
  RATE_LIMIT_API_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).default(600),
  RATE_LIMIT_SENSITIVE_PER_MINUTE: z.coerce.number().int().min(5).max(10_000).default(60),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  /** Niveau de protection de l'instance (ex. « Diffusion Restreinte ») : bandeau sur chaque page et mention sur les exports. Vide : aucun. */
  ATHENA_PROTECTION_LEVEL: z.string().trim().max(80).default(''),
  /** Résumé quotidien par courriel : SMTP interne. Sans `SMTP_HOST` (ou avec `DIGEST_ENABLED=false`), aucun courriel ne part et aucune connexion n'est ouverte. */
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(25),
  SMTP_SECURITY: z.enum(['none', 'starttls', 'tls']).default('starttls'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().trim().optional(),
  SMTP_CA_FILE: z.string().optional(),
  DIGEST_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
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
