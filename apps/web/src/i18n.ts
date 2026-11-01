/**
 * Textes de l'interface, en français et en anglais. Ton factuel : pas de point d'exclamation, pas de formule d'excuse.
 * `fr` est un accès aux textes de la langue courante (nom conservé pour les importations existantes).
 */
import { useSyncExternalStore } from 'react';

const frDict = {
  loading: 'Chargement…',
  language: 'English',
  nav: { projects: 'Projets', search: 'Recherche', dashboard: 'Tableau de bord', admin: 'Administration', logout: 'Déconnexion', palette: 'Commandes', work: 'Mon travail', manage: 'Gestion de projet', organization: 'Organisation' },
  projects: { eyebrow: 'Mission console', title: 'Projets', empty: 'Aucun projet.', emptyEyebrow: 'Aucun résultat', trackers: 'Trackers', boards: 'Boards', trackerName: 'Tracker', artifacts: 'Artefacts', attributes: 'Attributs', noTracker: 'Aucun tracker.', noAttribute: 'Aucun attribut.' },
  list: {
    eyebrow: 'Recherche', placeholder: 'Requête ATQL, par exemple status = open AND severity = majeure', run: 'Rechercher',
    key: 'Clé', title: 'Titre', status: 'Statut', tracker: 'Tracker', updated: 'Mis à jour', total: (n: number) => `${n} résultat${n > 1 ? 's' : ''}`,
    empty: 'Aucun artefact ne correspond à la requête.', emptyEyebrow: 'Aucun résultat', reset: 'Réinitialiser',
    previous: 'Précédent', next: 'Suivant', create: 'Nouvel artefact',
    suggestions: 'Suggestions', filters: 'Filtres enregistrés', noFilter: 'Aucun', saveFilter: 'Enregistrer', filterName: 'Nom du filtre', shareFilter: 'Partagé', filterSaved: 'Filtre enregistré.', deleteFilter: 'Supprimer le filtre',
  },
  create: { title: 'Nouvel artefact', tracker: 'Tracker', submit: 'Créer', cancel: 'Annuler', created: (key: string) => `${key} créé.`, noTracker: 'Aucun tracker disponible.' },
  artifact: {
    details: 'Détails', links: 'Liens', history: 'Historique', activity: 'Commentaires', development: 'Développement',
    transitions: 'Transitions', save: 'Enregistrer', saved: 'Modification enregistrée.', comment: 'Commentaire', addComment: 'Ajouter',
    attachments: 'Pièces jointes', noAttachments: 'Aucune pièce jointe.', upload: 'Ajouter un fichier', download: 'Télécharger', removeAttachment: 'Supprimer', uploaded: 'Fichier ajouté.', removedAttachment: 'Pièce jointe supprimée.',
    noHistory: 'Aucune révision.', noLinks: 'Aucun lien.', noComments: 'Aucun commentaire.', noCode: 'Aucune référence de code.', noDocs: 'Aucune exigence liée.',
    suspect: 'Suspect', commit: 'Commit', docs: 'Documentation liée', transitioned: (name: string) => `Transition « ${name} » appliquée.`,
    required: 'obligatoire', version: 'Version', author: 'Auteur', date: 'Date', changes: 'Modifications', type: 'Type', reference: 'Référence', titleCol: 'Titre', state: 'État', pipeline: 'Pipeline', absent: 'absente',
    restore: 'Restaurer', restored: (v: number) => `Révision ${v} restaurée.`,
  },
  board: { eyebrow: 'Board', moveTo: 'Déplacer vers', unmapped: (n: number) => `${n} artefact(s) hors colonnes`, wip: 'Limite WIP', laneBy: 'Couloirs', laneNone: 'Aucun', laneAssignee: 'Responsable', laneTracker: 'Tracker', noAssignee: 'Non assigné', moved: 'Carte déplacée.', empty: 'Aucune carte.' },
  dashboard: {
    eyebrow: 'Pilotage', title: 'Tableau de bord', todo: 'À faire', inProgress: 'En cours', done: 'Terminés', open: 'Ouverts', total: 'Total',
    flow: 'Flux des 7 derniers jours', velocity: 'Vélocité', forecast: 'Prévision du prochain sprint', points: 'points', roadmap: 'Roadmap', noSprint: 'Aucun sprint clos.', noRelease: 'Aucune release.',
    extensions: 'Extensions', distribution: 'Répartition', recent: 'Activité récente', committed: 'Engagé', completed: 'Terminé',
  },
  config: {
    eyebrow: 'Configuration', title: 'Configuration du tracker', fields: 'Champs', statuses: 'Statuts', transitions: 'Transitions',
    key: 'Clé', label: 'Libellé', type: 'Type', required: 'Obligatoire', category: 'Catégorie', name: 'Nom', from: 'Depuis', to: 'Vers', anyState: 'Tout état', add: 'Ajouter',
    historyMode: 'Écriture de l’historique', historyDirect: 'Directe (branche principale)', historyMr: 'Par merge request (revue)', readRoles: 'Rôles en lecture (virgules)', writeRoles: 'Rôles en écriture (virgules)', roles: 'Rôles', everyone: 'Tous', allowedRoles: 'Rôles autorisés (virgules, vide : tous)', remove: 'Supprimer', confirmPurge: (n: string, count = 0) => `Le champ ${n} contient des valeurs${count ? ` (${count} artefact${count > 1 ? 's' : ''})` : ''}. Les supprimer définitivement des artefacts ?`, removed: 'Champ supprimé.',
    workflow: 'Workflow', workflowHelp: 'Cliquez sur un statut de départ, puis sur un statut d’arrivée pour créer une transition. Les flèches en pointillés partent de « Tout état ».', anyStateNode: 'Tout état', pickTarget: (from: string) => `Départ : ${from}. Choisissez le statut d’arrivée.`, newTransition: (from: string, to: string) => `Nouvelle transition ${from} → ${to}`, cancel: 'Annuler',
    added: 'Configuration enregistrée.', schemaNote: 'Chaque modification incrémente la version du schéma et est versionnée dans Git.', adminOnly: 'Réservé aux administrateurs.',
  },
  admin: {
    eyebrow: 'Administration', title: 'Administration', webhooks: 'Webhooks', automations: 'Automatisations', plugins: 'Plugins', baselines: 'Baselines',
    url: 'URL HTTPS', events: 'Événements (séparés par des virgules)', create: 'Créer', secret: 'Secret de signature (affiché une seule fois)', empty: 'Aucun élément.',
    enable: 'Activer', disable: 'Désactiver', active: 'Actif', inactive: 'Inactif', baselineName: 'Nom de la baseline', createdBaseline: (n: string) => `Baseline ${n} créée.`,
    createdWebhook: 'Webhook créé.', toggled: 'État modifié.', trigger: 'Déclencheur',
  },
  work: { eyebrow: 'Traitement', title: 'Mon travail', assigned: 'Assignés à moi', available: 'À prendre', take: 'Prendre', taken: (k: string) => `${k} vous est assigné.`, none: 'Rien à traiter.', project: 'Projet' },
  org: {
    eyebrow: 'Organisation', title: 'Administration de l’organisation', projects: 'Projets', users: 'Utilisateurs', plugins: 'Plugins',
    templates: 'Templates', template: 'Template du projet', noTemplate: 'Projet vide', templateKey: 'Clé du template (minuscules)', templateName: 'Nom du template', templateDescription: 'Description', fromProject: 'Reprendre les trackers du projet', pickTrackers: 'Trackers à inclure', createTemplate: 'Créer le template', templateCreated: 'Template créé.', deleteTemplate: 'Supprimer', templateDeleted: 'Template supprimé.', builtin: 'Livré', trackersCount: 'Trackers', attributes: 'Attributs',
    projectKey: 'Clé du projet (2 à 10 majuscules)', projectName: 'Nom du projet', createProject: 'Créer le projet', projectCreated: (k: string) => `Projet ${k} créé.`,
    managers: 'Chefs de projet', assignManager: 'Nommer chef de projet', chooseUser: 'Choisir un compte', noManager: 'Aucun chef de projet', revoke: 'Retirer', managerSet: 'Chef de projet nommé.', managerRemoved: 'Chef de projet retiré.',
    username: 'Identifiant', displayName: 'Nom', email: 'Courriel', usersNote: 'Comptes ayant déjà ouvert une session dans Athena.',
    install: 'Installer un plugin', packageJson: 'Paquet signé (JSON : manifest, code, signature)', grants: 'Permissions accordées', installAction: 'Installer', installed: 'Plugin installé.', uninstall: 'Désinstaller', uninstalled: 'Plugin désinstallé.', badPackage: 'Le paquet n’est pas un JSON valide.',
  },
  manage: {
    eyebrow: 'Gestion de projet', title: 'Gestion du projet', actors: 'Acteurs', sprints: 'Sprints', releases: 'Versions', boards: 'Boards',
    addActor: 'Ajouter l’acteur', role: 'Rôle', manager: 'Chef de projet', member: 'Membre', removeActor: 'Retirer', actorSet: 'Acteur enregistré.', actorRemoved: 'Acteur retiré.', restricted: 'Réservé aux chefs de projet et aux administrateurs.',
    sprintName: 'Nom du sprint', goal: 'Objectif', starts: 'Début', ends: 'Fin', createSprint: 'Créer le sprint', start: 'Démarrer', close: 'Clore', state: 'État', saved: 'Enregistré.',
    releaseName: 'Nom de la version', createRelease: 'Créer la version', publish: 'Publier',
    boardKey: 'Clé du board (minuscules)', boardName: 'Nom du board', boardTracker: 'Tracker', boardColumns: 'Colonnes (une par ligne : nom=statut1,statut2|limite WIP)', createBoard: 'Créer le board',
  },
  palette: { title: 'Commandes', placeholder: 'Aller à… ou rechercher un artefact', none: 'Aucun résultat.', projects: 'Projets', artifacts: 'Artefacts', goto: 'Aller à' },
  errors: {
    generic: 'Une erreur est survenue. Réessayez.', notFoundTitle: 'Page introuvable', notFoundEyebrow: 'Erreur 404', notFound: 'Cette adresse ne correspond à aucune page.',
    unavailableEyebrow: 'Connexion', unavailable: 'Authentification indisponible.',
  },
};

export type Dictionary = typeof frDict;

const enDict: Dictionary = {
  loading: 'Loading…',
  language: 'Français',
  nav: { projects: 'Projects', search: 'Search', dashboard: 'Dashboard', admin: 'Administration', logout: 'Sign out', palette: 'Commands', work: 'My work', manage: 'Project management', organization: 'Organization' },
  projects: { eyebrow: 'Mission console', title: 'Projects', empty: 'No project.', emptyEyebrow: 'No result', trackers: 'Trackers', boards: 'Boards', trackerName: 'Tracker', artifacts: 'Artifacts', attributes: 'Attributes', noTracker: 'No tracker.', noAttribute: 'No attribute.' },
  list: {
    eyebrow: 'Search', placeholder: 'ATQL query, for example status = open AND severity = major', run: 'Search',
    key: 'Key', title: 'Title', status: 'Status', tracker: 'Tracker', updated: 'Updated', total: (n: number) => `${n} result${n > 1 ? 's' : ''}`,
    empty: 'No artifact matches the query.', emptyEyebrow: 'No result', reset: 'Reset',
    previous: 'Previous', next: 'Next', create: 'New artifact',
    suggestions: 'Suggestions', filters: 'Saved filters', noFilter: 'None', saveFilter: 'Save', filterName: 'Filter name', shareFilter: 'Shared', filterSaved: 'Filter saved.', deleteFilter: 'Delete filter',
  },
  create: { title: 'New artifact', tracker: 'Tracker', submit: 'Create', cancel: 'Cancel', created: (key: string) => `${key} created.`, noTracker: 'No tracker available.' },
  artifact: {
    details: 'Details', links: 'Links', history: 'History', activity: 'Comments', development: 'Development',
    transitions: 'Transitions', save: 'Save', saved: 'Change saved.', comment: 'Comment', addComment: 'Add',
    attachments: 'Attachments', noAttachments: 'No attachment.', upload: 'Add a file', download: 'Download', removeAttachment: 'Delete', uploaded: 'File added.', removedAttachment: 'Attachment deleted.',
    noHistory: 'No revision.', noLinks: 'No link.', noComments: 'No comment.', noCode: 'No code reference.', noDocs: 'No linked requirement.',
    suspect: 'Suspect', commit: 'Commit', docs: 'Linked documentation', transitioned: (name: string) => `Transition "${name}" applied.`,
    required: 'required', version: 'Version', author: 'Author', date: 'Date', changes: 'Changes', type: 'Type', reference: 'Reference', titleCol: 'Title', state: 'State', pipeline: 'Pipeline', absent: 'missing',
    restore: 'Restore', restored: (v: number) => `Revision ${v} restored.`,
  },
  board: { eyebrow: 'Board', moveTo: 'Move to', unmapped: (n: number) => `${n} artifact(s) outside columns`, wip: 'WIP limit', laneBy: 'Swimlanes', laneNone: 'None', laneAssignee: 'Assignee', laneTracker: 'Tracker', noAssignee: 'Unassigned', moved: 'Card moved.', empty: 'No card.' },
  dashboard: {
    eyebrow: 'Overview', title: 'Dashboard', todo: 'To do', inProgress: 'In progress', done: 'Done', open: 'Open', total: 'Total',
    flow: 'Flow, last 7 days', velocity: 'Velocity', forecast: 'Next sprint forecast', points: 'points', roadmap: 'Roadmap', noSprint: 'No closed sprint.', noRelease: 'No release.',
    extensions: 'Extensions', distribution: 'Distribution', recent: 'Recent activity', committed: 'Committed', completed: 'Completed',
  },
  config: {
    eyebrow: 'Configuration', title: 'Tracker configuration', fields: 'Fields', statuses: 'Statuses', transitions: 'Transitions',
    key: 'Key', label: 'Label', type: 'Type', required: 'Required', category: 'Category', name: 'Name', from: 'From', to: 'To', anyState: 'Any state', add: 'Add',
    historyMode: 'History writes', historyDirect: 'Direct (main branch)', historyMr: 'Through merge request (review)', readRoles: 'Read roles (comma separated)', writeRoles: 'Write roles (comma separated)', roles: 'Roles', everyone: 'Everyone', allowedRoles: 'Allowed roles (comma separated, empty: everyone)', remove: 'Delete', confirmPurge: (n: string, count = 0) => `Field ${n} holds values${count ? ` (${count} artifact${count > 1 ? 's' : ''})` : ''}. Permanently remove them from artifacts?`, removed: 'Field deleted.',
    workflow: 'Workflow', workflowHelp: 'Click a source status, then a target status to create a transition. Dashed arrows start from “Any state”.', anyStateNode: 'Any state', pickTarget: (from: string) => `From: ${from}. Choose the target status.`, newTransition: (from: string, to: string) => `New transition ${from} → ${to}`, cancel: 'Cancel',
    added: 'Configuration saved.', schemaNote: 'Each change increments the schema version and is versioned in Git.', adminOnly: 'Administrators only.',
  },
  admin: {
    eyebrow: 'Administration', title: 'Administration', webhooks: 'Webhooks', automations: 'Automations', plugins: 'Plugins', baselines: 'Baselines',
    url: 'HTTPS URL', events: 'Events (comma separated)', create: 'Create', secret: 'Signing secret (shown once)', empty: 'Nothing here.',
    enable: 'Enable', disable: 'Disable', active: 'Active', inactive: 'Inactive', baselineName: 'Baseline name', createdBaseline: (n: string) => `Baseline ${n} created.`,
    createdWebhook: 'Webhook created.', toggled: 'State changed.', trigger: 'Trigger',
  },
  work: { eyebrow: 'Work', title: 'My work', assigned: 'Assigned to me', available: 'To pick up', take: 'Take', taken: (k: string) => `${k} is now assigned to you.`, none: 'Nothing to process.', project: 'Project' },
  org: {
    eyebrow: 'Organization', title: 'Organization administration', projects: 'Projects', users: 'Users', plugins: 'Plugins',
    templates: 'Templates', template: 'Project template', noTemplate: 'Empty project', templateKey: 'Template key (lowercase)', templateName: 'Template name', templateDescription: 'Description', fromProject: 'Reuse the trackers of project', pickTrackers: 'Trackers to include', createTemplate: 'Create template', templateCreated: 'Template created.', deleteTemplate: 'Delete', templateDeleted: 'Template deleted.', builtin: 'Built-in', trackersCount: 'Trackers', attributes: 'Attributes',
    projectKey: 'Project key (2 to 10 capitals)', projectName: 'Project name', createProject: 'Create project', projectCreated: (k: string) => `Project ${k} created.`,
    managers: 'Project managers', assignManager: 'Appoint project manager', chooseUser: 'Choose an account', noManager: 'No project manager', revoke: 'Remove', managerSet: 'Project manager appointed.', managerRemoved: 'Project manager removed.',
    username: 'Username', displayName: 'Name', email: 'Email', usersNote: 'Accounts that have already signed in to Athena.',
    install: 'Install a plugin', packageJson: 'Signed package (JSON: manifest, code, signature)', grants: 'Granted permissions', installAction: 'Install', installed: 'Plugin installed.', uninstall: 'Uninstall', uninstalled: 'Plugin uninstalled.', badPackage: 'The package is not valid JSON.',
  },
  manage: {
    eyebrow: 'Project management', title: 'Project management', actors: 'Actors', sprints: 'Sprints', releases: 'Releases', boards: 'Boards',
    addActor: 'Add actor', role: 'Role', manager: 'Project manager', member: 'Member', removeActor: 'Remove', actorSet: 'Actor saved.', actorRemoved: 'Actor removed.', restricted: 'Restricted to project managers and administrators.',
    sprintName: 'Sprint name', goal: 'Goal', starts: 'Start', ends: 'End', createSprint: 'Create sprint', start: 'Start', close: 'Close', state: 'State', saved: 'Saved.',
    releaseName: 'Release name', createRelease: 'Create release', publish: 'Publish',
    boardKey: 'Board key (lowercase)', boardName: 'Board name', boardTracker: 'Tracker', boardColumns: 'Columns (one per line: name=status1,status2|WIP limit)', createBoard: 'Create board',
  },
  palette: { title: 'Commands', placeholder: 'Go to… or search for an artifact', none: 'No result.', projects: 'Projects', artifacts: 'Artifacts', goto: 'Go to' },
  errors: {
    generic: 'An error occurred. Try again.', notFoundTitle: 'Page not found', notFoundEyebrow: 'Error 404', notFound: 'This address does not match any page.',
    unavailableEyebrow: 'Sign in', unavailable: 'Authentication unavailable.',
  },
};

export type Locale = 'fr' | 'en';
const dictionaries: Record<Locale, Dictionary> = { fr: frDict, en: enDict };

function initialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem('athena.locale');
    if (saved === 'fr' || saved === 'en') return saved;
  } catch { /* stockage indisponible */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

let current: Locale = initialLocale();
const listeners = new Set<() => void>();

export const getLocale = (): Locale => current;
export function setLocale(locale: Locale): void {
  current = locale;
  try { window.localStorage.setItem('athena.locale', locale); } catch { /* ignoré */ }
  document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}
/** Abonne un composant à la langue courante : il se redessine au changement. */
export function useLocale(): Locale {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getLocale, getLocale);
}

export const fr: Dictionary = new Proxy({} as Dictionary, { get: (_target, key) => (dictionaries[current] as unknown as Record<string | symbol, unknown>)[key] });
export const dictionaryFor = (locale: Locale): Dictionary => dictionaries[locale];
