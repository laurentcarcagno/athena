// Scénarios de charge k6 (plan § 11 : liste, création, recherche, rafale de webhooks ; seuils bloquants en CI nocturne).
//   k6 run -e BASE_URL=https://recette.exemple.lan -e TOKEN=athp_... -e PROJECT=ARI -e TRACKER=BUG -e HOOK_PATH=/hooks/in/source/<org>/<projet>/<nom> -e HOOK_SECRET=... tools/k6/athena.js
// Le jeton est un jeton d'accès personnel en écriture, créé pour l'occasion (profil, « Jetons d'accès personnels »).
import http from 'k6/http';
import crypto from 'k6/crypto';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3001';
const PROJECT = __ENV.PROJECT || 'ARI';
const TRACKER = __ENV.TRACKER || 'BUG';
const headers = { Authorization: `Bearer ${__ENV.TOKEN}`, 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    lecture_liste: { executor: 'constant-vus', vus: 40, duration: '2m', exec: 'liste' },
    recherche: { executor: 'constant-vus', vus: 20, duration: '2m', exec: 'recherche' },
    creation: { executor: 'constant-arrival-rate', rate: 10, timeUnit: '1s', duration: '2m', preAllocatedVUs: 20, exec: 'creation' },
    rafale_webhooks: { executor: 'ramping-arrival-rate', startRate: 5, timeUnit: '1s', stages: [{ target: 150, duration: '1m' }, { target: 150, duration: '1m' }], preAllocatedVUs: 100, exec: 'webhook', startTime: '30s' },
  },
  // Seuils du plan : liste de 10 000 tickets < 1 s, création p95 < 300 ms, recherche p95 < 500 ms, aucune perte de webhook.
  thresholds: {
    'http_req_duration{scenario:lecture_liste}': ['p(95)<1000'],
    'http_req_duration{scenario:recherche}': ['p(95)<500'],
    'http_req_duration{scenario:creation}': ['p(95)<300'],
    'http_req_failed{scenario:rafale_webhooks}': ['rate<0.001'],
    http_req_failed: ['rate<0.01'],
  },
};

export function liste() {
  const r = http.get(`${BASE}/v1/projects/${PROJECT}/search?q=${encodeURIComponent(`tracker = ${TRACKER} ORDER BY created DESC`)}&limit=50`, { headers });
  check(r, { 'liste 200': (x) => x.status === 200 });
  sleep(0.2);
}

export function recherche() {
  const q = encodeURIComponent(`project = ${PROJECT} AND status = Open ORDER BY created DESC`);
  const r = http.get(`${BASE}/v1/search?q=${q}&project=${PROJECT}&limit=50`, { headers });
  check(r, { 'recherche 200': (x) => x.status === 200 });
  sleep(0.2);
}

export function creation() {
  const r = http.post(`${BASE}/v1/projects/${PROJECT}/trackers/${TRACKER}/artifacts`, JSON.stringify({ values: { title: `Charge k6 ${__VU}-${__ITER}` } }), { headers });
  check(r, { 'création 201': (x) => x.status === 201 });
}

export function webhook() {
  if (!__ENV.HOOK_PATH) return; // chemin renvoyé à la création de la source entrante (écran Webhooks entrants)
  const body = JSON.stringify({ event: 'k6', n: `${__VU}-${__ITER}` });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.hmac('sha256', __ENV.HOOK_SECRET || '', `${t}.${body}`, 'hex');
  const r = http.post(`${BASE}${__ENV.HOOK_PATH}`, body, { headers: { 'Content-Type': 'application/json', 'Athena-Signature': `t=${t},v1=${sig}`, 'Idempotency-Key': `k6-${__VU}-${__ITER}-${t}` } });
  check(r, { 'webhook accepté': (x) => x.status < 300 });
}
