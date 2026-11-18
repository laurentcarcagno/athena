// Données de démonstration représentatives dans TOUS les trackers de tous les projets visibles de l'administrateur : tickets réalistes (champs lus dans la
// définition du tracker), statuts répartis le long du workflow, liens de traçabilité, commentaires de plusieurs auteurs, sprints (clos, actif, planifié),
// versions (publiée, en cours, à venir), baselines et recherches enregistrées.
// Prérequis : `node tools/dev-start.mjs` en marche (API 3001, Keycloak 8080), `node tools/demo-ppm.mjs` déjà passé.
// Usage : node tools/demo-data.mjs        (idempotent : un tracker déjà fourni n'est pas rempli deux fois)
const API = 'http://127.0.0.1:3001';
const KC = 'http://localhost:8080';
const PER_TRACKER = 8;

const USERS = { admin: 'dev-only-admin', pm: 'dev-only-pm', user: 'dev-only-user', qa: 'dev-only-qa', manager: 'dev-only-manager', pmo: 'dev-only-pmo' };
const tokens = {}; const subs = {};
for (const [k, pw] of Object.entries(USERS)) {
  const r = await (await fetch(`${KC}/realms/athena/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'athena-dev-cli', username: `${k}.dev`, password: pw }) })).json();
  if (!r.access_token) throw new Error(`connexion impossible pour ${k}.dev`);
  tokens[k] = r.access_token; subs[k] = JSON.parse(Buffer.from(r.access_token.split('.')[1], 'base64url').toString()).sub;
}
const people = ['user', 'pm', 'qa', 'manager', 'pmo', 'admin'];
const issues = new Map();
async function call(as, method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${tokens[as]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok && res.status !== 409) { const k = `${method} ${path.replace(/[A-Z0-9]{2,10}-[A-Z0-9]{2,10}-\d+/g, ':ticket').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').replace(/\/projects\/[A-Z0-9]+/, '/projects/:p')} → ${res.status} ${typeof data === 'object' ? (data?.details?.[0] ?? data?.message ?? '') : ''}`; issues.set(k, (issues.get(k) ?? 0) + 1); }
  return { ok: res.ok, status: res.status, data };
}
const A = 'admin';
const get = async (path) => (await call(A, 'GET', path)).data;
const today = new Date();
const day = (n) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + n)).toISOString().slice(0, 10);
const log = (m) => console.log(`— ${m}`);

// ------------------------------------------------------------------ vocabulaire par domaine
const DOMAINS = {
  space: ['le SCAO', 'l’ordinateur de bord', 'la charge utile optique', 'la batterie', 'les panneaux solaires', 'la chaîne de télémesure', 'le segment sol', 'le contrôle thermique'],
  radar: ['l’antenne', 'le récepteur', 'le traitement du signal', 'le radôme', 'le mât', 'l’alimentation', 'l’interface opérateur', 'le module de pistage'],
  drone: ['la cellule', 'la motorisation', 'la liaison de données', 'la charge utile optronique', 'la batterie', 'le pilote automatique', 'la station sol', 'le parachute de secours'],
  cyber: ['les sondes de détection', 'le pare-feu', 'la journalisation centralisée', 'le SIEM', 'le durcissement des postes', 'l’annuaire', 'le chiffrement des flux', 'la supervision'],
  comms: ['la passerelle', 'le chiffreur', 'le poste de commandement', 'la liaison radio', 'la gestion des clés', 'le relais', 'le terminal portable', 'l’annuaire sécurisé'],
  jammer: ['le brouilleur', 'l’antenne directive', 'l’alimentation', 'l’interface de commande', 'le refroidissement', 'le châssis mobile', 'le module de veille', 'le logiciel de mission'],
  generic: ['le module d’authentification', 'l’API publique', 'le tableau de bord', 'le moteur de recherche', 'l’import de données', 'les notifications', 'l’export PDF', 'la gestion des droits'],
};
const DOMAIN_OF = { LUMEN: 'space', SAT1: 'space', RADC: 'radar', DRNT: 'drone', CYBD: 'cyber', COMS: 'comms', BRLG: 'jammer' };
const TITLES = {
  requirement: ['Disponibilité de {s}', 'Performance nominale de {s}', 'Tenue de {s} aux conditions environnementales', 'Testabilité de {s} en intégration', 'Échanges de {s} avec les systèmes voisins', 'Sécurité de fonctionnement de {s}', 'Maintenabilité de {s}', 'Compatibilité électromagnétique de {s}'],
  design: ['Architecture de {s}', 'Dimensionnement de {s}', 'Choix technologique pour {s}', 'Modes dégradés de {s}', 'Redondance de {s}', 'Interfaces matérielles de {s}', 'Budget de masse et de puissance de {s}', 'Plan de qualification de {s}'],
  interface: ['Interface électrique de {s}', 'Protocole d’échange avec {s}', 'Format des données de {s}', 'Interface mécanique de {s}', 'Interface thermique de {s}', 'Gestion des erreurs de {s}', 'Cadencement des échanges de {s}', 'Interface opérateur de {s}'],
  decision: ['Choix du fournisseur pour {s}', 'Arbitrage de performance sur {s}', 'Report de la qualification de {s}', 'Adoption d’une norme pour {s}', 'Abandon de la solution initiale de {s}', 'Mutualisation de {s}', 'Dérogation sur {s}', 'Gel de la conception de {s}'],
  action: ['Compléter le dossier de {s}', 'Lever la réserve sur {s}', 'Clarifier l’exigence portant sur {s}', 'Préparer la revue de {s}', 'Obtenir l’accord du client sur {s}', 'Mettre à jour le plan de test de {s}', 'Revoir l’analyse de risque de {s}', 'Planifier l’essai de {s}'],
  campaign: ['Campagne d’essais de {s}', 'Essais de réception de {s}', 'Essais en environnement de {s}', 'Essais d’intégration de {s}', 'Essais de robustesse de {s}', 'Recette usine de {s}', 'Essais de non-régression de {s}', 'Essais de bout en bout de {s}'],
  test: ['Vérifier le démarrage de {s}', 'Mesurer la performance de {s}', 'Injecter une panne sur {s}', 'Vérifier les limites de {s}', 'Tester le mode secours de {s}', 'Contrôler la journalisation de {s}', 'Vérifier le temps de réponse de {s}', 'Valider l’interface de {s}'],
  nonconformity: ['Écart de performance de {s}', 'Défaut d’assemblage de {s}', 'Mesure hors tolérance sur {s}', 'Document manquant pour {s}', 'Composant non conforme sur {s}', 'Écart de procédure sur {s}', 'Anomalie de configuration de {s}', 'Marquage incorrect de {s}'],
  change: ['Évolution du périmètre de {s}', 'Remplacement d’un composant de {s}', 'Modification de l’interface de {s}', 'Ajout d’un mode de {s}', 'Correction de la spécification de {s}', 'Changement de fournisseur pour {s}', 'Optimisation de {s}', 'Mise à niveau de {s}'],
  task: ['Rédiger la spécification de {s}', 'Réaliser la maquette de {s}', 'Intégrer {s}', 'Qualifier {s}', 'Documenter {s}', 'Préparer la revue de {s}', 'Corriger les écarts sur {s}', 'Livrer {s}'],
  risk: ['Retard de livraison de {s}', 'Obsolescence de composants de {s}', 'Performance insuffisante de {s}', 'Dépendance à un fournisseur unique pour {s}', 'Compétence rare sur {s}', 'Évolution réglementaire touchant {s}', 'Défaillance en service de {s}', 'Dépassement de coût sur {s}'],
  bug: ['{s} se bloque au démarrage', 'Mesure erronée sur {s}', '{s} ne respecte pas le délai', 'Fuite mémoire dans {s}', 'Message d’erreur incorrect pour {s}', 'Horodatage décalé sur {s}', 'Reprise impossible après coupure de {s}', 'Affichage tronqué pour {s}'],
  request: ['Demande d’évolution de {s}', 'Besoin de simulation pour {s}', 'Étude de faisabilité de {s}', 'Renouvellement de {s}', 'Extension de {s}', 'Mutualisation de {s}', 'Démonstrateur de {s}', 'Analyse de {s}'],
};
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fillTitle = (type, subject, i, project) => {
  const list = TITLES[type] ?? TITLES.task;
  return cap(list[i % list.length].replace('{s}', subject).replace(/\bde le\b/g, 'du').replace(/\bde les\b/g, 'des').replace(/\bà le\b/g, 'au').replace(/\bde l’([aeiouéh])/g, 'de l’$1').replace(/\bsur le\b/g, 'sur le')) + (i >= list.length ? ` (${project} ${i + 1})` : '');
};
const SENTENCES = {
  statement: (t) => `${t}. Le système doit satisfaire cette exigence dans les conditions nominales et dégradées décrites au dossier de définition ; elle est vérifiée par la méthode indiquée.`,
  description: (t) => `${t}. Constaté lors des activités en cours ; l’impact sur le planning et la qualité reste à confirmer en revue. Références : dossier de définition et compte rendu de réunion.`,
  procedure: (t) => `1. Mettre le banc dans sa configuration initiale. 2. Appliquer les stimuli définis pour « ${t} ». 3. Relever les mesures et les comparer aux critères d’acceptation. 4. Consigner le résultat.`,
  mitigation: (t) => `Plan de réduction : suivi hebdomadaire, solution de repli identifiée, point d’avancement en comité. Déclencheur : écart supérieur à deux semaines sur « ${t} ».`,
  response: (t) => `Réponse apportée à « ${t} » : prise en compte dans la prochaine version du document, justification jointe.`,
  root_cause: (t) => `Analyse des causes de « ${t} » : défaut de spécification en amont, détecté tardivement faute de test d’intégration.`,
};
const TEXTS = {
  reference: (n, p) => `${p}-REF-${String(n + 1).padStart(3, '0')}`, standard: (n) => ['ECSS-E-ST-10C', 'ECSS-Q-ST-80C', 'NF EN 9100', 'GAM-T-101', 'ISO 27001', 'MIL-STD-810H', 'STANAG 4586', 'ECSS-M-ST-10C'][n % 8],
  counterpart: (n) => ['Segment sol', 'Lanceur', 'Plateforme porteuse', 'Poste de commandement', 'Charge utile', 'Fournisseur', 'Client', 'Réseau opérationnel'][n % 8],
  requirement: (n, p) => `${p}-REQ-${String((n % 6) + 1).padStart(3, '0')}`, originator: (n) => ['Client', 'Direction technique', 'Qualité', 'Exploitation', 'Sécurité', 'Intégration'][n % 6],
  baseline: (n) => `BL-${(n % 3) + 1}`, review: (n) => ['SRR', 'PDR', 'CDR', 'QR', 'AR'][n % 5], affected_version: (n) => `0.${(n % 4) + 1}`, fixed_version: (n) => `0.${(n % 4) + 2}`, doc_uid: (n, p) => `${p}-DOC-${String(n + 10).padStart(4, '0')}`,
  detected_in: (n) => ['intégration', 'essais', 'revue', 'exploitation'][n % 4],
};

/** Valeur d'un champ pour le ticket numéro `n` du tracker (déterministe : mêmes données à chaque amorçage). */
function valueOf(field, n, ctx) {
  const k = field.key; const opts = field.config?.options;
  if (k === 'title') return ctx.title;
  if (k === 'export_control') return 'aucun'; // les marquages de contrôle export demandent des droits particuliers
  if (k === 'mention') return opts?.[0] ?? undefined;
  if (field.type === 'richtext') return (SENTENCES[k] ?? SENTENCES.description)(ctx.title);
  if (field.type === 'select' && Array.isArray(opts) && opts.length) return opts[(n * 3 + (k.length % 3)) % opts.length];
  if (field.type === 'user') return subs[people[(n + k.length) % people.length]];
  if (field.type === 'date') {
    if (k === 'start') return day(-40 + n * 6); if (k === 'due') return day(-12 + n * 9); // quelques retards, puis des échéances à venir
    if (k === 'review') return day(-20 + n * 14); return day(-30 + n * 7);
  }
  if (field.type === 'number') {
    if (k === 'probability') return (n % 5) + 1; if (k === 'impact') return ((n * 2) % 5) + 1; if (k === 'criticality') return ((n % 5) + 1) * (((n * 2) % 5) + 1);
    if (k === 'progress') return [100, 100, 80, 60, 40, 20, 0, 0][n % 8]; if (k === 'remaining') return [0, 0, 2, 5, 8, 12, 15, 20][n % 8]; if (k === 'points') return [1, 2, 3, 5, 8, 13, 3, 5][n % 8];
    return (n % 5) + 1;
  }
  if (field.type === 'text') return (TEXTS[k] ?? ((m, p) => `${cap(k.replace(/_/g, ' '))} ${p}-${m + 1}`))(n, ctx.project);
  return undefined;
}

// ------------------------------------------------------------------ membres : pm.dev est chef de chaque projet (il peut donc modifier le planning), les autres comptes y sont membres
const projects = ((await get('/v1/projects')) ?? []).map((p) => p.key);
log('membres des projets');
for (const project of projects) {
  await call(A, 'PUT', `/v1/projects/${project}/members/${subs.pm}`, { role: 'manager' });
  for (const who of ['user', 'qa', 'manager']) await call(A, 'PUT', `/v1/projects/${project}/members/${subs[who]}`, { role: 'member' });
}

// ------------------------------------------------------------------ tickets
const byProject = {}; // projet → tracker → { type, keys[], statuses }
let created = 0;
log(`tickets (${PER_TRACKER} par tracker)`);
for (const project of projects) {
  const domain = DOMAIN_OF[project] ?? 'generic';
  const subjectsList = DOMAINS[domain];
  const trackers = (await get(`/v1/projects/${project}/trackers`)) ?? [];
  byProject[project] = {};
  for (const [ti, t] of trackers.entries()) {
    const def = await get(`/v1/projects/${project}/trackers/${t.key}`); if (!def) continue;
    const have = ((await get(`/v1/projects/${project}/search?q=${encodeURIComponent(`tracker = ${t.key}`)}&limit=100&offset=0`)) ?? { hits: [] }).hits;
    const keys = have.map((h) => h.key);
    for (let n = have.length; n < PER_TRACKER; n++) {
      const subject = subjectsList[(n + ti) % subjectsList.length];
      const title = fillTitle(t.typeKey, subject, n, project);
      const values = {};
      for (const f of def.fields) { const v = valueOf(f, n, { title, project }); if (v !== undefined && v !== '') values[f.key] = v; }
      const made = await call(A, 'POST', `/v1/projects/${project}/trackers/${t.key}/artifacts`, { values });
      if (made.ok && made.data?.key) { keys.push(made.data.key); created++; }
    }
    byProject[project][t.key] = { type: t.typeKey, keys, def };
  }
}
console.log(`  ${created} ticket(s) créé(s)`);

// ------------------------------------------------------------------ statuts répartis le long du workflow
log('statuts');
let moved = 0;
for (const [project, trackers] of Object.entries(byProject)) {
  for (const [tk, info] of Object.entries(trackers)) {
    const forward = (info.def.transitions ?? []).map((x) => x.name).filter((nm) => !/rouvr|reopen/i.test(nm));
    if (forward.length === 0) continue;
    const tickets = (await get(`/v1/projects/${project}/search?q=${encodeURIComponent(`tracker = ${tk}`)}&limit=100&offset=0`))?.hits ?? [];
    for (const [i, h] of tickets.entries()) {
      if (h.category !== 'todo' && h.status !== info.def.statuses?.[0]?.key) continue; // déjà avancé
      const steps = i % (forward.length + 1); let version = h.version;
      for (const name of forward.slice(0, steps)) {
        const r = await call(A, 'POST', `/v1/projects/${project}/artifacts/${h.key}/transitions`, { name, version });
        if (!r.ok) break; version = r.data?.version ?? version + 1; moved++;
      }
    }
  }
}
console.log(`  ${moved} transition(s)`);

// ------------------------------------------------------------------ liens de traçabilité
log('liens');
const PAIRS = [['task', 'satisfies', 'requirement'], ['design', 'satisfies', 'requirement'], ['interface', 'refines', 'requirement'], ['test', 'verifies', 'requirement'], ['campaign', 'verifies', 'requirement'], ['task', 'implements', 'design']];
let linked = 0;
for (const [project, trackers] of Object.entries(byProject)) {
  const ofType = (type) => Object.values(trackers).filter((x) => x.type === type).flatMap((x) => x.keys);
  for (const [from, type, to] of PAIRS) {
    const sources = ofType(from); const targets = ofType(to); if (!sources.length || !targets.length) continue;
    for (const [i, s] of sources.slice(0, 10).entries()) { const r = await call(A, 'POST', `/v1/projects/${project}/artifacts/${s}/links`, { to: targets[i % targets.length], type }); if (r.status === 201 || r.status === 200) linked++; }
  }
  const tasks = ofType('task');
  for (let i = 0; i + 1 < Math.min(tasks.length, 6); i += 2) { const r = await call(A, 'POST', `/v1/projects/${project}/artifacts/${tasks[i]}/links`, { to: tasks[i + 1], type: 'blocks' }); if (r.ok) linked++; }
}
console.log(`  ${linked} lien(s)`);

// ------------------------------------------------------------------ commentaires
log('commentaires');
const REMARKS = ['Point validé en réunion, je mets à jour le dossier.', 'Il manque une référence : peux-tu la compléter ?', 'Risque identifié sur le planning, voir avec le fournisseur.', 'OK pour moi, en attente de la revue.', 'Résultat des essais joint, écart dans la tolérance.', 'À reprendre après la prochaine baseline.', 'Décision prise : on garde la solution actuelle.'];
let commented = 0;
for (const [project, trackers] of Object.entries(byProject)) {
  for (const info of Object.values(trackers)) {
    for (const [i, key] of info.keys.entries()) {
      if (i % 3 !== 0) continue;
      const existing = await get(`/v1/projects/${project}/artifacts/${key}/comments`);
      if (Array.isArray(existing) ? existing.length > 0 : (existing?.items?.length ?? 0) > 0) continue;
      for (let c = 0; c < 1 + (i % 2); c++) { const who = people[(i + c) % people.length]; const r = await call(who, 'POST', `/v1/projects/${project}/artifacts/${key}/comments`, { body: REMARKS[(i + c * 3) % REMARKS.length] }); if (r.ok) commented++; }
    }
  }
}
console.log(`  ${commented} commentaire(s)`);

// ------------------------------------------------------------------ sprints, versions, baselines, recherches
log('sprints, versions, baselines, recherches');
const pending = []; // baselines refusées tant que l'historique GitLab n'a pas rattrapé les événements (relancer le script plus tard)
for (const [project, trackers] of Object.entries(byProject)) {
  const tasks = Object.values(trackers).filter((x) => x.type === 'task' || x.type === 'bug').flatMap((x) => x.keys);
  const all = Object.values(trackers).flatMap((x) => x.keys);
  if (tasks.length >= 4) {
    const sprints = (await get(`/v1/projects/${project}/sprints`)) ?? [];
    if (sprints.length < 3) {
      const plan = [['Sprint de cadrage', -42, -29, 'closed', 0], ['Sprint de consolidation', -28, -15, 'closed', 1], ['Sprint en cours', -7, 6, 'active', 2], ['Sprint suivant', 7, 20, 'planned', 3]];
      for (const [name, from, to, state, slot] of plan.slice(sprints.length)) {
        const made = await call(A, 'POST', `/v1/projects/${project}/sprints`, { name: `${name} (${project})`, goal: `Objectif : ${name.toLowerCase()}`, startsOn: day(from), endsOn: day(to) });
        const id = made.data?.id; if (!id) continue;
        for (const key of tasks.slice(slot * 2, slot * 2 + 3)) await call(A, 'POST', `/v1/projects/${project}/sprints/${id}/items`, { artifact: key });
        if (state !== 'planned') await call(A, 'POST', `/v1/projects/${project}/sprints/${id}/start`);
        if (state === 'closed') await call(A, 'POST', `/v1/projects/${project}/sprints/${id}/close`, {});
      }
    }
  }
  const releases = (await get(`/v1/projects/${project}/roadmap`)) ?? [];
  if (all.length >= 6 && releases.length < 3) {
    for (const [i, [name, from, to, publish]] of [['v1.0', -90, -30, true], ['v1.1', -29, 20, false], ['v2.0', 21, 120, false]].entries()) {
      if (i < releases.length) continue;
      const made = await call(A, 'POST', `/v1/projects/${project}/releases`, { name: `${name} (${project})`, startsOn: day(from), endsOn: day(to) });
      const id = made.data?.id; if (!id) continue;
      for (const key of all.slice(i * 4, i * 4 + 5)) await call(A, 'POST', `/v1/projects/${project}/releases/${id}/items`, { artifact: key });
      if (publish) await call(A, 'POST', `/v1/projects/${project}/releases/${id}/publish`);
    }
  }
  const baselines = (await get(`/v1/projects/${project}/baselines`)) ?? [];
  if (all.length >= 6 && Array.isArray(baselines) && baselines.length === 0) {
    const made = await call(A, 'POST', `/v1/projects/${project}/baselines`, { name: 'BL-initiale' });
    if (made.status === 409) pending.push(project);
  }
  const filters = (await get(`/v1/projects/${project}/filters`)) ?? [];
  if (Array.isArray(filters) && filters.length === 0 && all.length) {
    await call(A, 'POST', `/v1/projects/${project}/filters`, { name: 'Mes tickets ouverts', query: 'assignee = currentUser() AND category != done', shared: false });
    await call(A, 'POST', `/v1/projects/${project}/filters`, { name: 'En retard', query: 'late() ORDER BY dueDate', shared: true });
    await call(A, 'POST', `/v1/projects/${project}/filters`, { name: 'Risques critiques', query: 'type = risk AND criticality >= 12', shared: true });
  }
}

if (pending.length) console.log(`  baselines en attente (historique GitLab en retard) : ${pending.join(', ')} ; relancez ce script quand le worker aura rattrapé`);
console.log(issues.size === 0 ? 'Données de démonstration amorcées sans incident.' : `Données de démonstration amorcées, appels refusés :\n  ${[...issues].slice(0, 40).map(([k, n]) => `${n} × ${k}`).join('\n  ')}`);
