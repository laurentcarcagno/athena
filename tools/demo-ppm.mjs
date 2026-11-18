// Démonstration de la gestion de portefeuille (PPM) : peuple LUMEN, SAT1, NOVA, ARI et un portefeuille « Défense » (4 projets sous gabarit
// armement + un projet de pilotage), pour que chaque page et chaque widget affichent des données, pour chaque rôle.
// Prérequis : `node tools/dev-start.mjs` en marche (API 3001, Keycloak 8080). Passe par l'API : droits et validations réels.
// Usage : node tools/demo-ppm.mjs        (idempotent : chaque étape tolère un état déjà amorcé)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'http://127.0.0.1:3001';
const KC = 'http://localhost:8080';
void readFileSync(join(root, 'deploy/dev/.env'), 'utf8'); // échoue tôt si l'environnement de développement manque

const USERS = {
  admin: ['admin.dev', 'dev-only-admin'], pm: ['pm.dev', 'dev-only-pm'], user: ['user.dev', 'dev-only-user'], qa: ['qa.dev', 'dev-only-qa'],
  manager: ['manager.dev', 'dev-only-manager'], pmo: ['pmo.dev', 'dev-only-pmo'], director: ['director.dev', 'dev-only-director'],
};
const tokens = {}; const subs = {};
async function login(key) {
  const [username, password] = USERS[key];
  const form = new URLSearchParams({ grant_type: 'password', client_id: 'athena-dev-cli', username, password });
  const r = await (await fetch(`${KC}/realms/athena/protocol/openid-connect/token`, { method: 'POST', body: form })).json();
  if (!r.access_token) throw new Error(`connexion impossible pour ${username} : ${r.error_description ?? r.error}`);
  tokens[key] = r.access_token;
  subs[key] = JSON.parse(Buffer.from(r.access_token.split('.')[1], 'base64url').toString()).sub;
}

const issues = [];
async function call(as, method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${tokens[as]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok && res.status !== 409) issues.push(`${method} ${path} → ${res.status} ${typeof data === 'object' ? (data?.details?.[0] ?? data?.message ?? '') : ''}`);
  return { ok: res.ok, status: res.status, data };
}
/** Tickets d'un projet (recherche ATQL), triés par clé. */
const hitsOf = async (project, q) => (((await get(A, `/v1/projects/${project}/search?q=${encodeURIComponent(q)}&limit=100&offset=0`)) ?? {}).hits ?? []).sort((a, b) => a.key.localeCompare(b.key));
const get = async (as, path) => (await call(as, 'GET', path)).data;

const today = new Date();
const day = (offset) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset)).toISOString().slice(0, 10);
const month = (offset) => { const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1)); return d.toISOString().slice(0, 7); };
const section = (name) => console.log(`— ${name}`);

for (const k of Object.keys(USERS)) await login(k);
const A = 'admin';

// ------------------------------------------------------------------ interrupteurs et réglages
section('fonctions PPM et réglages');
for (const f of ['ppm.portfolios', 'ppm.roadmap', 'ppm.capacity', 'ppm.finance', 'ppm.demand']) await call(A, 'PUT', `/v1/admin/features/${f}`, { enabled: true });
await call(A, 'PUT', '/v1/admin/ppm-settings', { snapshotFrequency: 'weekly', overloadPercent: 100, statusNoteStaleDays: 14 });

// ------------------------------------------------------------------ projets de défense
section('projets de défense');
const DEFENSE = [
  ['RADC', 'Radar de surveillance côtière', 'A', 'Détection et pistage des cibles de surface sur 200 km'],
  ['DRNT', 'Drone tactique', 'B', 'Drone de reconnaissance embarqué sur plateforme terrestre'],
  ['CYBD', 'Cyberdéfense des réseaux', 'B', 'Supervision et durcissement des réseaux opérationnels'],
  ['COMS', 'Communications tactiques sécurisées', 'C', 'Liaisons chiffrées entre postes de commandement'],
];
const existing = new Set(((await get(A, '/v1/projects')) ?? []).map((p) => p.key));
for (const [key, name, criticality] of DEFENSE) if (!existing.has(key)) await call(A, 'POST', '/v1/projects', { key, name, template: 'armement-1618', criticality });
if (!existing.has('DEFP')) await call(A, 'POST', '/v1/projects', { key: 'DEFP', name: 'Pilotage du portefeuille Défense' });

// Trackers : « Tâches » (TSK) des projets de défense, et une demande au pilotage (type « request »).
const hasTracker = async (p, k) => ((await get(A, `/v1/projects/${p}/trackers`)) ?? []).some((t) => t.key === k);
if (!(await hasTracker('DEFP', 'REQ'))) {
  await call(A, 'POST', '/v1/projects/DEFP/trackers', {
    key: 'REQ', name: 'Demandes', typeKey: 'request',
    fields: [{ key: 'title', label: 'Titre', type: 'text', required: true }, { key: 'description', label: 'Description', type: 'richtext' }],
    statuses: [{ key: 'new', name: 'Nouvelle', category: 'todo', initial: true }, { key: 'review', name: 'Instruction', category: 'in_progress' }, { key: 'done', name: 'Traitée', category: 'done' }],
    transitions: [{ name: 'Instruire', from: 'new', to: 'review' }, { name: 'Traiter', from: 'review', to: 'done' }],
  });
}

// ------------------------------------------------------------------ tickets planifiés des projets de défense
section('tickets planifiés');
const PLAN = {
  RADC: [
    ['Spécification de l’antenne', -60, -30, 100, 'done'], ['Maquette du récepteur', -40, -5, 100, 'done'], ['Banc de mesure en chambre anéchoïque', -20, 10, 70, 'doing'],
    ['Traitement du signal : pistage', -10, 25, 40, 'doing'], ['Intégration mât et radôme', 5, 50, 0, 'todo'], ['Essais en mer', 55, 95, 0, 'todo'],
  ],
  DRNT: [
    ['Cellule et motorisation', -50, -15, 100, 'done'], ['Liaison de données', -25, 5, 80, 'doing'], ['Charge utile optronique', -15, 20, 35, 'doing'],
    ['Logiciel de mission', 0, 40, 10, 'doing'], ['Qualification environnementale', 30, 70, 0, 'todo'],
  ],
  CYBD: [
    ['Cartographie des réseaux', -45, -10, 100, 'done'], ['Sondes de détection', -20, -2, 60, 'doing'], ['Durcissement des postes', -5, 30, 20, 'doing'],
    ['Exercice de crise', 35, 45, 0, 'todo'],
  ],
  COMS: [
    ['Architecture de chiffrement', -30, -8, 100, 'done'], ['Prototype de passerelle', -10, 15, 50, 'doing'], ['Homologation', 20, 60, 0, 'todo'],
  ],
};
const lookup = {}; // projet → titres → clé de ticket
for (const [project, tasks] of Object.entries(PLAN)) {
  lookup[project] = {};
  const known = new Map((await hitsOf(project, 'tracker = TSK')).map((t) => [t.title, t]));
  const people = [subs.user, subs.pm, subs.qa, subs.manager];
  for (const [i, [title, start, due, progress, status]] of tasks.entries()) {
    let t = known.get(title);
    if (!t) {
      const made = await call(A, 'POST', `/v1/projects/${project}/trackers/TSK/artifacts`, { values: { title, start: day(start), due: day(due), progress, assignee: people[i % people.length], remaining: Math.round((100 - progress) / 10) } });
      t = made.data;
      if (t?.key && status !== 'todo') {
        const first = await call(A, 'POST', `/v1/projects/${project}/artifacts/${t.key}/transitions`, { name: 'Démarrer', version: t.version });
        if (status === 'done' && first.ok) await call(A, 'POST', `/v1/projects/${project}/artifacts/${t.key}/transitions`, { name: 'Terminer', version: first.data.version ?? t.version + 1 });
      }
    }
    if (t?.key) lookup[project][title] = t.key;
  }
}
const key = (p, i) => Object.values(lookup[p] ?? {})[i];

// ------------------------------------------------------------------ métadonnées, cycle de vie, phases, notes de météo
section('métadonnées, cycle de vie, phases, météo');
const PROJECTS = ['LUMEN', 'SAT1', 'NOVA', 'RADC', 'DRNT', 'CYBD', 'COMS'];
const sponsors = [subs.director, subs.pmo];
for (const [i, p] of PROJECTS.entries()) {
  await call(A, 'PATCH', `/v1/projects/${p}/meta`, { plannedStart: day(-120 + i * 5), plannedEnd: day(150 + i * 30), sponsorSubject: sponsors[i % 2], description: `Projet de démonstration ${p}.`, capacityGranularity: i % 2 ? 'month' : 'week' });
}
// États variés du cycle de vie : le reste est déjà « en cours ».
const states = { SAT1: 'on_hold', NOVA: 'closing', COMS: 'awaiting_decision' };
for (const [p, to] of Object.entries(states)) await call('pmo', 'POST', `/v1/projects/${p}/lifecycle/transition`, { to, reason: 'Démonstration du cycle de vie' });
const PHASES = [['preparation', -90, -20, -18], ['realisation', -19, 120, 125], ['utilisation', 121, 300, 302], ['retrait', 301, 360, 362]];
for (const [p] of DEFENSE) {
  for (const [phase, from, to, review] of PHASES) await call(A, 'PUT', `/v1/projects/${p}/template/phases/${phase}`, { plannedStart: day(from), plannedEnd: day(to), reviewPlannedOn: day(review) });
}
// LUMEN et SAT1 sont rattachés au gabarit « Projet spatial » par dev-start : phases 0 à F datées, revue prévue à la fin de chaque phase.
const SPACE = ['phase-0', 'phase-a', 'phase-b', 'phase-c', 'phase-d', 'phase-e', 'phase-f'];
for (const [p, shift] of [['LUMEN', 0], ['SAT1', 90]]) {
  for (const [i, phase] of SPACE.entries()) {
    const from = -400 + shift + i * 110; await call(A, 'PUT', `/v1/projects/${p}/template/phases/${phase}`, { plannedStart: day(from), plannedEnd: day(from + 100), reviewPlannedOn: day(from + 105) });
  }
}
const LEVEL = { LUMEN: ['attention', 'ok', 'attention', 'ok', 'Calibrage du capteur en retard.'], SAT1: ['critical', 'attention', 'critical', 'ok', 'Projet suspendu, décision attendue.'], NOVA: ['ok', 'ok', 'attention', 'ok', 'Clôture en cours.'], RADC: ['attention', 'ok', 'critical', 'attention', 'Risque sur le pistage multi-cibles.'], DRNT: ['ok', 'attention', 'attention', 'ok', 'Charge utile en retard de deux semaines.'], CYBD: ['ok', 'ok', 'ok', 'ok', 'Conforme au plan.'], COMS: ['attention', 'ok', 'attention', 'critical', 'Dépassement budgétaire probable.'] };
for (const [p, [schedule, scope, risk, cost, comment]] of Object.entries(LEVEL)) await call(A, 'POST', `/v1/projects/${p}/status-notes`, { schedule, scope, risk, resources: 'ok', cost, comment });

// ------------------------------------------------------------------ équipes, capacité
section('équipes et capacité');
await call(A, 'POST', '/v1/teams', { key: 'systemes-armes', name: 'Équipe Systèmes d’armes', description: 'Radar, drone et communications' });
await call(A, 'POST', '/v1/teams', { key: 'cyber', name: 'Équipe Cyberdéfense', description: 'Sécurité des réseaux' });
for (const [team, who] of [['systemes-armes', [['manager', 'manager'], ['user', 'member'], ['qa', 'member'], ['pm', 'member']]], ['cyber', [['pmo', 'manager'], ['admin', 'member'], ['user', 'member']]]]) {
  for (const [u, role] of who) await call(A, 'PUT', `/v1/teams/${team}/members/${subs[u]}`, { role });
}
for (const u of ['user', 'pm', 'qa', 'manager', 'admin', 'pmo']) {
  await call(A, 'POST', '/v1/capacity/availability', { subject: subs[u], from: day(-180), to: null, ratio: u === 'pm' ? 0.8 : 1 });
}
await call(A, 'POST', '/v1/capacity/absences', { subject: subs.user, from: day(10), to: day(21), kind: 'leave' });
await call(A, 'POST', '/v1/capacity/absences', { subject: subs.qa, from: day(3), to: day(5), kind: 'training' });
const ALLOC = [
  ['RADC', { team: 'systemes-armes' }, 2.5], ['DRNT', { team: 'systemes-armes' }, 1.5], ['COMS', { team: 'systemes-armes' }, 1], ['CYBD', { team: 'cyber' }, 2],
  ['RADC', { subject: subs.user }, 0.6], ['DRNT', { subject: subs.user }, 0.7], ['LUMEN', { subject: subs.pm }, 0.5], ['CYBD', { subject: subs.admin }, 0.6],
  ['LUMEN', { team: 'plateforme' }, 1.5], ['SAT1', { team: 'segment-sol' }, 1],
];
for (const [project, who, fte] of ALLOC) await call(A, 'POST', `/v1/projects/${project}/allocations`, { project, ...(who.team ? { roleLabel: 'Ingénieur' } : {}), ...who, from: day(-30), to: day(180), fte });

// ------------------------------------------------------------------ temps passé
section('temps passé');
const workers = [['user', 'RADC', 0], ['pm', 'DRNT', 1], ['qa', 'CYBD', 1], ['manager', 'COMS', 1], ['user', 'DRNT', 2]];
for (const [who, project, idx] of workers) {
  const ticket = key(project, idx); if (!ticket) continue;
  for (let d = 1; d <= 10; d++) if (new Date(day(-d)).getUTCDay() % 6 !== 0) await call(who, 'POST', `/v1/projects/${project}/artifacts/${ticket}/worklog`, { day: day(-d), minutes: 180 + ((d * 37) % 200), comment: 'Avancement' });
}

// ------------------------------------------------------------------ finances
section('finances');
const CATS = [['main-oeuvre', 'Main-d’œuvre', 'internal'], ['sous-traitance', 'Sous-traitance', 'external'], ['licences', 'Licences', 'license'], ['materiel', 'Matériel', 'hardware'], ['prestations', 'Prestations', 'service']];
for (const [k, name, kind] of CATS) await call(A, 'PUT', '/v1/finance/categories', { key: k, name, kind });
const FIN = { LUMEN: 600, SAT1: 900, NOVA: 300, RADC: 2400, DRNT: 1500, CYBD: 800, COMS: 700 }; // budget initial en k€
for (const [p, k] of Object.entries(FIN)) {
  const shares = { 'main-oeuvre': 0.4, 'sous-traitance': 0.25, materiel: 0.2, licences: 0.05, prestations: 0.1 };
  for (const [c, s] of Object.entries(shares)) {
    await call(A, 'POST', '/v1/finance/budget', { project: p, category: c, kind: 'initial', amount: Math.round(k * s * 1000) });
    await call(A, 'POST', '/v1/finance/commitments', { project: p, category: c, amount: Math.round(k * s * 700), reference: `CMD-${p}-${c}`, committedOn: day(-100) });
    const overrun = p === 'COMS' ? 1.35 : p === 'RADC' ? 1.1 : 0.85;
    for (let m = -5; m <= 0; m++) await call(A, 'POST', '/v1/finance/actuals', { project: p, category: c, period: month(m), amount: Math.round((k * s * 1000 * overrun) / 8) });
    for (let m = 1; m <= 6; m++) await call(A, 'PUT', '/v1/finance/forecasts', { project: p, category: c, period: month(m), amount: Math.round((k * s * 1000 * overrun) / 9) });
  }
}
await call(A, 'POST', '/v1/finance/budget', { project: 'RADC', category: 'materiel', kind: 'amendment', amount: 150000, reason: 'Antenne de rechange' });
await call(A, 'POST', '/v1/finance/budget', { project: 'COMS', category: 'sous-traitance', kind: 'arbitration', amount: -80000, reason: 'Arbitrage de portefeuille' });
for (const [roleLabel, rate] of [['Ingénieur', 85], ['Chef de projet', 105], ['Qualité', 75]]) await call(A, 'POST', '/v1/finance/rates', { roleLabel, hourlyRate: rate, validFrom: day(-365) });
for (const u of ['user', 'pm', 'qa', 'manager']) await call(A, 'POST', '/v1/finance/rates', { subject: subs[u], hourlyRate: 90, validFrom: day(-365) });

// ------------------------------------------------------------------ dépendances entre projets
section('dépendances entre projets');
for (const [a, ai, b, bi, lag] of [['RADC', 2, 'COMS', 1, 0], ['DRNT', 1, 'COMS', 1, 3], ['CYBD', 1, 'RADC', 3, 5], ['LUMEN', 1, 'SAT1', 0, 0]]) {
  const from = key(a, ai) ?? (await findTicket(a, ai)); const to = key(b, bi) ?? (await findTicket(b, bi));
  if (from && to) await call('pmo', 'POST', '/v1/dependencies', { from, to, lagDays: lag });
}
async function findTicket(project, index) {
  return (await hitsOf(project, ''))[index]?.key;
}

// ------------------------------------------------------------------ portefeuilles, objectifs
section('portefeuilles et objectifs');
await call('pmo', 'POST', '/v1/portfolios', { key: 'defense', name: 'Défense', description: 'Programmes d’armement et de cyberdéfense', owner: subs.director });
for (const [p, patch] of [['RADC', {}], ['DRNT', { health: 'attention', note: 'Charge utile en retard, arbitrage attendu.' }], ['CYBD', {}], ['COMS', { health: 'critical', note: 'Dépassement budgétaire probable.' }], ['DEFP', { kind: 'pilot', purpose: 'Instruction des demandes et gouvernance du portefeuille' }]]) {
  await call('pmo', 'PUT', `/v1/portfolios/defense/projects/${p}`, patch);
}
for (const [k, name, projects] of [['souverainete', 'Souveraineté technologique', { RADC: 3, DRNT: 2, COMS: 2, LUMEN: 1 }], ['resilience', 'Résilience cyber', { CYBD: 3, COMS: 2 }], ['observation', 'Observation et renseignement', { LUMEN: 3, SAT1: 3, RADC: 1, DRNT: 2 }]]) {
  await call('pmo', 'POST', '/v1/objectives', { key: k, name });
  for (const [p, weight] of Object.entries(projects)) await call('pmo', 'POST', `/v1/objectives/${k}/projects`, { project: p, weight });
}

// ------------------------------------------------------------------ demandes et scoring (portefeuille Défense)
section('demandes et scoring');
await call('pmo', 'POST', '/v1/portfolios/defense/scoring-model', { criteria: [
  { key: 'valeur', label: 'Valeur opérationnelle', weight: 40, scaleMin: 1, scaleMax: 5, direction: 'higher' },
  { key: 'urgence', label: 'Urgence', weight: 25, scaleMin: 1, scaleMax: 5, direction: 'higher' },
  { key: 'cout', label: 'Coût estimé', weight: 20, scaleMin: 1, scaleMax: 5, direction: 'lower' },
  { key: 'risque', label: 'Risque technique', weight: 15, scaleMin: 1, scaleMax: 5, direction: 'lower' },
] });
const reqItems = await hitsOf('DEFP', 'tracker = REQ');
const wanted = [['Station de brouillage mobile', [5, 4, 4, 4]], ['Terminal de liaison satellite', [4, 3, 3, 2]], ['Simulateur d’entraînement radar', [3, 2, 2, 1]], ['Banc de test cyber', [4, 5, 2, 2]]];
const reqKeys = [];
for (const [title, vals] of wanted) {
  let t = reqItems.find((r) => r.title === title);
  if (!t) t = (await call(A, 'POST', '/v1/projects/DEFP/trackers/REQ/artifacts', { values: { title, description: 'Demande instruite par le PMO.' } })).data;
  if (t?.key) { reqKeys.push(t.key); for (const [i, c] of ['valeur', 'urgence', 'cout', 'risque'].entries()) await call('pmo', 'POST', '/v1/portfolios/defense/scores', { ticket: t.key, criterion: c, value: vals[i] }); }
}
if (reqKeys[0]) await call('pmo', 'POST', `/v1/requests/${reqKeys[0]}/convert`, { project: 'BRLG', name: 'Station de brouillage mobile', template: 'armement-1618', criticality: 'B' });
if (reqKeys[2]) await call('pmo', 'POST', `/v1/requests/${reqKeys[2]}/refuse`, { reason: 'Hors périmètre du budget de l’année.' });

// ------------------------------------------------------------------ revues, décisions, instantanés, scénarios
section('revues, décisions, instantanés, scénarios');
for (const p of ['defense', 'spatial']) await call('pmo', 'POST', `/v1/portfolios/${p}/snapshots`, { kind: 'manual', label: 'Référence initiale' });
const review = await call('pmo', 'POST', '/v1/portfolios/defense/reviews', { heldOn: day(-7), summary: 'Revue trimestrielle du portefeuille Défense.' });
for (const p of ['defense', 'spatial']) await call('pmo', 'POST', `/v1/portfolios/${p}/snapshots`, { kind: 'review', label: 'Revue trimestrielle' });
await call('pmo', 'POST', '/v1/portfolios/defense/decisions', { project: 'COMS', kind: 'change', rationale: 'Réduire la sous-traitance pour contenir le dépassement.', owner: 'PMO', dueOn: day(14), costDelta: -50000, scheduleDeltaDays: 10, budgetCategory: 'sous-traitance', ...(review.data?.id ? { reviewId: review.data.id } : {}) });
await call('pmo', 'POST', '/v1/portfolios/defense/decisions', { project: 'DRNT', kind: 'continue', rationale: 'La charge utile reste prioritaire.', conditions: 'Point d’étape dans un mois.' });
await call('pmo', 'POST', '/v1/portfolios/spatial/decisions', { project: 'SAT1', kind: 'suspend', rationale: 'Attente de la décision de financement.' });
await call('pmo', 'POST', '/v1/portfolios/defense/scenarios', { name: 'Décaler les essais radar de deux mois', changes: [{ kind: 'shift_ticket', ticket: key('RADC', 5) ?? 'RADC-TSK-0006', shiftDays: 60 }, { kind: 'budget_delta', project: 'RADC', amount: 120000 }] });
await call('pmo', 'POST', '/v1/portfolios/defense/scenarios', { name: 'Renforcer l’équipe systèmes d’armes', changes: [{ kind: 'allocate', team: 'systemes-armes', project: 'DRNT', from: day(10), to: day(120), fte: 1.5 }] });

// ------------------------------------------------------------------ risques (matrice du portefeuille : rôles probabilité et impact)
section('risques');
const RISKS = { RADC: [['Pistage dégradé en mer forte', 4, 5], ['Retard du radôme', 3, 3], ['Brouillage des fréquences', 2, 4]], DRNT: [['Autonomie insuffisante', 3, 4], ['Perte de liaison', 2, 5]], CYBD: [['Sondes non qualifiées', 2, 3]], COMS: [['Dépassement de budget', 4, 3], ['Homologation retardée', 3, 4], ['Fournisseur unique', 5, 2]] };
for (const [p, list] of Object.entries(RISKS)) {
  if (!(await hasTracker(p, 'RSK'))) {
    await call(A, 'POST', `/v1/projects/${p}/trackers`, {
      key: 'RSK', name: 'Risques', typeKey: 'risk',
      fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }, { key: 'probability', label: 'Probabilité (1 à 5)', type: 'number', config: { min: 1, max: 5 }, semanticRole: 'probability' }, { key: 'impact', label: 'Impact (1 à 5)', type: 'number', config: { min: 1, max: 5 }, semanticRole: 'impact' }],
      statuses: [{ key: 'open', name: 'Ouvert', category: 'todo', initial: true }, { key: 'mitigated', name: 'Traité', category: 'done' }],
      transitions: [{ name: 'Traiter', from: 'open', to: 'mitigated' }],
    });
  }
  const have = new Set((await hitsOf(p, 'tracker = RSK')).map((r) => r.title));
  for (const [title, probability, impact] of list) if (!have.has(title)) await call(A, 'POST', `/v1/projects/${p}/trackers/RSK/artifacts`, { values: { title, probability, impact } });
}

// ------------------------------------------------------------------ tableaux de bord : tous les genres de widget autorisés, pour chaque rôle
section('tableaux de bord par rôle');
for (const u of Object.keys(USERS)) {
  const catalog = await get(u, '/v1/me/dashboard/catalog');
  const kinds = (catalog?.kinds ?? []).filter((k) => !k.kind.startsWith('portfolio-'));
  const widgets = kinds.slice(0, 24).map((k, i) => ({
    id: `demo-${k.kind}`, kind: k.kind, size: 'M',
    ...(k.kind === 'search' ? { query: 'category != done', title: 'Tickets ouverts' } : {}),
    ...(k.kind === 'chart' ? { query: 'category != done', field: 'status', form: 'donut', title: 'Répartition par statut' } : {}),
    ...(k.project ? { projects: ['RADC'], project: 'RADC' } : {}),
    x: (i % 2) * 6, y: Math.floor(i / 2) * 3, w: 6, h: 3,
  }));
  // L'accueil (onglet principal) reste vide : chacun l'organise lui-même. Les cartes de démonstration vont dans un onglet « Démonstration ».
  await call(u, 'DELETE', '/v1/me/dashboard');
  let tab = ((await get(u, '/v1/me/dashboard/tabs'))?.tabs ?? []).find((t) => t.title === 'Démonstration');
  if (!tab) tab = (await call(u, 'POST', '/v1/me/dashboard/tabs', { title: 'Démonstration' })).data;
  if (tab?.id) await call(u, 'PUT', `/v1/me/dashboard?tab=${tab.id}`, { widgets });
}

for (const portfolio of ['defense', 'spatial']) {
  await call('pmo', 'PUT', `/v1/me/dashboard?portfolio=${portfolio}`, { widgets: [
    { id: 'sante', kind: 'portfolio-health', size: 'XL', x: 0, y: 0, w: 12, h: 3 }, { id: 'tuiles', kind: 'portfolio-tiles', size: 'XL', x: 0, y: 3, w: 12, h: 3 },
  ] });
}
console.log(issues.length === 0 ? 'Démonstration PPM amorcée sans incident.' : `Démonstration PPM amorcée, ${issues.length} appel(s) refusé(s) :\n  ${[...new Set(issues)].slice(0, 60).join('\n  ')}`);
