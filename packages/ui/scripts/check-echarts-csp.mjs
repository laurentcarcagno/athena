// B07 : ECharts rend en SVG sous la CSP de production (aucune violation, aucun style en ligne).
import { build } from 'vite';
import http from 'node:http';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const csp = /Content-Security-Policy "([^"]+)"/.exec(readFileSync(path.join(dir, '../../../deploy/docker/headers.inc'), 'utf8'))[1];
const out = mkdtempSync(path.join(tmpdir(), 'echarts-csp-'));
await build({ root: dir, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' }, build: { outDir: out, emptyOutDir: true, minify: true, lib: { entry: path.join(dir, 'echarts-csp-page.mjs'), formats: ['iife'], name: 'p', fileName: () => 'app.js' } } });
const js = readFileSync(path.join(out, 'app.js'));
const html = '<!doctype html><meta charset="utf-8"><title>t</title><div id="c" role="img"></div><script src="/app.js"></script>';
const srv = http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', csp);
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(js); } else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const { chromium } = createRequire(path.join(dir, '../../../e2e/package.json'))('@playwright/test');
const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => { if (/content security policy|refused/i.test(m.text())) problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(String(e)));
await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => (window.__v = (window.__v || []).concat(`${e.violatedDirective} ${e.blockedURI}`))); });
await page.goto(`http://127.0.0.1:${srv.address().port}/`);
await page.waitForFunction(() => window.__ready, null, { timeout: 5000 }).catch(() => { console.log(JSON.stringify(problems)); });
await page.mouse.move(120, 150); await page.mouse.move(150, 160); await page.waitForTimeout(400);
const r = await page.evaluate(() => ({
  svg: !!document.querySelector('#c svg'), canvas: !!document.querySelector('#c canvas'),
  paths: document.querySelectorAll('#c svg path, #c svg rect').length,
  label: document.getElementById('c').getAttribute('aria-label') || '',
  styleAttrs: document.querySelectorAll('#c [style]').length, styled: [...new Set([...document.querySelectorAll('[style]')].map((e) => e.tagName + ' ' + (e.getAttribute('style') || '').slice(0, 70)))].slice(0, 8),
  violations: window.__v || [], pos: getComputedStyle(document.querySelector('#c svg')).position, ctn: getComputedStyle(document.getElementById('c')).width,
}));
await browser.close(); srv.close(); rmSync(out, { recursive: true, force: true });
console.log(JSON.stringify({ csp, ...r, problems }, null, 1));
process.exit(r.svg && !r.canvas && r.paths > 0 && r.violations.length === 0 && problems.length === 0 ? 0 : 1);
