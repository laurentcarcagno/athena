/**
 * Textes de l'interface, en français et en anglais. Ton factuel : pas de point d'exclamation, pas de formule d'excuse.
 * `fr` est un accès aux textes de la langue courante (nom conservé pour les importations existantes).
 */
import { useSyncExternalStore } from 'react';

const frDict = {
  loading: 'Chargement…',
  language: 'English',
  nav: { projects: 'Projets', search: 'Recherche', dashboard: 'Tableau de bord', admin: 'Administration', logout: 'Déconnexion', palette: 'Commandes' },
  projects: { eyebrow: 'Mission console', title: 'Projets', empty: 'Aucun projet.', emptyEyebrow: 'Aucun résultat', trackers: 'Trackers', boards: 'Boards' },
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
    historyMode: 'Écriture de l’historique', historyDirect: 'Directe (branche principale)', historyMr: 'Par merge request (revue)', readRoles: 'Rôles en lecture (virgules)', writeRoles: 'Rôles en écriture (virgules)', roles: 'Rôles', everyone: 'Tous', allowedRoles: 'Rôles autorisés (virgules, vide : tous)', remove: 'Supprimer', confirmPurge: (n: string) => `Le champ ${n} contient des valeurs. Les supprimer définitivement des artefacts ?`, removed: 'Champ supprimé.',
    added: 'Configuration enregistrée.', schemaNote: 'Chaque modification incrémente la version du schéma et est versionnée dans Git.', adminOnly: 'Réservé aux administrateurs.',
  },
  admin: {
    eyebrow: 'Administration', title: 'Administration', webhooks: 'Webhooks', automations: 'Automatisations', plugins: 'Plugins', baselines: 'Baselines',
    url: 'URL HTTPS', events: 'Événements (séparés par des virgules)', create: 'Créer', secret: 'Secret de signature (affiché une seule fois)', empty: 'Aucun élément.',
    enable: 'Activer', disable: 'Désactiver', active: 'Actif', inactive: 'Inactif', baselineName: 'Nom de la baseline', createdBaseline: (n: string) => `Baseline ${n} créée.`,
    createdWebhook: 'Webhook créé.', toggled: 'État modifié.', trigger: 'Déclencheur',
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
  nav: { projects: 'Projects', search: 'Search', dashboard: 'Dashboard', admin: 'Administration', logout: 'Sign out', palette: 'Commands' },
  projects: { eyebrow: 'Mission console', title: 'Projects', empty: 'No project.', emptyEyebrow: 'No result', trackers: 'Trackers', boards: 'Boards' },
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
    historyMode: 'History writes', historyDirect: 'Direct (main branch)', historyMr: 'Through merge request (review)', readRoles: 'Read roles (comma separated)', writeRoles: 'Write roles (comma separated)', roles: 'Roles', everyone: 'Everyone', allowedRoles: 'Allowed roles (comma separated, empty: everyone)', remove: 'Delete', confirmPurge: (n: string) => `Field ${n} holds values. Permanently remove them from artifacts?`, removed: 'Field deleted.',
    added: 'Configuration saved.', schemaNote: 'Each change increments the schema version and is versioned in Git.', adminOnly: 'Administrators only.',
  },
  admin: {
    eyebrow: 'Administration', title: 'Administration', webhooks: 'Webhooks', automations: 'Automations', plugins: 'Plugins', baselines: 'Baselines',
    url: 'HTTPS URL', events: 'Events (comma separated)', create: 'Create', secret: 'Signing secret (shown once)', empty: 'Nothing here.',
    enable: 'Enable', disable: 'Disable', active: 'Active', inactive: 'Inactive', baselineName: 'Baseline name', createdBaseline: (n: string) => `Baseline ${n} created.`,
    createdWebhook: 'Webhook created.', toggled: 'State changed.', trigger: 'Trigger',
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
