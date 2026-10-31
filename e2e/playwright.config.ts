import { readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const devEnv = readFileSync('../deploy/dev/.env', 'utf8');
const fromDev = (name: string): string => new RegExp(`^${name}=(.+)$`, 'm').exec(devEnv)![1]!.trim();

const ISSUER = 'http://localhost:8080/realms/athena';
const API = {
  PORT: '3001', HOST: '127.0.0.1',
  DATABASE_URL: 'postgres://e2e_app:e2e-only@127.0.0.1:5432/athena_e2e',
  KEYCLOAK_ISSUER: ISSUER,
  KEYCLOAK_WEB_CLIENT_SECRET: 'dev-only-athena-web-secret',
  SESSION_SECRET: 'e2e-only-session-secret-0123456789abcdef',
  COOKIE_SECURE: 'false', PUBLIC_URL: 'http://localhost:3001', WEB_ORIGIN: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  S3_ENDPOINT: 'http://127.0.0.1:9000', S3_ACCESS_KEY: fromDev('MINIO_ROOT_USER'), S3_SECRET_KEY: fromDev('MINIO_ROOT_PASSWORD'), S3_BUCKET: 'athena-e2e',
};

/** Parcours réels : navigateur Chromium, Keycloak de développement, API et web démarrés pour le test. */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', locale: 'fr-FR' },
  webServer: [
    { command: 'node ../apps/api/dist/main.js', url: 'http://127.0.0.1:3001/healthz', env: API, reuseExistingServer: false, timeout: 60_000 },
    { command: 'pnpm --filter @athena/web exec vite --port 3000 --strictPort', url: 'http://localhost:3000', reuseExistingServer: false, timeout: 60_000 },
  ],
});
