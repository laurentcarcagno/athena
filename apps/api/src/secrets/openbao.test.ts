import { beforeAll, describe, expect, it } from 'vitest';
import { fromEnv, probe } from '../testing/harness';
import { ConfidentialFields } from './confidential';
import { OpenBao, OpenBaoError, orgKeyName } from './openbao';

const ADDRESS = fromEnv('OPENBAO_TEST_ADDR') ?? 'http://127.0.0.1:8200';
const ROOT = fromEnv('BAO_DEV_ROOT_TOKEN');
const up = !!ROOT && probe("fetch(process.env.U+'/v1/sys/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))", { U: ADDRESS });
const suite = up ? describe : describe.skip;

suite('OpenBao (intégration)', () => {
  let root: OpenBao;
  let app: OpenBao; // jeton limité à la politique athena-api
  const org = `t${Date.now().toString(36)}`;

  beforeAll(async () => {
    root = new OpenBao(ADDRESS, ROOT!);
    const response = await fetch(`${ADDRESS}/v1/auth/token/create`, {
      method: 'POST',
      headers: { 'X-Vault-Token': ROOT!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ policies: ['athena-api'], ttl: '1h', no_parent: true }),
    });
    const token = ((await response.json()) as { auth: { client_token: string } }).auth.client_token;
    app = new OpenBao(ADDRESS, token);
  });

  it('stocke et relit un secret sous athena/', async () => {
    await app.kvPut(`athena/test/${org}/webhook`, { key: 'secret-de-test' });
    expect(await app.kvGet(`athena/test/${org}/webhook`)).toEqual({ key: 'secret-de-test' });
    expect(await app.kvGet(`athena/test/${org}/absent`)).toBeNull();
  });

  it('applique le moindre privilège : rien hors de athena/', async () => {
    await root.kvPut(`autre/${org}`, { x: '1' });
    await expect(app.kvGet(`autre/${org}`)).rejects.toBeInstanceOf(OpenBaoError);
    await expect(app.kvGet(`autre/${org}`)).rejects.toMatchObject({ status: 403 });
  });

  it('chiffre et déchiffre via Transit, le contexte étant lié', async () => {
    const key = orgKeyName(org);
    const ciphertext = await app.encrypt(key, 'donnée sensible', 'champ-a');
    expect(ciphertext).toMatch(/^vault:v1:/);
    expect(ciphertext).not.toContain('sensible');
    expect(await app.decrypt(key, ciphertext, 'champ-a')).toBe('donnée sensible');
    await expect(app.decrypt(key, ciphertext, 'champ-b')).rejects.toBeInstanceOf(OpenBaoError);
  });

  it('rechiffre après rotation de la clé sans exposer le clair', async () => {
    const key = orgKeyName(org);
    const ciphertext = await app.encrypt(key, 'valeur', 'ctx');
    await fetch(`${ADDRESS}/v1/transit/keys/${key}/rotate`, { method: 'POST', headers: { 'X-Vault-Token': ROOT! } });
    const rewrapped = await app.rewrap(key, ciphertext, 'ctx');
    expect(rewrapped).toMatch(/^vault:v2:/);
    expect(await app.decrypt(key, rewrapped, 'ctx')).toBe('valeur');
  });

  it('protège uniquement les champs confidentiels et les restitue', async () => {
    const fields = new ConfidentialFields(app);
    const values = { title: 'Public', secret_note: 'Mot de passe du coffre', count: 3 };
    const protectedValues = await fields.protect(org, values, ['secret_note']);
    expect(protectedValues['title']).toBe('Public');
    expect(String(protectedValues['secret_note'])).toMatch(/^bao:v1:vault:v/);
    expect(JSON.stringify(protectedValues)).not.toContain('coffre');
    expect(await fields.reveal(org, protectedValues)).toEqual(values);
    expect(await fields.protect(org, values, [])).toBe(values);
  });
});
