import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';


describe('variables vides', () => {
  it('une variable vide vaut « non définie » : une valeur optionnelle vide n’empêche plus le démarrage', () => {
    const base = { DATABASE_URL: 'postgres://x', KEYCLOAK_ISSUER: 'http://kc/realms/a' };
    const config = loadConfig({ ...base, METRICS_TOKEN: '', OPENBAO_ADDR: '', OPENBAO_TOKEN: '', OPENBAO_ROLE_ID: '', GITLAB_URL: '', S3_ENDPOINT: '', RATE_LIMIT_STORE: 'postgres' } as never);
    expect(config.METRICS_TOKEN).toBeUndefined();
    expect(config.OPENBAO_ADDR).toBeUndefined();
    expect(config.RATE_LIMIT_STORE).toBe('postgres');
  });
});
