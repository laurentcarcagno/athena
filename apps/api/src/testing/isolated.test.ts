import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(__dirname, '../../../..');
const load = async (name: string) => (await import(pathToFileURL(join(root, 'tools', name)).href)) as Record<string, any>;
const tmp = mkdtempSync(join(tmpdir(), 'athena-iso-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('contrôle des URL externes (réseau isolé)', () => {
  it('le code livré ne contient aucune URL externe', async () => {
    const { scan } = await load('check-external-urls.mjs');
    expect(scan({})).toEqual([]);
  });

  it('détecte une URL externe, accepte les hôtes locaux, internes et les espaces de noms', async () => {
    const { externalUrls } = await load('check-external-urls.mjs');
    const css = '@import url("https://fonts.googleapis.com/css2?family=Plex"); a{background:url(http://cdn.example-cdn.io/x.png)}';
    expect(externalUrls(css)).toEqual(['https://fonts.googleapis.com/css2?family=Plex', 'http://cdn.example-cdn.io/x.png']);
    expect(externalUrls('http://localhost:3001/v1 https://keycloak.interne.lan/realms/x http://www.w3.org/2000/svg https://athena.exemple.lan http://127.0.0.1:8200')).toEqual([]);
    expect(externalUrls('http://athena-api.{{ .Release.Namespace }}.svc')).toEqual([]);
  });

  it('échoue (code 1) sur un fichier d’interface qui référence un hôte public', async () => {
    const { scan } = await load('check-external-urls.mjs');
    const fake = join(tmp, 'repo');
    mkdirSync(join(fake, 'apps/web/src'), { recursive: true });
    writeFileSync(join(fake, 'apps/web/src/Banner.tsx'), 'export const logo = "https://cdn.public-site.net/logo.svg";');
    writeFileSync(join(fake, 'apps/web/src/Banner.test.tsx'), 'const x = "https://ignored.example.net";'); // les tests sont ignorés
    expect(scan({ root: fake })).toEqual([{ file: 'apps/web/src/Banner.tsx', url: 'https://cdn.public-site.net/logo.svg' }]);
  });
});

describe('lot transférable', () => {
  it('écrit manifest et sommes, puis détecte une altération ou un fichier manquant', async () => {
    const lib = await load('bundle-lib.mjs');
    const dir = join(tmp, 'bundle');
    mkdirSync(join(dir, 'images'), { recursive: true });
    mkdirSync(join(dir, 'chart'));
    const refs = ['athena-api:0.1.0', 'quay.io/keycloak/keycloak:26.0'];
    const images = refs.map((ref) => ({ ref, file: `images/${lib.imageFile(ref)}` }));
    images.forEach((i, n) => writeFileSync(join(dir, i.file), `image ${n}`));
    writeFileSync(join(dir, 'chart/athena-0.1.0.tgz'), 'chart');
    writeFileSync(join(dir, 'values-isolated.yaml'), 'isolated: { enabled: true }');
    const manifest = await lib.writeManifest(dir, { version: '0.1.0', images, chart: 'chart/athena-0.1.0.tgz', extra: ['values-isolated.yaml'] });
    expect(manifest.images.map((i: { file: string }) => i.file)).toEqual(['images/athena-api_0.1.0.tar', 'images/quay.io_keycloak_keycloak_26.0.tar']);
    expect(manifest.images[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await lib.verifyBundle(dir)).toEqual([]);
    const parsed = lib.parseSums(readFileSync(join(dir, 'SHA256SUMS'), 'utf8'));
    expect(parsed.map((p: { path: string }) => p.path)).toEqual(expect.arrayContaining(['manifest.json', 'chart/athena-0.1.0.tgz', 'values-isolated.yaml']));
    writeFileSync(join(dir, images[1]!.file), 'altéré');
    rmSync(join(dir, 'values-isolated.yaml'));
    expect(await lib.verifyBundle(dir)).toEqual([`${images[1]!.file} : somme différente`, 'values-isolated.yaml : fichier absent']);
    const cli = spawnSync(process.execPath, [join(root, 'tools/export-bundle.mjs'), '--verify', dir], { encoding: 'utf8' });
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('somme différente');
  });

  it('le script de chargement vérifie les sommes avant de charger et pousse vers le registre interne', async () => {
    const lib = await load('bundle-lib.mjs');
    const script: string = lib.loadScript([{ ref: 'athena-api:0.1.0' }, { ref: 'postgres:16' }]);
    expect(script.indexOf('sha256sum -c SHA256SUMS')).toBeLessThan(script.indexOf('load_and_push "athena-api_0.1.0.tar"'));
    expect(script).toContain('"$ENGINE" push "$target"');
    expect(script).toContain('REGISTRY:?');
    expect(lib.parseSums).toBeTypeOf('function');
    expect(() => lib.parseSums('pas une somme\n')).toThrow(/invalide/);
  });

  it('--dry-run liste les images (Athena, PostgreSQL, Keycloak, OpenBao) et le chart sans rien écrire', () => {
    const out = spawnSync(process.execPath, [join(root, 'tools/export-bundle.mjs'), '--dry-run', '--version', '9.9.9'], { encoding: 'utf8' }).stdout;
    for (const ref of ['athena-api:9.9.9', 'athena-web:9.9.9', 'postgres:16', 'keycloak', 'openbao']) expect(out).toContain(ref);
    expect(out).toContain('chart/athena-9.9.9.tgz');
  });
});

describe('chart Helm en réseau isolé', () => {
  const policy = readFileSync(join(root, 'deploy/helm/athena/templates/networkpolicy.yaml'), 'utf8');
  const isolated = policy.slice(policy.indexOf('{{- if .Values.isolated.enabled }}'), policy.indexOf('{{- else }}'));
  const values = readFileSync(join(root, 'deploy/helm/athena/values-isolated.yaml'), 'utf8');

  it('refuse tout par défaut et n’ouvre aucune sortie HTTPS générique : chaque port 443 est limité à un bloc d’adresses interne', () => {
    expect(policy).toContain('name: athena-default-deny');
    const lines = isolated.split('\n');
    lines.forEach((l, i) => { if (/port: 443/.test(l)) expect(lines.slice(Math.max(0, i - 2), i + 1).join('\n'), `ligne ${i}`).toContain('ipBlock'); });
    expect(isolated).toContain('athena-keycloak-allow');
    expect(isolated).toContain('athena-openbao-allow');
    expect(isolated).toMatch(/athena-openbao-allow[\s\S]*egress: \[\]/); // OpenBao ne sort nulle part
  });

  it('les valeurs isolées pointent vers un registre interne, activent Keycloak et OpenBao locaux et les politiques réseau', () => {
    expect(values).toContain('registre.interne.lan');
    expect(values).toMatch(/isolated:\s*\n\s+enabled: true/);
    expect(values).toMatch(/networkPolicy:\s*\n\s+enabled: true/);
    expect(readFileSync(join(root, 'deploy/helm/athena/templates/isolated.yaml'), 'utf8')).toContain('kind: StatefulSet');
  });

  it('le DNS du cluster isolé ne relaie rien vers l’extérieur (aucun forward) mais garde la résolution du cluster', () => {
    const corefile = readFileSync(join(root, 'deploy/helm/athena/coredns-isolated.yaml'), 'utf8');
    expect(corefile).not.toMatch(/^\s*forward\s/m);
    expect(corefile).toContain('kubernetes cluster.local');
  });
});
