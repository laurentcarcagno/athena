import { describe, expect, it } from 'vitest';
import { fromEnv, probe } from '../testing/harness';
import { OpenBao } from '../secrets/openbao';
import { resolveSessionSecret, SESSION_SECRET_PATH } from './secret';

const ADDRESS = fromEnv('OPENBAO_TEST_ADDR') ?? 'http://127.0.0.1:8200';
const ROOT = fromEnv('BAO_DEV_ROOT_TOKEN');
const up = !!ROOT && probe("fetch(process.env.U+'/v1/sys/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))", { U: ADDRESS });

describe('secret de session', () => {
  it('privilégie la variable d’environnement et reste indéfini sans coffre', async () => {
    expect(await resolveSessionSecret('depuis-env', null)).toBe('depuis-env');
    expect(await resolveSessionSecret(undefined, null)).toBeUndefined();
  });

  it.runIf(up)('génère le secret une seule fois dans OpenBao, même si plusieurs instances démarrent ensemble', async () => {
    const bao = new OpenBao(ADDRESS, ROOT!);
    await fetch(`${ADDRESS}/v1/secret/metadata/${SESSION_SECRET_PATH}`, { method: 'DELETE', headers: { 'X-Vault-Token': ROOT! } }); // départ propre
    const results = await Promise.all(Array.from({ length: 8 }, () => resolveSessionSecret(undefined, bao)));
    expect(new Set(results).size).toBe(1); // toutes les instances ont la même valeur
    expect(results[0]!.length).toBeGreaterThanOrEqual(48);
    expect(await resolveSessionSecret(undefined, bao)).toBe(results[0]); // stable aux redémarrages
    expect(await bao.kvPutIfAbsent(SESSION_SECRET_PATH, { secret: 'autre' })).toBe(false); // jamais écrasé
  });
});
