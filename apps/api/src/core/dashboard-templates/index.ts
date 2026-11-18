import type { TemplateInputData, TemplateTab, TemplateWidget } from '../dashboard-template';

/**
 * Gabarits de tableaux de bord livrés avec Athena (lot 27, ADR-0010), validés à la revue du 2026-11-18. Ils ne se modifient pas : l'administrateur
 * les masque ou les duplique. Les cartes n'ont ni identifiant, ni position, ni clé de projet : la taille vient du genre, la place est la première libre
 * et la cible se résout à l'application. Favoris et Récents n'y figurent pas (R1).
 */
type Def = Omit<TemplateInputData, 'natures' | 'projectRoles' | 'description'> & { description: string; natures?: TemplateInputData['natures']; projectRoles?: TemplateInputData['projectRoles'] };
export interface BuiltinDashboardTemplate extends Omit<TemplateInputData, 'key'> { key: string }

const w = (kind: TemplateWidget['kind'], extra: Partial<TemplateWidget> = {}): TemplateWidget => ({ kind, ...extra });
const search = (title: string, query: string, extra: Partial<TemplateWidget> = {}): TemplateWidget => w('search', { title, query, ...extra });
const chart = (title: string, query: string, field: string, form: 'donut' | 'bars', extra: Partial<TemplateWidget> = {}): TemplateWidget => w('chart', { title, query, field, form, ...extra });
const each = (kind: TemplateWidget['kind'], repeat: 'project' | 'portfolio', extra: Partial<TemplateWidget> = {}): TemplateWidget => w(kind, { repeat, ...extra });
const tab = (name: string, ...widgets: TemplateWidget[]): TemplateTab => ({ name, widgets });

const MINE = 'assignee = currentUser() AND category != done';
const LATE = 'late() ORDER BY dueDate';
const CRITICAL = 'critical() AND category != done ORDER BY startDate';
const ALL_ROLES = ['athena-admin', 'athena-pmo', 'athena-director', 'athena-pm', 'athena-manager', 'athena-finance', 'athena-qa', 'athena-team-member'] as const;
const UNVERIFIED = 'type = requirement AND notLinked("verifies")';

const DEFS: Record<string, Def> = {
  // ------------------------------------------------------------------ Mon travail
  'home-essentiel': { type: 'home', name: 'Essentiel', description: 'Le point de départ le plus simple : mes tickets, mes échéances, ce que j’ai à approuver et mes mentions.', roles: [...ALL_ROLES],
    tabs: [tab('Mon travail', search('Mes tickets', `${MINE} ORDER BY dueDate`), search('Échéances de la semaine', `${MINE} AND due <= daysFromNow(7)`), w('approvals'), w('mentions'))] },
  'home-contributeur': { type: 'home', name: 'Contributeur', description: 'Ce que je dois faire, ce qui me bloque, ce que je peux prendre.', roles: ['athena-team-member'],
    tabs: [
      tab('Aujourd’hui', search('Mes tâches en retard', 'assignee = currentUser() AND late()'), search('Mes tickets', `${MINE} ORDER BY dueDate`), search('Échéances de la semaine', `${MINE} AND due <= daysFromNow(7)`),
        search('Mes anomalies', `type = bug AND ${MINE}`), w('mentions'), w('approvals')),
      tab('À prendre', search('Tickets libres dans mes projets', 'assignee IS EMPTY AND category = todo ORDER BY priority DESC'), search('Mes tickets bloqués', 'assignee = currentUser() AND blocked()'),
        chart('Mes tickets par statut', MINE, 'status', 'donut')),
    ] },
  'home-chef-de-projet': { type: 'home', name: 'Chef de projet', description: 'Les alertes de mes projets d’abord, puis la santé de chacun, la configuration et mon propre travail.', roles: ['athena-pm'],
    tabs: [
      tab('Alertes', search('En retard', LATE), search('Chemin critique', CRITICAL), search('Bloqués', 'blocked() AND category != done'), search('Risques ouverts', 'type = risk AND category != done ORDER BY criticality DESC'), w('approvals'), w('mentions')),
      tab('Mes projets', each('health', 'project'), each('global-progress', 'project'), each('phase-gate', 'project')),
      tab('Configuration', search('Demandes de modification ouvertes', 'type = change AND category != done'), search('Non-conformités ouvertes', 'type = nonconformity AND category != done'),
        search('Exigences non vérifiées', UNVERIFIED), search('Liens suspects', 'suspect()')),
      tab('Mon travail', search('Mes tickets', `${MINE} ORDER BY dueDate`), search('Échéances de la semaine', `${MINE} AND due <= daysFromNow(7)`)),
    ] },
  'home-pmo': { type: 'home', name: 'PMO', description: 'Tous les portefeuilles d’un coup d’œil, puis ce qui demande un arbitrage.', roles: ['athena-pmo'],
    tabs: [
      tab('Portefeuilles', each('portfolio-tiles', 'portfolio'), each('portfolio-health', 'portfolio')),
      tab('Arbitrages', each('portfolio-gates', 'portfolio'), each('portfolio-requests', 'portfolio'), w('approvals')),
      tab('Ressources et finances', w('capacity'), each('portfolio-finance', 'portfolio')),
      tab('Risques et retards', each('risk-matrix', 'portfolio'), search('Jalons en retard', 'late() AND type = task ORDER BY dueDate'), search('Changements en attente', 'type = change AND category = todo')),
    ] },
  'home-directeur': { type: 'home', name: 'Directeur', description: 'Synthèse et décisions, sans liste de tickets.', roles: ['athena-director'],
    tabs: [
      tab('Synthèse', each('portfolio-tiles', 'portfolio')),
      tab('Décisions', each('portfolio-gates', 'portfolio'), each('portfolio-requests', 'portfolio'), w('approvals')),
      tab('Finances et risques', each('portfolio-finance', 'portfolio'), each('risk-matrix', 'portfolio')),
    ] },
  'home-responsable-equipe': { type: 'home', name: 'Responsable d’équipe', description: 'Charge de l’équipe, travail non affecté et flux de mes projets.', roles: ['athena-manager'],
    tabs: [
      tab('Équipe', w('capacity'), search('Tickets libres', 'assignee IS EMPTY AND category = todo ORDER BY priority DESC'), search('En retard', LATE)),
      tab('Flux', each('flow', 'project'), each('activity', 'project')),
      tab('Mon travail', search('Mes tickets', MINE), w('approvals'), w('mentions')),
    ] },
  'home-assurance-produit': { type: 'home', name: 'Assurance produit', description: 'Visas à donner, écarts à suivre, preuves de vérification.', roles: ['athena-qa'],
    tabs: [
      tab('Visas', w('approvals'), w('mentions')),
      tab('Écarts', search('Non-conformités ouvertes', 'type = nonconformity AND category != done ORDER BY criticality DESC'), search('Actions et RID ouverts', 'type = action AND category != done ORDER BY dueDate'),
        search('Dérogations en cours', 'type = decision AND category != done'), chart('Non-conformités par statut', 'type = nonconformity', 'status', 'bars')),
      tab('Vérification', search('Exigences non vérifiées', UNVERIFIED), search('Liens suspects', 'suspect()'), each('quality', 'project')),
    ] },
  'home-finance': { type: 'home', name: 'Finance', description: 'Budgets et écarts, sans le bruit des tickets.', roles: ['athena-finance'],
    tabs: [tab('Portefeuilles', each('portfolio-finance', 'portfolio')), tab('Projets', each('project-finance', 'project')), tab('À traiter', w('approvals'), w('mentions'))] },
  'home-administrateur': { type: 'home', name: 'Administrateur', description: 'L’état de la plateforme, puis mon propre travail.', roles: ['athena-admin'],
    tabs: [tab('Plateforme', w('platform-ops')), tab('Mon travail', search('Mes tickets', MINE), w('approvals'), w('mentions'))] },

  // ------------------------------------------------------------------ Vue d'ensemble d'un projet
  'project-chef': { type: 'project', name: 'Chef du projet', description: 'Piloter : synthèse, planning, risques, équipe et budget.', roles: ['athena-admin', 'athena-pmo', 'athena-pm'], projectRoles: ['manager'],
    tabs: [
      tab('Synthèse', w('general-info'), w('health'), w('key-indicators'), w('global-progress')),
      tab('Planning', search('En retard', LATE), search('Chemin critique', CRITICAL), w('release'), w('phase-gate')),
      tab('Risques et écarts', w('risk-matrix'), search('Non-conformités ouvertes', 'type = nonconformity AND category != done'), search('Demandes de modification', 'type = change AND category != done')),
      tab('Équipe et budget', search('Tickets libres', 'assignee IS EMPTY AND category = todo'), w('tracker-status'), w('capacity'), w('project-finance')),
    ] },
  'project-membre': { type: 'project', name: 'Membre du projet', description: 'Mon travail dans ce projet, puis le contexte.', roles: ['athena-team-member', 'athena-manager', 'athena-qa', 'athena-pm'], projectRoles: ['member'],
    tabs: [
      tab('Mon travail ici', search('Mes tickets', `${MINE} ORDER BY dueDate`), search('Échéances de la semaine', `${MINE} AND due <= daysFromNow(7)`), search('Tickets libres', 'assignee IS EMPTY AND category = todo'), w('mentions')),
      tab('Le projet', w('general-info'), w('sprint-progress'), w('release'), w('trackers')),
    ] },
  'project-lecteur': { type: 'project', name: 'Lecteur du projet', description: 'Comprendre l’état du projet en une minute, sans liste à rallonge.', roles: ['athena-admin', 'athena-pmo', 'athena-director'], projectRoles: ['reader'],
    tabs: [tab('Synthèse', w('general-info'), w('health'), w('global-progress'), w('phase-gate'), w('project-finance'), w('risk-matrix'))] },
  'project-assurance-produit': { type: 'project', name: 'Assurance produit du projet', description: 'Conformité du projet : écarts, dérogations, actions, vérification.', roles: ['athena-qa'],
    tabs: [tab('Conformité', search('Non-conformités', 'type = nonconformity AND category != done ORDER BY criticality DESC'), search('Dérogations', 'type = decision AND category != done'), search('Actions et RID', 'type = action AND category != done'),
      search('Exigences non vérifiées', UNVERIFIED), search('Liens suspects', 'suspect()'), w('quality'))] },
  'project-revues-ecss': { type: 'project', name: 'Revues ECSS', description: 'Préparer et solder les revues SRR, PDR, CDR, QR et AR.', roles: ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-qa'], natures: ['space-software', 'space-project'],
    tabs: [tab('Revues ECSS', w('phase-gate'), chart('RID ouverts par revue', 'type = action AND category != done', 'review', 'bars'), chart('Non-conformités par statut', 'type = nonconformity', 'status', 'donut'),
      search('RFD / RFW en cours', 'type = decision AND category != done'), search('Anomalies logicielles ouvertes', 'type = bug AND category != done ORDER BY priority DESC'))] },
  'project-jalons-im1618': { type: 'project', name: 'Jalons IM 1618', description: 'Suivre les stades et jalons de l’opération d’armement.', roles: ['athena-admin', 'athena-pmo', 'athena-director', 'athena-pm'], natures: ['armament'],
    tabs: [tab('Jalons IM 1618', w('phase-gate'), w('roadmap'), w('risk-matrix'), search('Décisions en attente', 'type = decision AND category != done'), w('project-finance'))] },
  'project-aqap': { type: 'project', name: 'AQAP', description: 'Faits techniques, dérogations, recette et exigences client.', roles: ['athena-admin', 'athena-pm', 'athena-qa'], natures: ['defense-software'],
    tabs: [tab('AQAP', search('Faits techniques ouverts', 'type = nonconformity AND category != done ORDER BY criticality DESC'), search('Dérogations et concessions', 'type = decision AND category != done'),
      search('PV de recette en cours', 'type = campaign AND category != done'), search('Exigences client non vérifiées', UNVERIFIED))] },
  'project-agilite': { type: 'project', name: 'Agilité', description: 'Rythme des sprints et santé de l’intégration continue.', roles: ['athena-admin', 'athena-pm', 'athena-team-member'], natures: ['generic', 'space-software', 'defense-software'], projectRoles: ['manager', 'member'],
    tabs: [tab('Agilité', w('sprint-progress'), w('velocity'), w('flow'), w('release'), w('pipelines'), w('quality'), w('badges'))] },

  // ------------------------------------------------------------------ Avancement d'un projet
  'progress-iteratif': { type: 'progress', name: 'Itératif (agile)', description: 'L’avancement par sprints et versions : tickets, flux, vélocité, activité.', roles: ['athena-admin', 'athena-pm', 'athena-team-member'], natures: ['generic', 'space-software', 'defense-software'], projectRoles: ['manager', 'member'],
    tabs: [tab('Sprints', w('indicators'), w('release'), w('flow'), w('tracker-status'), w('velocity'), w('activity'))] },
  'progress-cycle-v': { type: 'progress', name: 'Cycle en V normatif', description: 'Avancer, c’est couvrir les exigences, vérifier et passer les revues.', roles: ['athena-admin', 'athena-pmo', 'athena-director', 'athena-pm', 'athena-qa'], natures: ['space-software', 'space-project', 'defense-software', 'armament'],
    tabs: [
      tab('Couverture', w('key-indicators'), chart('Exigences par statut', 'type = requirement', 'status', 'donut'), chart('Tests par statut', 'type = test', 'status', 'donut'), search('Exigences non vérifiées', UNVERIFIED)),
      tab('Revues', w('phase-gate'), chart('Actions de revue par statut', 'type = action', 'status', 'bars'), chart('Non-conformités par statut', 'type = nonconformity', 'status', 'bars')),
      tab('Planning', w('global-progress'), w('roadmap'), search('En retard', LATE)),
    ] },
  'progress-code': { type: 'progress', name: 'Ingénierie logicielle', description: 'Le code : pipelines, qualité, anomalies.', roles: ['athena-admin', 'athena-pm', 'athena-team-member', 'athena-qa'], natures: ['generic', 'space-software', 'defense-software'],
    tabs: [tab('Code', w('pipelines'), w('quality'), w('badges'), chart('Anomalies par sévérité', 'type = bug AND category != done', 'severity', 'bars'), search('Anomalies prioritaires', 'type = bug AND priority = high AND category != done'))] },

  // ------------------------------------------------------------------ Portefeuille
  'portfolio-pmo': { type: 'portfolio', name: 'Pilotage PMO', description: 'Toutes les vues du portefeuille, une par onglet.', roles: ['athena-admin', 'athena-pmo'],
    tabs: [
      tab('Santé', w('portfolio-tiles'), w('portfolio-health')), tab('Planning', w('roadmap'), w('portfolio-gates')), tab('Ressources', w('capacity')), tab('Finances', w('portfolio-finance')),
      tab('Risques', w('risk-matrix'), search('Risques critiques', 'type = risk AND category != done ORDER BY criticality DESC')), tab('Demandes', w('portfolio-requests')),
    ] },
  'portfolio-direction': { type: 'portfolio', name: 'Revue de direction', description: 'Pour la revue de portefeuille : état, arbitrages et finances.', roles: ['athena-director'],
    tabs: [tab('Synthèse', w('portfolio-tiles'), w('portfolio-health')), tab('Arbitrages', w('portfolio-gates'), w('portfolio-requests'), w('risk-matrix')), tab('Finances', w('portfolio-finance'))] },
  'portfolio-finance': { type: 'portfolio', name: 'Contrôle financier', description: 'Le portefeuille vu par la finance, projet par projet.', roles: ['athena-finance'],
    tabs: [tab('Finances', w('portfolio-finance'), w('portfolio-tiles')), tab('Projets', each('project-finance', 'project'))] },
};

export const BUILTIN_DASHBOARD_TEMPLATES: readonly BuiltinDashboardTemplate[] = Object.entries(DEFS).map(([key, d]) => ({ ...d, key, natures: d.natures ?? [], projectRoles: d.projectRoles ?? [] }));
export const builtinDashboardTemplate = (key: string): BuiltinDashboardTemplate | undefined => BUILTIN_DASHBOARD_TEMPLATES.find((t) => t.key === key);
