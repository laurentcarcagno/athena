// Mesure le poids compressé du bundle ECharts à la carte (critère B08 : < 200 Ko gzip).
import { build } from 'vite';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const res = await build({
  root: dir, logLevel: 'silent',
  build: { write: false, minify: true, lib: { entry: path.join(dir, 'echarts-entry.mjs'), formats: ['es'], fileName: 'e' } },
});
const code = (Array.isArray(res) ? res[0] : res).output[0].code;
const raw = Buffer.byteLength(code);
const gz = gzipSync(code).length, br = brotliCompressSync(code).length;
const ko = (n) => (n / 1024).toFixed(1) + ' Ko';
console.log(`brut ${ko(raw)} · gzip ${ko(gz)} · brotli ${ko(br)}`);
process.exit(gz < 200 * 1024 ? 0 : 1);
