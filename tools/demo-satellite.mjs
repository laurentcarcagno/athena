// Projet de démonstration « LUMEN » : nanosatellite d'observation de la Terre, équipe pluridisciplinaire.
// Crée sur une instance de développement en marche (API 3001, Keycloak 8080) :
//   - 11 comptes Keycloak (cheffe de projet, architectes, SCAO, thermique, AIT, assurance produit…), mot de passe `demo-<prénom>` ;
//   - le projet LUMEN (gabarit Spatial ECSS) avec exigences, conception, interfaces, vérification, tâches planifiées, sprints,
//     versions, anomalies, non-conformités, évolutions, dérogation, RID, risques, liens de traçabilité, commentaires et mentions,
//     circuit d'approbation, automatisation, recherches enregistrées, calendrier, baseline.
// Chaque action est faite par la personne concernée (jeton Keycloak de son compte) : auteurs, historique GitLab et notifications sont réels.
// Usage : node tools/demo-satellite.mjs        (idempotent : ne fait rien si le projet LUMEN existe déjà)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, 'deploy/dev/.env'), 'utf8');
const get = (name) => new RegExp(`^${name}=(.+)$`, 'm').exec(env)?.[1]?.trim();
const API = 'http://127.0.0.1:3001';
const KC = 'http://localhost:8080';
const PROJECT = 'LUMEN';

// ------------------------------------------------------------------ comptes
const PEOPLE = [
  { u: 'claire.lefevre', first: 'Claire', last: 'Lefèvre · Cheffe de projet', roles: ['athena-pm', 'athena-user'], pw: 'demo-claire' },
  { u: 'marc.dubois', first: 'Marc', last: 'Dubois · Architecte système', roles: ['athena-user'], pw: 'demo-marc' },
  { u: 'sophie.martin', first: 'Sophie', last: 'Martin · Architecte satellite', roles: ['athena-user'], pw: 'demo-sophie' },
  { u: 'thomas.bernard', first: 'Thomas', last: 'Bernard · Ingénieur SCAO', roles: ['athena-user'], pw: 'demo-thomas' },
  { u: 'lea.petit', first: 'Léa', last: 'Petit · Thermicienne', roles: ['athena-user'], pw: 'demo-lea' },
  { u: 'hugo.roux', first: 'Hugo', last: 'Roux · Architecte logiciel', roles: ['athena-user'], pw: 'demo-hugo' },
  { u: 'nina.garcia', first: 'Nina', last: 'Garcia · Développeuse logiciel de vol', roles: ['athena-user'], pw: 'demo-nina' },
  { u: 'paul.moreau', first: 'Paul', last: 'Moreau · Ingénieur AIT', roles: ['athena-user'], pw: 'demo-paul' },
  { u: 'ines.girard', first: 'Inès', last: 'Girard · Développeuse segment sol', roles: ['athena-user'], pw: 'demo-ines' },
  { u: 'julien.simon', first: 'Julien', last: 'Simon · Ingénieur énergie', roles: ['athena-user'], pw: 'demo-julien' },
  { u: 'emma.fournier', first: 'Emma', last: 'Fournier · Assurance produit', roles: ['athena-qa'], pw: 'demo-emma' },
];
const ADMIN = { u: 'admin.dev', pw: 'dev-only-admin' };

async function kcAdmin() {
  const form = new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: get('KEYCLOAK_ADMIN'), password: get('KEYCLOAK_ADMIN_PASSWORD') });
  const token = (await (await fetch(`${KC}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: form })).json()).access_token;
  if (!token) throw new Error('jeton administrateur Keycloak indisponible (Keycloak démarré ?)');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  return (path, init = {}) => fetch(`${KC}/admin/realms/athena${path}`, { headers, ...init });
}

async function ensureAccounts() {
  const kc = await kcAdmin();
  const group = (await (await kc('/groups?search=org-demo')).json())[0];
  for (const role of ['athena-pm', 'athena-qa']) if ((await kc(`/roles/${role}`)).status === 404) await kc('/roles', { method: 'POST', body: JSON.stringify({ name: role }) });
  for (const p of PEOPLE) {
    let found = await (await kc(`/users?username=${p.u}&exact=true`)).json();
    if (found.length === 0) {
      await kc('/users', { method: 'POST', body: JSON.stringify({
        username: p.u, enabled: true, email: `${p.u}@lumen.example.test`, emailVerified: true, firstName: p.first, lastName: p.last,
        credentials: [{ type: 'password', value: p.pw, temporary: false }], requiredActions: [],
      }) });
      found = await (await kc(`/users?username=${p.u}&exact=true`)).json();
    }
    p.id = found[0].id;
    const roles = await Promise.all(p.roles.map(async (n) => (await kc(`/roles/${n}`)).json()));
    await kc(`/users/${p.id}/role-mappings/realm`, { method: 'POST', body: JSON.stringify(roles) });
    if (group) await kc(`/users/${p.id}/groups/${group.id}`, { method: 'PUT' });
  }
}

// ------------------------------------------------------------------ API
const tokens = new Map();
async function token(user) {
  const cached = tokens.get(user.u);
  if (cached && cached.exp > Date.now()) return cached.value;
  const form = new URLSearchParams({ grant_type: 'password', client_id: 'athena-dev-cli', username: user.u, password: user.pw });
  const body = await (await fetch(`${KC}/realms/athena/protocol/openid-connect/token`, { method: 'POST', body: form })).json();
  if (!body.access_token) throw new Error(`connexion refusée pour ${user.u} : ${JSON.stringify(body)}`);
  tokens.set(user.u, { value: body.access_token, exp: Date.now() + 150_000 });
  return body.access_token;
}
async function call(user, method, path, body, { soft = false } = {}) {
  let response;
  let text = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    response = await fetch(`${API}${path}`, {
      method, headers: { Authorization: `Bearer ${await token(user)}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    text = await response.text();
    if (response.status !== 429) break;
    await new Promise((r) => setTimeout(r, 10_000)); // limite de débit de l'API : on attend la fenêtre suivante
  }
  if (!response.ok) {
    if (soft) { console.log(`  ! ${method} ${path} : ${response.status} ${text.slice(0, 160)}`); return null; }
    throw new Error(`${user.u} ${method} ${path} : ${response.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}
const P = (path) => `/v1/projects/${PROJECT}${path}`;

const who = Object.fromEntries(PEOPLE.map((p) => [p.u.split('.')[0], p]));
const admin = ADMIN;

/** Jour ouvré décalé de `n` jours ouvrés depuis aujourd'hui (négatif : passé), au format AAAA-MM-JJ. */
function wd(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; ) { d.setDate(d.getDate() + step); if (d.getDay() !== 0 && d.getDay() !== 6) left--; }
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + (step < 0 ? -1 : 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function create(user, tracker, values) {
  const made = await call(user, 'POST', P(`/trackers/${tracker}/artifacts`), { values });
  return made.key;
}
async function step(user, key, ...names) {
  for (const name of names) {
    const current = await call(user, 'GET', P(`/artifacts/${key}`));
    await call(user, 'POST', P(`/artifacts/${key}/transitions`), { name, version: current.version });
  }
}
async function patch(user, key, values) {
  const current = await call(user, 'GET', P(`/artifacts/${key}`));
  return call(user, 'PATCH', P(`/artifacts/${key}`), { values, version: current.version });
}
const link = (user, from, to, type, lagDays) => call(user, 'POST', P(`/artifacts/${from}/links`), { to, type, ...(lagDays ? { lagDays } : {}) });
const say = (text) => console.log(text);

// ------------------------------------------------------------------ programme
async function main() {
  const existing = await call(admin, 'GET', '/v1/projects');
  const exists = (Array.isArray(existing) ? existing : existing.projects ?? []).some((p) => p.key === PROJECT);
  if (exists) {
    const overview = await call(admin, 'GET', P('/trackers'), undefined, { soft: true });
    const risks = (Array.isArray(overview) ? overview : overview?.trackers ?? []).find((t) => t.key === 'RSK');
    const filled = risks ? await call(admin, 'GET', P('/search?q=tracker%20%3D%20RSK&limit=1'), undefined, { soft: true }) : null;
    if (filled && filled.total > 0) { say(`Le projet ${PROJECT} existe déjà : rien à faire (comptes : voir docs/dev/DEMO.md).`); return; }
    say(`Le projet ${PROJECT} existe mais est incomplet : reprise de l’amorçage.`);
  }
  say('Comptes Keycloak…');
  await ensureAccounts();
  for (const p of PEOPLE) await call(p, 'GET', '/v1/projects'); // première connexion : création du compte Athena

  say('Calendrier de l’organisation…');
  await call(admin, 'PUT', '/v1/admin/calendar', { workDays: [1, 2, 3, 4, 5], holidays: [
    { day: '2026-11-11', label: 'Armistice' }, { day: '2026-12-25', label: 'Noël' }, { day: '2027-01-01', label: 'Jour de l’an' },
    { day: '2027-03-29', label: 'Lundi de Pâques' }, { day: '2027-05-01', label: 'Fête du travail' }, { day: '2027-05-06', label: 'Ascension' },
  ] });

  say('Projet LUMEN (gabarit Spatial ECSS)…');
  if (!exists) await call(admin, 'POST', '/v1/projects', { key: PROJECT, name: 'LUMEN : nanosatellite d’observation de la Terre', template: 'spatial', criticality: 'C' });
  for (const p of PEOPLE) await call(admin, 'PUT', P(`/members/${p.id}`), { role: p.u === 'claire.lefevre' ? 'manager' : 'member' });
  await call(admin, 'POST', P('/link-types'), { key: 'parent', outwardLabel: 'a pour parent', inwardLabel: 'a pour enfant', hierarchical: true }, { soft: true });
  await call(admin, 'POST', P('/trackers/TSK/fields'), { key: 'points', label: 'Points', type: 'number', semanticRole: 'estimate', isContent: false }, { soft: true });
  await call(admin, 'POST', P('/trackers/TSK/fields'), { key: 'priority', label: 'Priorité', type: 'select', config: { options: ['basse', 'moyenne', 'haute'] }, semanticRole: 'priority', isContent: false }, { soft: true });
  await call(admin, 'POST', P('/trackers'), {
    key: 'RSK', name: 'Risques', typeKey: 'risk', description: 'Registre des risques du projet : probabilité, impact, criticité, mitigation.',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'description', label: 'Description', type: 'richtext', semanticRole: 'description' },
      { key: 'category', label: 'Catégorie', type: 'select', config: { options: ['technique', 'thermique', 'SCAO', 'logiciel', 'programmatique', 'lancement'] }, isContent: false },
      { key: 'probability', label: 'Probabilité (1-5)', type: 'number', config: { min: 1, max: 5 }, isContent: false },
      { key: 'impact', label: 'Impact (1-5)', type: 'number', config: { min: 1, max: 5 }, isContent: false },
      { key: 'criticality', label: 'Criticité (probabilité × impact)', type: 'number', config: { min: 1, max: 25 }, isContent: false },
      { key: 'owner', label: 'Responsable', type: 'user', semanticRole: 'assignee', isContent: false },
      { key: 'review', label: 'Prochaine revue', type: 'date', semanticRole: 'due_date', isContent: false },
      { key: 'mitigation', label: 'Plan de mitigation', type: 'richtext', isContent: false },
    ],
    statuses: [
      { key: 'identified', name: 'Identifié', category: 'todo' }, { key: 'assessed', name: 'Évalué', category: 'in_progress', color: 'yellow' },
      { key: 'mitigating', name: 'Mitigation en cours', category: 'in_progress', color: 'orange' }, { key: 'closed', name: 'Clos', category: 'done', color: 'green' },
      { key: 'occurred', name: 'Matérialisé', category: 'done', color: 'red' },
    ],
    transitions: [
      { name: 'Évaluer', from: 'identified', to: 'assessed' }, { name: 'Lancer la mitigation', from: 'assessed', to: 'mitigating' },
      { name: 'Clore', from: 'mitigating', to: 'closed' }, { name: 'Déclarer matérialisé', from: 'mitigating', to: 'occurred' }, { name: 'Rouvrir', from: null, to: 'identified' },
    ],
  }, { soft: true });

  // ---------------- exigences système (architecte système, architecte satellite, spécialistes)
  say('Exigences, conception, interfaces, vérification…');
  const sys = {};
  const SYS = [
    ['life', 'marc', 'Durée de vie en orbite', 'Le satellite doit fonctionner en orbite héliosynchrone à 500 km pendant au moins 3 ans, avec une disponibilité de la charge utile supérieure à 95 %.', 'A', 'haute'],
    ['gsd', 'sophie', 'Résolution au sol', 'La charge utile doit fournir une résolution au sol inférieure ou égale à 5 m au nadir, à 500 km d’altitude.', 'T', 'haute'],
    ['point', 'thomas', 'Précision de pointage', 'Le système de contrôle d’attitude doit tenir une précision de pointage de 0,05° (3σ) en mode imagerie, avec une stabilité de 0,01°/s.', 'T', 'haute'],
    ['data', 'sophie', 'Volume de données utiles', 'Le segment spatial doit acquérir et restituer au moins 20 Go de données utiles par jour, sur 6 passages sol.', 'A', 'moyenne'],
    ['power', 'julien', 'Bilan de puissance', 'La puissance moyenne disponible sur l’orbite doit être au moins égale à 45 W, avec une marge de 20 % en fin de vie.', 'T', 'haute'],
    ['thermal', 'lea', 'Plage de température des équipements', 'Tous les équipements doivent rester dans leur plage de température de fonctionnement (0 à +40 °C pour les batteries) en toute phase de la mission.', 'T', 'haute'],
    ['mass', 'marc', 'Masse totale', 'La masse du satellite, charge utile comprise, ne doit pas dépasser 24 kg (format 12U).', 'I', 'moyenne'],
    ['survival', 'sophie', 'Autonomie en survie', 'Le satellite doit survivre 72 heures sans contact sol, en conservant son énergie et son attitude.', 'T', 'haute'],
    ['fdir', 'marc', 'Mise en sécurité automatique', 'Toute anomalie critique doit conduire le satellite en mode survie sans intervention sol, en moins de 60 secondes.', 'T', 'haute'],
  ];
  for (const [id, by, title, statement, vm, priority] of SYS) sys[id] = await create(who[by], 'SYS', { title, statement, verification_method: vm, priority });
  for (const id of ['life', 'gsd', 'point', 'power', 'mass', 'survival']) await step(who.marc, sys[id], 'Baseliner');
  await step(who.marc, sys.mass, 'Vérifier');

  const srs = {};
  const SRS = [
    ['modes', 'hugo', 'Gestion des modes', 'Le logiciel de vol doit gérer les modes détumblage, nominal, imagerie et survie, avec des transitions déterministes.', 'B', 'T', 'PDR', 'oui'],
    ['fdir', 'nina', 'Détection et reprise de fautes', 'Le logiciel doit détecter les fautes de niveau 1 à 3 listées dans la matrice FDIR et appliquer la reprise associée.', 'B', 'T', 'PDR', 'oui'],
    ['att', 'thomas', 'Contrôle d’attitude à 10 Hz', 'La boucle de contrôle d’attitude doit s’exécuter à 10 Hz avec une gigue inférieure à 5 ms.', 'B', 'T', 'PDR', 'oui'],
    ['tm', 'nina', 'Télémétrie CCSDS', 'Le logiciel doit produire la télémétrie sous forme de paquets CCSDS avec horodatage en temps universel.', 'C', 'T', 'CDR', 'non'],
    ['tc', 'hugo', 'Télécommandes authentifiées', 'Toute télécommande de niveau critique doit être authentifiée avant exécution.', 'B', 'T', 'CDR', 'oui'],
    ['boot', 'hugo', 'Mise à jour du logiciel en vol', 'Le chargeur d’amorçage doit permettre le remplacement du logiciel applicatif en vol, avec retour à la version précédente en cas d’échec.', 'C', 'T', 'CDR', 'oui'],
    ['log', 'nina', 'Journal d’événements', 'Le logiciel doit enregistrer les événements horodatés dans une mémoire non volatile et les restituer au sol.', 'C', 'T', 'CDR', 'non'],
    ['energy', 'julien', 'Délestage énergétique', 'Le logiciel doit délester les charges non essentielles lorsque la tension batterie descend sous le seuil de délestage.', 'B', 'T', 'PDR', 'oui'],
    ['images', 'hugo', 'Compression des images', 'Le logiciel doit compresser les images avec un rapport d’au moins 3:1 sans perte radiométrique supérieure à 1 %.', 'C', 'A', 'CDR', 'non'],
  ];
  for (const [id, by, title, statement, category, vm, review, safety] of SRS) srs[id] = await create(who[by], 'SRS', { title, statement, category, verification_method: vm, intro_review: review, safety_relevant: safety });
  for (const id of ['modes', 'fdir', 'att', 'energy']) await step(who.hugo, srs[id], 'Soumettre à revue', 'Baseliner');
  await step(who.hugo, srs.tm, 'Soumettre à revue');
  const refines = [['modes', 'survival'], ['fdir', 'fdir'], ['att', 'point'], ['tm', 'data'], ['tc', 'fdir'], ['boot', 'life'], ['log', 'life'], ['energy', 'power'], ['images', 'data']];
  for (const [s, y] of refines) await link(who.hugo, srs[s], sys[y], 'refines');

  const sdd = {};
  const SDD = [
    ['arch', 'hugo', 'Architecture logicielle de vol', 'Architecture en couches : noyau temps réel, services (temps, mémoire, télémétrie), applications (modes, SCAO, énergie, charge utile).', 'architecture'],
    ['kalman', 'thomas', 'Estimateur d’attitude', 'Filtre de Kalman étendu fusionnant magnétomètres, gyromètres, capteurs solaires et capteur stellaire.', 'détaillée'],
    ['bdot', 'thomas', 'Loi de détumblage B-dot', 'Loi de détumblage par magnéto-coupleurs à partir de la dérivée du champ magnétique mesuré.', 'détaillée'],
    ['thermal', 'lea', 'Régulation thermique active', 'Régulation proportionnelle des réchauffeurs de batterie et de la charge utile, avec seuils de sécurité matériels.', 'architecture'],
    ['power', 'julien', 'Gestion de l’énergie', 'Suivi du point de puissance maximale, gestion de la charge des batteries et délestage par priorité.', 'détaillée'],
  ];
  for (const [id, by, title, statement, level] of SDD) sdd[id] = await create(who[by], 'SDD', { title, statement, level });
  for (const id of ['arch', 'kalman']) await step(who.hugo, sdd[id], 'Soumettre à revue');
  const satisfies = [['arch', 'modes'], ['arch', 'fdir'], ['kalman', 'att'], ['kalman', 'point'], ['bdot', 'survival'], ['thermal', 'thermal'], ['power', 'power'], ['power', 'energy']];
  for (const [d, r] of satisfies) await link(who.hugo, sdd[d], (sys[r] ?? srs[r]), 'satisfies');

  const icd = {};
  icd.can = await create(who.marc, 'ICD', { title: 'Bus CAN OBC, SCAO et alimentation', statement: 'Trames, identifiants, débit 500 kbit/s et gestion des collisions entre le calculateur, le SCAO et l’alimentation.', counterpart: 'SCAO, EPS' });
  icd.payload = await create(who.sophie, 'ICD', { title: 'Interface charge utile : caméra', statement: 'Liaison série haut débit, commandes de prise de vue, signal de synchronisation et alimentation 12 V.', counterpart: 'Caméra' });
  await step(who.marc, icd.can, 'Convenir');
  await link(who.marc, icd.can, srs.modes, 'refines');
  await link(who.sophie, icd.payload, sys.gsd, 'refines');

  const ver = {};
  const VER = [
    ['hil', 'paul', 'Essai de pointage sur banc (HIL)', 'Boucle SCAO fermée sur banc matériel dans la boucle, injection de perturbations, mesure de la précision de pointage.', 'campagne', 'T', ['att', 'point']],
    ['tvac', 'lea', 'Essai thermique sous vide (TVAC)', 'Quatre cycles de -10 à +50 °C sous vide, mesure des températures batterie et charge utile.', 'campagne', 'T', ['thermal']],
    ['survival', 'paul', 'Test fonctionnel du mode survie', 'Coupure du contact sol simulée pendant 72 h, vérification de la conservation d’énergie et d’attitude.', 'procédure', 'T', ['survival', 'fdir']],
    ['tm', 'nina', 'Test de télémétrie CCSDS', 'Décodage des paquets au sol avec le simulateur, contrôle des champs et de l’horodatage.', 'procédure', 'T', ['tm']],
    ['vibration', 'paul', 'Essai de vibrations', 'Essai sinus et aléatoire aux niveaux du lanceur, avant et après contrôle fonctionnel.', 'campagne', 'T', ['mass']],
    ['power', 'julien', 'Mesure du bilan de puissance', 'Mesure des consommations par mode et de la production sur simulateur solaire.', 'rapport', 'T', ['power', 'energy']],
  ];
  for (const [id, by, title, procedure, kind, vm, targets] of VER) {
    ver[id] = await create(who[by], 'VER', { title, procedure, kind, verification_method: vm });
    for (const t of targets) await link(who[by], ver[id], sys[t] ?? srs[t], 'verifies');
  }
  await step(who.paul, ver.survival, 'Exécuter', 'Déclarer conforme');
  await step(who.nina, ver.tm, 'Exécuter', 'Déclarer non conforme');
  await step(who.julien, ver.power, 'Exécuter');

  // ---------------- tâches planifiées (phases, jalons, dépendances)
  say('Planning : phases, tâches, jalons, dépendances…');
  const tsk = {};
  const phase = async (id, title, by) => { tsk[id] = await create(who[by], 'TSK', { title }); };
  await phase('P1', 'Phase 1 : conception détaillée', 'claire');
  await phase('P2', 'Phase 2 : réalisation du logiciel de vol', 'claire');
  await phase('P3', 'Phase 3 : intégration et essais', 'claire');
  await phase('P4', 'Phase 4 : recette et lancement', 'claire');
  // [id, phase, qui, titre, début, fin, état, avancement, reste, points, priorité, description]
  const TASKS = [
    ['T1', 'P1', 'marc', 'Revue des exigences système (SRR)', -45, -41, 'done', 100, 0, 3, 'haute', 'Relecture croisée des 9 exigences système avec les spécialistes.'],
    ['T2', 'P1', 'julien', 'Spécification du bilan de puissance', -40, -34, 'done', 100, 0, 5, 'haute', 'Consommations par mode, production solaire, marges.'],
    ['T3', 'P1', 'lea', 'Modèle thermique 1D du satellite', -40, -30, 'done', 100, 0, 5, 'haute', 'Réseau nodal, cas chaud et froid, éclipse longue.'],
    ['T4', 'P1', 'hugo', 'Conception de l’architecture logicielle', -38, -28, 'done', 100, 0, 8, 'haute', 'Couches, tâches, partitionnement mémoire.'],
    ['T5', 'P1', 'thomas', 'Définition des algorithmes SCAO', -36, -22, 'done', 100, 0, 8, 'haute', 'Détumblage, estimation, loi de commande.'],
    ['J1', 'P1', 'claire', 'Jalon : revue de conception préliminaire (PDR)', null, -21, 'done', 100, 0, null, 'haute', ''],
    ['T6', 'P2', 'hugo', 'Noyau temps réel et chargeur d’amorçage', -20, -8, 'done', 100, 0, 8, 'haute', 'Ordonnancement, horloge, chargeur avec retour arrière.'],
    ['T7', 'P2', 'nina', 'Pilote du bus CAN', -18, -9, 'done', 100, 0, 5, 'moyenne', 'Émission et réception, filtrage des identifiants.'],
    ['T8', 'P2', 'thomas', 'Estimateur d’attitude (filtre de Kalman)', -15, 0, 'doing', 90, 1, 8, 'haute', 'Filtre étendu et réglage des covariances.'],
    ['T9', 'P2', 'thomas', 'Loi de détumblage B-dot', -3, 4, 'doing', 30, 4, 5, 'haute', 'Commande des magnéto-coupleurs et saturation.'],
    ['T10', 'P2', 'nina', 'Gestionnaire de modes et reprise de fautes', -10, 8, 'doing', 55, 6, 13, 'haute', 'Machine à états des modes et matrice FDIR.'],
    ['T11', 'P2', 'nina', 'Télémétrie et télécommandes CCSDS', 5, 14, 'todo', 0, 8, 8, 'moyenne', 'Paquets, authentification, accusés de réception.'],
    ['T12', 'P2', 'hugo', 'Compression d’images embarquée', 3, 17, 'todo', 0, 12, 8, 'basse', 'Codeur à base d’ondelettes, mesure de la perte.'],
    ['T13', 'P2', 'julien', 'Gestionnaire d’énergie et délestage', 0, 10, 'doing', 20, 8, 5, 'haute', 'Seuils de délestage, charge des batteries.'],
    ['T14', 'P2', 'ines', 'Segment sol : chaîne de décodage de la télémétrie', -12, -3, 'doing', 70, 3, 5, 'moyenne', 'Décodage, archivage et affichage temps réel.'],
    ['J2', 'P2', 'claire', 'Jalon : revue de conception critique (CDR)', null, 20, 'todo', 0, 0, null, 'haute', ''],
    ['T15', 'P3', 'paul', 'Intégration du modèle d’ingénierie (EM)', 12, 22, 'todo', 0, 9, 8, 'haute', 'Assemblage mécanique et électrique, premiers essais fonctionnels.'],
    ['T16', 'P3', 'paul', 'Essai de pointage sur banc (HIL)', 23, 30, 'todo', 0, 6, 5, 'haute', 'Banc à trois axes avec magnétomètres simulés.'],
    ['T17', 'P3', 'lea', 'Essai thermique sous vide (TVAC)', 31, 44, 'todo', 0, 10, 8, 'haute', 'Quatre cycles, instrumentation par thermocouples.'],
    ['T18', 'P3', 'paul', 'Essai de vibrations', 31, 36, 'todo', 0, 4, 5, 'moyenne', 'Niveaux de qualification du lanceur.'],
    ['T19', 'P3', 'nina', 'Campagne de validation fonctionnelle', 45, 55, 'todo', 0, 9, 8, 'haute', 'Scénarios de mission complets sur le modèle de vol.'],
    ['J3', 'P3', 'claire', 'Jalon : revue de qualification (QR)', null, 60, 'todo', 0, 0, null, 'haute', ''],
    ['T20', 'P4', 'claire', 'Dossier de livraison', 50, 62, 'todo', 0, 10, 5, 'moyenne', 'Documentation, rapports d’essais, états de configuration.'],
    ['T21', 'P4', 'claire', 'Revue de préparation au lancement', 63, 67, 'todo', 0, 4, 3, 'moyenne', 'Revue avec le lanceur et le centre de contrôle.'],
    ['T22', 'P4', 'paul', 'Livraison au lanceur', 68, 70, 'todo', 0, 2, 3, 'haute', 'Transport, intégration sur l’adaptateur, contrôles finaux.'],
    ['J4', 'P4', 'claire', 'Jalon : revue de recette (AR)', null, 70, 'todo', 0, 0, null, 'haute', ''],
  ];
  for (const [id, , by, title, start, end, state, progress, remaining, points, priority, description] of TASKS) {
    const values = { title, description, due: wd(end), assignee: who[by].id, progress, remaining, priority };
    if (start !== null) values.start = wd(start);
    if (points !== null) values.points = points;
    tsk[id] = await create(who[by], 'TSK', values);
    if (state === 'done') await step(who[by], tsk[id], 'Démarrer', 'Terminer');
    if (state === 'doing') await step(who[by], tsk[id], 'Démarrer');
  }
  for (const [id, ph] of TASKS.map((t) => [t[0], t[1]])) await link(who.claire, tsk[id], tsk[ph], 'parent');
  const PRECEDES = [['T4', 'J1'], ['T5', 'J1'], ['J1', 'T6'], ['T6', 'T10'], ['T7', 'T10'], ['T5', 'T8'], ['T8', 'T9'], ['T10', 'T11'], ['T11', 'J2'], ['T12', 'J2'],
    ['T14', 'T15'], ['T13', 'T15'], ['T8', 'T15'], ['J2', 'T15'], ['T15', 'T16'], ['T9', 'T16'], ['T16', 'T17'], ['T15', 'T18'], ['T17', 'T19'], ['T18', 'T19'],
    ['T19', 'J3'], ['J3', 'T20'], ['T20', 'T21'], ['T21', 'T22'], ['T22', 'J4']];
  for (const [a, b] of PRECEDES) await link(who.claire, tsk[a], tsk[b], 'precedes', a === 'T11' && b === 'J2' ? 2 : 0);
  const implementsMap = [['T4', 'arch'], ['T5', 'kalman'], ['T8', 'kalman'], ['T9', 'bdot'], ['T3', 'thermal'], ['T13', 'power']];
  for (const [t, d] of implementsMap) await link(who.hugo, tsk[t], sdd[d], 'implements');
  for (const [t, r] of [['T10', 'fdir'], ['T11', 'tm'], ['T12', 'images'], ['T6', 'boot']]) await link(who.hugo, tsk[t], srs[r], 'implements');
  const applied = await call(who.claire, 'POST', P('/schedule/apply'));
  say(`  replanification : ${applied.moved} ticket(s) déplacé(s)`);

  // ---------------- anomalies, non-conformités, évolutions, dérogation, RID
  say('Anomalies, non-conformités, évolutions, RID…');
  const spr = {};
  const SPR = [
    ['wd', 'paul', 'Redémarrage intempestif du chien de garde en mode survie', 'Lors du test de survie, le chien de garde déclenche un redémarrage toutes les 40 minutes environ.', 'critique', 'CDR', 'hugo', ['Analyser']],
    ['clock', 'nina', 'Dérive de l’horloge du calculateur supérieure à 2 s par jour', 'Mesure sur banc : la dérive dépasse la spécification sans recalage sol.', 'majeure', 'PDR', 'nina', []],
    ['queue', 'ines', 'Saturation de la file de télémétrie à 10 Hz', 'La file se remplit en mode imagerie ; des paquets sont perdus.', 'majeure', 'CDR', 'nina', ['Analyser', 'Corriger']],
    ['label', 'nina', 'Libellé erroné du compteur de redémarrages', 'Le compteur est étiqueté en secondes au lieu d’un nombre de redémarrages.', 'mineure', 'PDR', 'nina', ['Analyser', 'Corriger', 'Clore']],
    ['kalman', 'thomas', 'Singularité du filtre de Kalman en entrée d’éclipse', 'La covariance devient non définie positive quand le soleil disparaît des capteurs.', 'critique', 'CDR', 'thomas', []],
  ];
  for (const [id, by, title, description, severity, detected_in, owner, steps] of SPR) {
    spr[id] = await create(who[by], 'SPR', { title, description, severity, detected_in, assignee: who[owner].id });
    if (steps.length) await step(who[owner], spr[id], ...steps);
  }
  await link(who.hugo, spr.wd, tsk.T10, 'blocks');
  await link(who.thomas, spr.kalman, tsk.T8, 'blocks');
  const ncr = {};
  ncr.conn = await create(who.paul, 'NCR', { title: 'Connecteur J3 non conforme au plan de câblage', description: 'Les broches 7 et 8 sont inversées sur le modèle d’ingénierie.', assignee: who.paul.id });
  ncr.glue = await create(who.lea, 'NCR', { title: 'Colle thermique hors péremption', description: 'Le lot de colle utilisé pour les radiateurs dépasse sa date limite d’utilisation.', assignee: who.lea.id });
  await step(who.paul, ncr.conn, 'Analyser');
  const cr = {};
  cr.rate = await create(who.thomas, 'CR', { title: 'Passer la fréquence de contrôle d’attitude de 10 à 20 Hz', description: 'Améliore la précision de pointage en imagerie ; impact sur la charge du calculateur et sur le planning des essais.', impact: 'planning', assignee: who.thomas.id });
  cr.mag = await create(who.sophie, 'CR', { title: 'Ajouter un second magnétomètre', description: 'Redondance de la mesure du champ magnétique pour la phase de détumblage.', impact: 'coût', assignee: who.marc.id });
  await step(who.claire, cr.mag, 'Approuver');
  const rfd = await create(who.thomas, 'RFD', { title: 'Précision de pointage en éclipse', description: 'Demande de dérogation : la précision de 0,05° n’est pas garantie pendant l’éclipse (sans capteurs solaires).', kind: 'RFD', requirement: sys.point });
  const rid = {};
  rid.mass = await create(who.claire, 'RID', { title: 'Marge de masse insuffisante', description: 'La marge de masse de 5 % est inférieure à l’exigence du programme (10 %).', review: 'pdr', originator: 'Emma Fournier', assignee: who.marc.id });
  rid.fdir = await create(who.claire, 'RID', { title: 'Matrice FDIR incomplète', description: 'Aucune reprise définie pour la perte du bus CAN.', review: 'pdr', originator: 'Emma Fournier', assignee: who.hugo.id });
  rid.thermal = await create(who.sophie, 'RID', { title: 'Cas thermique d’éclipse longue non couvert', description: 'Le modèle thermique ne traite pas l’éclipse de 35 minutes du solstice.', review: 'pdr', originator: 'Sophie Martin', assignee: who.lea.id });
  await step(who.marc, rid.mass, 'Répondre');
  await patch(who.marc, rid.mass, { response: 'Allègement du support de batterie et marge portée à 8 %.', decision: 'partiellement acceptée' });
  await step(who.hugo, rid.fdir, 'Répondre', 'Décider', 'Lancer l’action', 'Clore');

  // ---------------- risques
  say('Risques…');
  const rsk = {};
  const RSK = [
    ['optics', 'lea', 'Dégradation de l’optique par cycles thermiques', 'Les cycles thermiques en orbite peuvent décaler le plan focal et dégrader la résolution.', 'thermique', 3, 4, 'Calage athermalisé et test TVAC à marges élargies.', 'mitigating'],
    ['wheels', 'thomas', 'Saturation des roues à réaction', 'Les couples perturbateurs aérodynamiques à 500 km peuvent saturer les roues en fin de vie.', 'SCAO', 3, 3, 'Délestage magnétique des roues, marge de moment cinétique de 30 %.', 'assessed'],
    ['star', 'claire', 'Retard de livraison du capteur stellaire', 'Le fournisseur annonce 8 semaines de retard sur le capteur stellaire.', 'programmatique', 4, 4, 'Capteur alternatif qualifié en parallèle, intégration en deux temps.', 'mitigating'],
    ['can', 'hugo', 'Défaillance du bus CAN en vol', 'Une panne du bus CAN couperait le calculateur du SCAO et de l’alimentation.', 'technique', 2, 5, 'Second bus en secours à froid et reprise de fautes dédiée.', 'mitigating'],
    ['seu', 'hugo', 'Corruption de la mémoire par rayonnement', 'Les événements singuliers peuvent corrompre la mémoire du calculateur.', 'logiciel', 3, 4, 'Mémoire corrigée par code, balayage périodique et redémarrage contrôlé.', 'assessed'],
    ['mass', 'marc', 'Marge de masse insuffisante', 'La masse du satellite dépasse la cible de 8 % avec la configuration actuelle.', 'technique', 4, 3, 'Allègements des supports et revue des masses à chaque jalon.', 'mitigating'],
    ['launch', 'claire', 'Décalage du créneau de lancement', 'Le lanceur annonce un possible décalage de 3 mois.', 'lancement', 2, 5, 'Plan de report avec stockage du modèle de vol.', 'identified'],
    ['battery', 'julien', 'Température batterie hors plage en éclipse longue', 'En éclipse longue, la batterie peut descendre sous 0 °C.', 'thermique', 3, 4, 'Réchauffeur supplémentaire et logique de sécurité matérielle.', 'assessed'],
    ['ground', 'ines', 'Indisponibilité de la station sol', 'La station sol partagée peut être indisponible lors des passages critiques.', 'programmatique', 2, 2, 'Convention avec une seconde station.', 'identified'],
  ];
  for (const [id, by, title, description, category, probability, impact, mitigation, state] of RSK) {
    rsk[id] = await create(who[by], 'RSK', {
      title, description, category, probability, impact, criticality: probability * impact, owner: who[by].id, review: wd(10 + (probability * impact) % 7), mitigation,
    });
    const path = { identified: [], assessed: ['Évaluer'], mitigating: ['Évaluer', 'Lancer la mitigation'] }[state];
    if (path.length) await step(who[by], rsk[id], ...path);
  }
  for (const [r, to, type] of [['optics', sys.gsd, 'concerns'], ['optics', ver.tvac, 'concerns'], ['wheels', sys.point, 'concerns'], ['star', tsk.T15, 'concerns'], ['can', icd.can, 'concerns'],
    ['seu', srs.fdir, 'concerns'], ['mass', sys.mass, 'concerns'], ['launch', tsk.T22, 'concerns'], ['battery', sys.thermal, 'concerns'], ['optics', tsk.T3, 'concerns']]) await link(who.claire, rsk[r], to, type);

  // ---------------- échanges : commentaires, mentions, approbation
  say('Commentaires, mentions, circuit d’approbation, automatisation…');
  const say2 = (user, key, body) => call(user, 'POST', P(`/artifacts/${key}/comments`), { body });
  await say2(who.claire, spr.wd, '@hugo.roux c’est bloquant pour la CDR : peux-tu regarder en priorité ? @paul.moreau, merci de joindre les traces du banc.');
  await say2(who.hugo, spr.wd, 'Piste trouvée : le chien de garde n’est pas réarmé pendant la copie en mémoire non volatile. Correctif dans la prochaine version.');
  await say2(who.thomas, spr.kalman, '@claire.lefevre le correctif touche la boucle d’estimation : prévoir une journée de plus sur T8 (voir le planning).');
  await say2(who.claire, rid.mass, 'Emma Fournier (assurance produit) : @marc.dubois la réponse est acceptable si la marge de 8 % est confirmée à la revue de masses.');
  await say2(who.sophie, cr.rate, '@thomas.bernard quel est l’effet sur la charge du calculateur ? @hugo.roux à confirmer avant la CDR.');
  await say2(who.lea, rsk.optics, 'Les premiers résultats du modèle thermique montrent un gradient de 6 K sur le plan focal : à intégrer dans le test TVAC.');
  await say2(who.marc, sys.point, '@thomas.bernard la dérogation en éclipse est-elle toujours nécessaire avec le second magnétomètre ?');
  await say2(who.claire, tsk.T10, '@nina.garcia point d’avancement vendredi : 55 % déclaré, le reste dépend de l’anomalie du chien de garde.');
  await call(admin, 'PUT', P('/trackers/CR/approval-flow'), { enabled: true, steps: [
    { name: 'Revue technique', kind: 'review', approvers: [who.marc.id, who.sophie.id], minApprovals: 1 },
    { name: 'Approbation de la cheffe de projet', kind: 'approval', approvers: [who.claire.id], minApprovals: 1 },
    { name: 'Visa assurance produit', kind: 'approval', role: 'athena-qa', approvers: [], minApprovals: 1 },
  ] }, { soft: true });
  await call(who.marc, 'POST', P(`/artifacts/${cr.rate}/approval/decision`), { decision: 'approved', comment: 'Pertinent, à condition de confirmer la charge calculateur.' }, { soft: true });
  await call(admin, 'POST', P('/automations'), {
    name: 'Anomalie critique : prévenir la cheffe de projet', trigger: 'artifact.created', condition: 'tracker = SPR AND severity = critique',
    actions: [{ type: 'comment', body: '@claire.lefevre anomalie critique déclarée : à traiter avant la prochaine revue.' }],
  }, { soft: true });

  // ---------------- sprints et versions
  say('Sprints et versions…');
  const sp = async (name, goal, a, b, items, mode) => {
    const created = await call(who.claire, 'POST', P('/sprints'), { name, goal, startsOn: wd(a), endsOn: wd(b) });
    const id = created.id ?? created.sprint?.id;
    for (const k of items) await call(who.claire, 'POST', P(`/sprints/${id}/items`), { artifact: tsk[k] });
    if (mode !== 'planned') await call(who.claire, 'POST', P(`/sprints/${id}/start`));
    if (mode === 'closed') await call(who.claire, 'POST', P(`/sprints/${id}/close`), {});
    return id;
  };
  await sp('Sprint 1 : socle de conception', 'Conception détaillée terminée', -45, -32, ['T3', 'T4', 'T5'], 'closed');
  await sp('Sprint 2 : noyau et bus', 'Noyau temps réel et bus CAN opérationnels', -31, -9, ['T6', 'T7'], 'closed');
  await sp('Sprint 3 : SCAO et modes', 'Estimateur, détumblage et gestion des modes', -8, 5, ['T8', 'T9', 'T10', 'T13', 'T14'], 'active');
  await sp('Sprint 4 : télémétrie et images', 'Télémétrie CCSDS et compression d’images', 6, 19, ['T11', 'T12'], 'planned');
  await call(who.claire, 'POST', P('/backlog/rank'), { key: tsk.T15, after: null }, { soft: true });
  const rel = async (name, a, b, items, publish) => {
    const created = await call(who.claire, 'POST', P('/releases'), { name, startsOn: wd(a), endsOn: wd(b) });
    const id = created.id ?? created.release?.id;
    for (const k of items) await call(who.claire, 'POST', P(`/releases/${id}/items`), { artifact: tsk[k] }, { soft: true });
    if (publish) await call(who.claire, 'POST', P(`/releases/${id}/publish`), undefined, { soft: true });
  };
  await rel('OBSW 0.1 : modèle d’ingénierie', -38, -8, ['T4', 'T6', 'T7'], true);
  await rel('OBSW 0.5 : candidat modèle de vol', -7, 25, ['T8', 'T9', 'T10', 'T11', 'T13'], false);
  await rel('OBSW 1.0 : version de vol', 26, 70, ['T12', 'T15', 'T16', 'T19'], false);

  // ---------------- recherches enregistrées et favoris
  say('Recherches enregistrées…');
  const searches = [
    [who.claire, 'Chemin critique du projet', 'critical()'], [who.claire, 'Tâches en retard', 'late()'],
    [who.claire, 'Risques élevés (criticité ≥ 12)', 'tracker = RSK AND criticality >= 12 ORDER BY criticality DESC'],
    [who.hugo, 'Mes tâches en retard', 'late() AND assignee = currentUser()'],
    [who.paul, 'Anomalies ouvertes', 'tracker = SPR AND category != done'], [who.paul, 'Mes essais à venir', 'tracker = TSK AND assignee = currentUser() AND category != done ORDER BY startDate'],
  ];
  for (const [user, name, query] of searches) await call(user, 'POST', '/v1/searches', { name, query, projects: [PROJECT] }, { soft: true });
  await finish();
  say('');
  say(`Projet ${PROJECT} prêt. Connexion : http://localhost:3000 ; comptes et mots de passe : docs/dev/DEMO.md`);
}


/** Favoris et baseline : dernière étape, rejouable seule (`--finish`) si la synchronisation de l'historique n'était pas prête. */
async function finish() {
  say('Favoris…');
  for (const user of [who.claire, who.hugo, who.thomas, who.paul]) await call(user, 'PUT', '/v1/me/pins/favorite', { favorite: true, kind: 'project', project: PROJECT, ref: PROJECT, label: PROJECT }, { soft: true });
  await call(who.claire, 'PUT', '/v1/me/pins/favorite', { favorite: true, kind: 'tracker', project: PROJECT, ref: 'RSK', label: 'Risques' }, { soft: true });
  say('Baseline PDR (attente de la synchronisation de l’historique)…');
  for (let attempt = 0; attempt < 36; attempt++) {
    const result = await call(admin, 'POST', P('/baselines'), { name: 'PDR' }, { soft: true });
    if (result) { say('  baseline PDR créée'); break; }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

if (process.argv.includes('--finish')) {
  for (const p of PEOPLE) p.id ??= undefined;
  await finish().catch((e) => { console.error(e.message); process.exit(1); });
} else await main().catch((error) => { console.error(`ÉCHEC : ${error.message}`); process.exit(1); });
