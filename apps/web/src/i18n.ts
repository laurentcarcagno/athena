/**
 * Textes de l'interface, en français et en anglais. Ton factuel : pas de point d'exclamation, pas de formule d'excuse.
 * `fr` est un accès aux textes de la langue courante (nom conservé pour les importations existantes).
 */
import { useSyncExternalStore } from 'react';

const frDict = {
  loading: 'Chargement…',
  language: 'English',
  nav: { overview: 'Vue d’ensemble', projects: 'Projets', search: 'Recherche', dashboard: 'Tableau de bord', admin: 'Administration', logout: 'Déconnexion', palette: 'Commandes', work: 'Mon travail', manage: 'Gestion de projet', organization: 'Organisation', help: 'Aide', menu: 'Menu', skip: 'Aller au contenu' },
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
    eyebrow: 'Organisation', title: 'Administration de l’organisation', projects: 'Projets', users: 'Utilisateurs', plugins: 'Plugins', trackerTypes: 'Types', linkTypes: 'Liens',
    templates: 'Templates', template: 'Template du projet', noTemplate: 'Projet vide', templateKey: 'Clé du template (minuscules)', templateName: 'Nom du template', templateDescription: 'Description', fromProject: 'Reprendre les trackers du projet', pickTrackers: 'Trackers à inclure', createTemplate: 'Créer le template', templateCreated: 'Template créé.', deleteTemplate: 'Supprimer', templateDeleted: 'Template supprimé.', builtin: 'Livré', trackersCount: 'Trackers', attributes: 'Attributs',
    projectKey: 'Clé du projet (2 à 10 majuscules)', projectName: 'Nom du projet', createProject: 'Créer le projet', projectCreated: (k: string) => `Projet ${k} créé.`,
    managers: 'Chefs de projet', assignManager: 'Nommer chef de projet', chooseUser: 'Choisir un compte', noManager: 'Aucun chef de projet', revoke: 'Retirer', managerSet: 'Chef de projet nommé.', managerRemoved: 'Chef de projet retiré.',
    username: 'Identifiant', displayName: 'Nom', email: 'Courriel', usersNote: 'Comptes ayant déjà ouvert une session dans Athena.',
    install: 'Installer un plugin', packageJson: 'Paquet signé (JSON : manifest, code, signature)', grants: 'Permissions accordées', installAction: 'Installer', installed: 'Plugin installé.', uninstall: 'Désinstaller', uninstalled: 'Plugin désinstallé.', badPackage: 'Le paquet n’est pas un JSON valide.',
  },
  manage: {
    eyebrow: 'Gestion de projet', title: 'Planification', actors: 'Acteurs', sprints: 'Sprints', releases: 'Versions', boards: 'Boards',
    addActor: 'Ajouter l’acteur', role: 'Rôle', manager: 'Chef de projet', member: 'Membre', removeActor: 'Retirer', actorSet: 'Acteur enregistré.', actorRemoved: 'Acteur retiré.', restricted: 'Réservé aux chefs de projet et aux administrateurs.',
    sprintName: 'Nom du sprint', goal: 'Objectif', starts: 'Début', ends: 'Fin', createSprint: 'Créer le sprint', start: 'Démarrer', close: 'Clore', state: 'État', saved: 'Enregistré.',
    releaseName: 'Nom de la version', createRelease: 'Créer la version', publish: 'Publier',
    boardKey: 'Clé du board (minuscules)', boardName: 'Nom du board', boardTracker: 'Tracker', boardColumns: 'Colonnes (une par ligne : nom=statut1,statut2|limite WIP)', createBoard: 'Créer le board',
  },
  builder: {
    trackerKey: 'Clé du tracker (2 à 10 majuscules)', trackerName: 'Nom du tracker', options: 'Options', optionsHelp: 'Options (séparées par des virgules)', role: 'Rôle sémantique',
    addField: 'Ajouter le champ', addStatus: 'Ajouter le statut', badKey: 'La clé du tracker doit avoir 2 à 10 majuscules ou chiffres.', badName: 'Le nom du tracker est requis.',
    noTitle: 'Un champ de rôle sémantique « title » est requis.', noTodo: 'Un statut de catégorie todo est requis.',
    fromTemplate: 'Partir d’un template de tracker', blank: 'Tracker vierge', createTracker: 'Créer le tracker', trackerCreated: (k: string) => `Tracker ${k} créé.`, addTracker: 'Ajouter un tracker', newTracker: 'Nouveau tracker',
    adminOnly: 'Réservé aux administrateurs.', projectTemplates: 'Templates de projet', trackerTemplates: 'Templates de tracker', templateTrackers: 'Trackers du template',
    createTrackerTemplate: 'Créer le template de tracker', trackerTemplateCreated: 'Template de tracker créé.', trackerTemplateDeleted: 'Template de tracker supprimé.', newTrackerForTemplate: 'Nouveau tracker pour ce template',
    templateKey: 'Clé du template de tracker (minuscules)', templateName: 'Nom du template de tracker', addedTracker: (k: string) => `Template ${k} ajouté aux trackers du template.`,
    edit: 'Modifier', modified: 'Modifié', reset: 'Réinitialiser', save: 'Enregistrer', cancel: 'Annuler', templateSaved: 'Template enregistré.', resetDone: 'Template rétabli dans son état d’origine.',
    editing: (n: string) => `Modification de « ${n} »`, builtinNote: 'Template livré avec Athena : votre modification le remplace pour votre organisation. « Réinitialiser » rétablit la version d’origine.',
    resetTitle: (n: string) => `Réinitialiser « ${n} »`, resetBody: 'Les modifications de ce template livré sont abandonnées. Les projets déjà créés ne changent pas.',
    trackersOfTemplate: 'Trackers du template', addFromTemplate: 'Ajouter ce tracker', removeTracker: 'Retirer le tracker', editTracker: 'Éditer le tracker', closeTracker: 'Replier le tracker', duplicateTracker: 'Deux trackers du template ont la même clé.', noTrackers: 'Aucun tracker : les projets créés avec ce template seront vides.', pickTemplateToAdd: 'Ajouter un tracker depuis un template de tracker',
  },
  project: {
    navLabel: (p: string) => `Projet ${p}`,
    tabs: { overview: 'Vue d’ensemble', trackers: 'Trackers', planning: 'Planification', traceability: 'Traçabilité', documents: 'Documents', code: 'Code et intégration', activity: 'Activité', members: 'Membres' },
  },
  overview: {
    eyebrow: 'Projet', title: 'Vue d’ensemble', mine: 'À traiter par moi', noMine: 'Rien n’est assigné à votre nom.', allMine: 'Tout voir dans la Recherche', trackersTitle: 'Trackers', openTrackers: 'Voir les trackers',
    open: 'ouverts', total: 'au total',
  },
  trackersTab: {
    title: 'Trackers', empty: 'Aucun tracker dans ce projet.', items: (n: number) => (n === 1 ? '1 item' : `${n} items`), mine: (n: number) => (n === 1 ? '1 à moi' : `${n} à moi`),
    lastActivity: 'Dernière activité', never: 'Aucune activité', statusSummary: 'Répartition par état', openTracker: 'Ouvrir',
  },
  codeTab: {
    title: 'Code et intégration', repos: 'Dépôts liés', noRepos: 'Aucun dépôt lié à ce projet.', path: 'Dépôt', branch: 'Branche par défaut', delivery: 'Livraison (30 derniers jours)',
    metric: 'Indicateur', value: 'Valeur', deployments: 'Déploiements', frequency: 'Fréquence par jour', leadTime: 'Délai de livraison (h)', failureRate: 'Taux d’échec', mttr: 'Rétablissement (h)', none: '—',
  },
  trackerScreen: {
    eyebrow: 'Tracker', newItem: '+ Nouvel item', configure: 'Configurer', views: 'Vues du tracker', workflow: 'Workflow', empty: 'Aucun item.',
    total: (n: number) => (n === 1 ? '1 item' : `${n} items`), viewNames: { tableau: 'Tableau', board: 'Board', arbre: 'Arbre', matrice: 'Matrice' } as Record<string, string>,
  },
  filters: {
    bar: 'Filtres du tracker', mine: 'Assigné à moi', suspect: 'Liens suspects', all: 'Tous', text: 'Recherche dans le tracker', apply: 'Appliquer', clear: 'Effacer les filtres',
    atqlMode: 'Mode requête', chipsMode: 'Mode filtres', atqlLabel: 'Requête ATQL du tracker', atqlPlaceholder: 'status = open AND severity = majeure',
    notRepresentable: 'Cette requête ne s’affiche pas en filtres : modifiez-la en mode requête.',
    views: 'Vues enregistrées', noView: 'Aucune vue', saveView: 'Enregistrer la vue', viewName: 'Nom de la vue', sharedView: 'Partager avec le projet', defaultView: 'Vue par défaut du tracker',
    deleteView: 'Supprimer la vue', makeDefault: 'Définir par défaut', unsetDefault: 'Retirer le défaut', defaultTag: 'Par défaut',
    viewSaved: 'Vue enregistrée.', viewDeleted: 'Vue supprimée.', defaultSet: 'Vue par défaut enregistrée.', defaultUnset: 'Vue par défaut retirée.',
    deleteViewTitle: (n: string) => `Supprimer la vue « ${n} »`, deleteViewBody: 'La vue est supprimée définitivement, y compris pour ceux avec qui elle est partagée.', badQuery: 'Requête invalide.',
  },
  detail: { panel: 'Détail de l’item', expand: 'Agrandir', close: 'Fermer' },
  rail: {
    favorites: 'Favoris', recents: 'Récents', project: 'Projet', trackers: 'Trackers', pin: 'Épingler', unpin: 'Désépingler', moveUp: 'Monter', moveDown: 'Descendre',
    collapse: 'Replier le rail', expand: 'Déplier le rail',
  },
  crumb: { label: 'Fil d’Ariane', siblingProject: 'Changer de projet', siblingTracker: 'Changer de tracker', siblingView: 'Changer de vue' },
  activity: {
    title: 'Activité', filters: 'Filtres de l’activité', tracker: 'Tracker', person: 'Personne', kind: 'Type d’événement', date: 'Date', event: 'Événement', item: 'Item', empty: 'Aucune activité pour ces filtres.', older: 'Plus ancien',
    kinds: { created: 'Créations', updated: 'Modifications', transition: 'Transitions', comment: 'Commentaires' },
    created: 'a créé l’item', updated: 'a modifié', transitioned: 'a fait passer de', to: 'à', commented: 'a commenté',
  },
  columns: { button: 'Colonnes', legend: 'Colonnes affichées' },
  links: {
    type: 'Type de lien', target: 'Item cible (clé ou titre)', results: 'Items proposés', link: 'Lier', unlink: 'Supprimer le lien', acknowledge: 'Acquitter',
    created: 'Lien créé.', removed: 'Lien supprimé.', acknowledged: 'Lien acquitté.', noTypes: 'Aucun type de lien n’est défini pour ce projet.',
    deleteTitle: (label: string, other: string) => `Supprimer le lien « ${label} ${other} »`, deleteBody: 'Le lien est supprimé des deux côtés. Il pourra être recréé.',
  },
  linkTypes: {
    title: 'Types de liens', note: 'Un type de lien de l’organisation est utilisable dans tous les projets (un type du projet de même clé le surcharge). Sans paire, il relie n’importe quels trackers ; avec des paires, il ne relie que les types de tracker déclarés, dans ce sens (un tracker sans type n’est jamais contraint).',
    key: 'Clé du type de lien (minuscules)', outward: 'Libellé sortant (ex. vérifie)', inward: 'Libellé entrant (ex. est vérifié par)', hierarchical: 'Hiérarchique', pairs: 'Paires de types de tracker', anyPair: 'Tous les trackers',
    pairsHelp: 'Paires autorisées (type source → type cible)', fromType: 'Type source', toType: 'Type cible', addPair: 'Ajouter la paire', create: 'Créer le type de lien', editing: (k: string) => `Modification du type de lien « ${k} »`,
    saved: 'Type de lien enregistré.', created: 'Type de lien créé.', deleted: 'Type de lien supprimé.', resetDone: 'Type de lien rétabli dans son état d’origine.', empty: 'Aucun type de lien.',
    deleteTitle: (k: string) => `Supprimer le type de lien « ${k} »`, deleteBody: 'Le type est supprimé définitivement. Il est refusé tant que des liens l’utilisent.',
    resetTitle: (k: string) => `Réinitialiser le type de lien « ${k} »`, resetBody: 'Vos modifications de ce type livré sont abandonnées. Refusé tant que des liens l’utilisent.',
  },
  suspicion: {
    column: 'Contenu', content: 'Champ de contenu', contentHelp: 'Sa modification rend suspects les liens vers l’item', toggle: 'Champ de contenu :', propagates: 'Propage la suspicion', noPropagation: 'Sans suspicion',
    contentSaved: 'Champ de contenu enregistré.',
  },
  traceability: {
    title: 'Traçabilité', addRule: 'Ajouter une règle', createRule: 'Créer la règle', created: 'Règle créée.', deleted: 'Règle supprimée.', empty: 'Aucune règle de couverture. Une règle dit, par exemple, que toute exigence validée est vérifiée par au moins un test.',
    ruleKey: 'Clé de la règle (minuscules)', ruleName: 'Nom de la règle', scope: 'Portée', fromTracker: 'Tracker visé', linkType: 'Type de lien', direction: 'Sens du lien', minCount: 'Nombre minimal de liens',
    statuses: 'États visés (clés séparées par des virgules, tous si vide)', targetLabel: 'Objectif (%)', warningLabel: 'Seuil d’alerte (%)',
    scopes: { project: 'Projet', organization: 'Organisation' }, directions: { any: 'Dans les deux sens', in: 'Vers l’item (entrant)', out: 'Depuis l’item (sortant)' },
    levels: { ok: 'Atteint', warning: 'Alerte', critical: 'Insuffisant', none: 'Sans objet' },
    target: (target: number, warning?: number) => `objectif ${target} %${warning === undefined ? '' : `, alerte ${warning} %`}`,
    sentence: (tracker: string, type: string, min: number, direction: string, statuses: string[]) => `Tout item ${tracker}${statuses.length ? ` (états ${statuses.join(', ')})` : ''} a au moins ${min} lien(s) « ${type} »${direction === 'in' ? ', entrants' : direction === 'out' ? ', sortants' : ''}.`,
    nTotal: (n: number) => (n === 1 ? '1 item visé' : `${n} items visés`), nCovered: (n: number) => (n === 1 ? '1 conforme' : `${n} conformes`),
    nGaps: (n: number) => (n === 1 ? '1 en défaut' : `${n} en défaut`), nSuspect: (n: number) => (n === 1 ? '1 avec lien suspect' : `${n} avec lien suspect`),
    gapsCaption: (name: string) => `Items en défaut de la règle « ${name} »`, item: 'Item', itemTitle: 'Titre', moreGaps: (n: number) => `${n} autres items en défaut : ouvrez la liste.`,
    deleteTitle: (name: string) => `Supprimer la règle « ${name} »`, deleteBody: 'La règle est supprimée définitivement ; les items et les liens ne changent pas.',
  },
  matrix: {
    columns: 'Tracker en colonnes', linkType: 'Type de lien', exportCsv: 'Exporter en CSV', uncovered: 'non couvert', noOther: 'Ce projet n’a pas d’autre tracker à croiser.',
    linked: 'lien existant', linkedSuspect: 'lien suspect', link: (row: string, col: string) => `Lier ${row} et ${col}`,
    summary: (covered: number, shown: number, total: number) => `${covered} lignes couvertes sur ${shown} affichées (${total} items)`,
    caption: (rows: string, cols: string, label: string) => `Matrice de traçabilité : ${rows} en lignes, ${cols} en colonnes, lien « ${label} »`,
    rowsTruncated: (shown: number, total: number) => `${shown} lignes affichées sur ${total}.`,
  },
  tree: { label: 'Arbre des items', empty: 'Aucun item dans ce tracker.' },
  types: {
    title: 'Types de tracker', note: 'Un type fixe la catégorie, les vues proposées et le socle de champs des trackers qui en dérivent. Les types livrés se modifient et se réinitialisent.',
    key: 'Clé du type (minuscules)', name: 'Nom du type', description: 'Description', category: 'Catégorie',
    categories: { engineering: 'Ingénierie', development: 'Développement', verification: 'Vérification', management: 'Pilotage', other: 'Autres' },
    views: 'Vues proposées', viewNames: { tableau: 'Tableau', board: 'Board', arbre: 'Arbre', matrice: 'Matrice', document: 'Document', timeline: 'Timeline', calendrier: 'Calendrier' },
    baseFields: 'Socle de champs', fieldKey: 'Clé du champ', fieldLabel: 'Libellé du champ', fieldType: 'Type du champ', addField: 'Ajouter au socle', removeField: 'Retirer',
    create: 'Créer le type', save: 'Enregistrer', cancel: 'Annuler', edit: 'Modifier', delete: 'Supprimer', reset: 'Réinitialiser', builtin: 'Livré', modified: 'Modifié',
    created: 'Type créé.', saved: 'Type enregistré.', deleted: 'Type supprimé.', resetDone: 'Type rétabli dans son état d’origine.', editing: (n: string) => `Modification du type « ${n} »`,
    deleteTitle: (n: string) => `Supprimer le type « ${n} »`, deleteBody: 'Le type est supprimé définitivement. Il est refusé tant qu’un tracker en dérive.',
    resetTitle: (n: string) => `Réinitialiser le type « ${n} »`, resetBody: 'Vos modifications de ce type livré sont abandonnées.',
    trackerType: 'Type de tracker', noType: 'Sans type', typeSaved: 'Type du tracker enregistré.', empty: 'Aucun type.',
  },
  confirm: {
    cancel: 'Annuler', delete: 'Supprimer', uninstall: 'Désinstaller',
    deleteTitle: (n: string) => `Supprimer « ${n} »`, deleteTemplate: 'Le template est supprimé définitivement. Les projets déjà créés ne changent pas.',
    uninstallTitle: (n: string) => `Désinstaller « ${n} »`, uninstallBody: 'Le plugin est retiré : ses actions, widgets et connecteurs disparaissent, et sa politique de données s’applique. L’opération est irréversible.',
    purgeTitle: (n: string) => `Supprimer le champ ${n}`,
    removeAttachmentTitle: (n: string) => `Supprimer la pièce jointe « ${n} »`, removeAttachmentBody: 'Le fichier est supprimé définitivement de l’artefact.',
    deleteFilterTitle: (n: string) => `Supprimer le filtre « ${n} »`, deleteFilterBody: 'Le filtre enregistré est supprimé définitivement, y compris pour ceux avec qui il est partagé.',
  },
  help: {
    eyebrow: 'Aide', title: 'Aide', guide: 'Le guide complet se trouve dans docs/user/GUIDE.md du dépôt.', key: 'Touche', effect: 'Effet', example: 'Exemple', meaning: 'Sens', role: 'Rôle', capabilities: 'Peut',
    shortcuts: 'Raccourcis clavier',
    shortcutRows: [['Ctrl+K', 'Ouvre ou ferme la palette de commandes'], ['Tab', 'Passe au contrôle suivant ; le lien « Aller au contenu » est le premier'], ['Échap', 'Ferme une fenêtre ou la palette'], ['Entrée', 'Valide la sélection ou lance la recherche'], ['J / K', 'Dans le tableau d’un tracker : item suivant / précédent, la fiche s’ouvre à droite'], ['Échap', 'Ferme le panneau de détail et rend le focus à la ligne']],
    atql: 'Langage de recherche (ATQL)',
    atqlRows: [['status = in_progress', 'les suggestions affichent la clé technique d’un statut à côté de son nom'], ['severity IN (majeure, bloquante)', 'liste de valeurs'], ['title ~ "crash"', 'contient'], ['assignee IS EMPTY', 'champ vide'], ['updated > daysAgo(7)', 'relatif à aujourd’hui']],
    roles: 'Rôles',
    roleRows: [['Utilisateur', 'traite ses artefacts (Mon travail), recherche, commente'], ['Chef de projet', 'gère les acteurs, sprints, versions et boards de ses projets'], ['Administrateur', 'crée les projets, templates et trackers, gère les plugins']],
  },
  layout: {
    title: 'Disposition de la vue détails', help: 'Choisissez comment les attributs s’affichent sur la fiche d’un artefact.',
    autoNote: 'Disposition automatique : titre en pleine largeur, attributs courts sur une colonne, textes longs en pleine largeur.',
    customNote: 'Disposition personnalisée : glissez les attributs, ou utilisez les boutons de chaque attribut.',
    customize: 'Personnaliser', backToAuto: 'Revenir à l’automatique', general: 'Général', details: 'Détails', others: 'Autres attributs',
    untitled: (n: number) => `Section ${n}`, sectionTitle: (n: number) => `Titre de la section ${n}`, addSection: 'Ajouter une section', removeSection: 'Supprimer la section',
    sectionUp: 'Monter la section', sectionDown: 'Descendre la section', unplaced: 'Attributs non placés', allPlaced: 'Tous les attributs sont placés.', place: 'Placer',
    width: 'Largeur', columns: (n: number) => `${n} colonne${n > 1 ? 's' : ''} sur 3`, earlier: 'Reculer', later: 'Avancer', moveTo: 'Déplacer vers la section', unplace: 'Retirer',
    emptySection: 'Section vide : déposez un attribut ici.', dragHint: 'Un attribut non placé reste visible à la suite des autres sur la fiche.', save: 'Enregistrer la disposition', saved: 'Disposition enregistrée.',
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
  nav: { overview: 'Overview', projects: 'Projects', search: 'Search', dashboard: 'Dashboard', admin: 'Administration', logout: 'Sign out', palette: 'Commands', work: 'My work', manage: 'Project management', organization: 'Organization', help: 'Help', menu: 'Menu', skip: 'Skip to content' },
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
    eyebrow: 'Organization', title: 'Organization administration', projects: 'Projects', users: 'Users', plugins: 'Plugins', trackerTypes: 'Types', linkTypes: 'Links',
    templates: 'Templates', template: 'Project template', noTemplate: 'Empty project', templateKey: 'Template key (lowercase)', templateName: 'Template name', templateDescription: 'Description', fromProject: 'Reuse the trackers of project', pickTrackers: 'Trackers to include', createTemplate: 'Create template', templateCreated: 'Template created.', deleteTemplate: 'Delete', templateDeleted: 'Template deleted.', builtin: 'Built-in', trackersCount: 'Trackers', attributes: 'Attributes',
    projectKey: 'Project key (2 to 10 capitals)', projectName: 'Project name', createProject: 'Create project', projectCreated: (k: string) => `Project ${k} created.`,
    managers: 'Project managers', assignManager: 'Appoint project manager', chooseUser: 'Choose an account', noManager: 'No project manager', revoke: 'Remove', managerSet: 'Project manager appointed.', managerRemoved: 'Project manager removed.',
    username: 'Username', displayName: 'Name', email: 'Email', usersNote: 'Accounts that have already signed in to Athena.',
    install: 'Install a plugin', packageJson: 'Signed package (JSON: manifest, code, signature)', grants: 'Granted permissions', installAction: 'Install', installed: 'Plugin installed.', uninstall: 'Uninstall', uninstalled: 'Plugin uninstalled.', badPackage: 'The package is not valid JSON.',
  },
  manage: {
    eyebrow: 'Project management', title: 'Planning', actors: 'Actors', sprints: 'Sprints', releases: 'Releases', boards: 'Boards',
    addActor: 'Add actor', role: 'Role', manager: 'Project manager', member: 'Member', removeActor: 'Remove', actorSet: 'Actor saved.', actorRemoved: 'Actor removed.', restricted: 'Restricted to project managers and administrators.',
    sprintName: 'Sprint name', goal: 'Goal', starts: 'Start', ends: 'End', createSprint: 'Create sprint', start: 'Start', close: 'Close', state: 'State', saved: 'Saved.',
    releaseName: 'Release name', createRelease: 'Create release', publish: 'Publish',
    boardKey: 'Board key (lowercase)', boardName: 'Board name', boardTracker: 'Tracker', boardColumns: 'Columns (one per line: name=status1,status2|WIP limit)', createBoard: 'Create board',
  },
  builder: {
    trackerKey: 'Tracker key (2 to 10 capitals)', trackerName: 'Tracker name', options: 'Options', optionsHelp: 'Options (comma separated)', role: 'Semantic role',
    addField: 'Add field', addStatus: 'Add status', badKey: 'The tracker key needs 2 to 10 capitals or digits.', badName: 'The tracker name is required.',
    noTitle: 'A field with the “title” semantic role is required.', noTodo: 'A status in the todo category is required.',
    fromTemplate: 'Start from a tracker template', blank: 'Blank tracker', createTracker: 'Create tracker', trackerCreated: (k: string) => `Tracker ${k} created.`, addTracker: 'Add a tracker', newTracker: 'New tracker',
    adminOnly: 'Administrators only.', projectTemplates: 'Project templates', trackerTemplates: 'Tracker templates', templateTrackers: 'Template trackers',
    createTrackerTemplate: 'Create tracker template', trackerTemplateCreated: 'Tracker template created.', trackerTemplateDeleted: 'Tracker template deleted.', newTrackerForTemplate: 'New tracker for this template',
    templateKey: 'Tracker template key (lowercase)', templateName: 'Tracker template name', addedTracker: (k: string) => `Template ${k} added to the template trackers.`,
    edit: 'Edit', modified: 'Modified', reset: 'Reset', save: 'Save', cancel: 'Cancel', templateSaved: 'Template saved.', resetDone: 'Template restored to its original state.',
    editing: (n: string) => `Editing “${n}”`, builtinNote: 'Template shipped with Athena: your change replaces it for your organization. “Reset” restores the original version.',
    resetTitle: (n: string) => `Reset “${n}”`, resetBody: 'Changes to this built-in template are discarded. Projects already created are unchanged.',
    trackersOfTemplate: 'Template trackers', addFromTemplate: 'Add this tracker', removeTracker: 'Remove the tracker', editTracker: 'Edit the tracker', closeTracker: 'Collapse the tracker', duplicateTracker: 'Two trackers of the template share the same key.', noTrackers: 'No tracker: projects created with this template will be empty.', pickTemplateToAdd: 'Add a tracker from a tracker template',
  },
  project: {
    navLabel: (p: string) => `Project ${p}`,
    tabs: { overview: 'Overview', trackers: 'Trackers', planning: 'Planning', traceability: 'Traceability', documents: 'Documents', code: 'Code and integration', activity: 'Activity', members: 'Members' },
  },
  overview: {
    eyebrow: 'Project', title: 'Overview', mine: 'Assigned to me', noMine: 'Nothing is assigned to you.', allMine: 'See all in Search', trackersTitle: 'Trackers', openTrackers: 'See the trackers',
    open: 'open', total: 'in total',
  },
  trackersTab: {
    title: 'Trackers', empty: 'No tracker in this project.', items: (n: number) => (n === 1 ? '1 item' : `${n} items`), mine: (n: number) => `${n} mine`,
    lastActivity: 'Last activity', never: 'No activity', statusSummary: 'Breakdown by status', openTracker: 'Open',
  },
  codeTab: {
    title: 'Code and integration', repos: 'Linked repositories', noRepos: 'No repository linked to this project.', path: 'Repository', branch: 'Default branch', delivery: 'Delivery (last 30 days)',
    metric: 'Metric', value: 'Value', deployments: 'Deployments', frequency: 'Per day', leadTime: 'Lead time (h)', failureRate: 'Failure rate', mttr: 'Time to restore (h)', none: '—',
  },
  trackerScreen: {
    eyebrow: 'Tracker', newItem: '+ New item', configure: 'Configure', views: 'Tracker views', workflow: 'Workflow', empty: 'No item.',
    total: (n: number) => (n === 1 ? '1 item' : `${n} items`), viewNames: { tableau: 'Table', board: 'Board', arbre: 'Tree', matrice: 'Matrix' } as Record<string, string>,
  },
  filters: {
    bar: 'Tracker filters', mine: 'Assigned to me', suspect: 'Suspect links', all: 'All', text: 'Search in the tracker', apply: 'Apply', clear: 'Clear filters',
    atqlMode: 'Query mode', chipsMode: 'Filter mode', atqlLabel: 'Tracker ATQL query', atqlPlaceholder: 'status = open AND severity = major',
    notRepresentable: 'This query cannot be shown as filters: edit it in query mode.',
    views: 'Saved views', noView: 'No view', saveView: 'Save view', viewName: 'View name', sharedView: 'Share with the project', defaultView: 'Default view of the tracker',
    deleteView: 'Delete view', makeDefault: 'Make default', unsetDefault: 'Remove default', defaultTag: 'Default',
    viewSaved: 'View saved.', viewDeleted: 'View deleted.', defaultSet: 'Default view saved.', defaultUnset: 'Default view removed.',
    deleteViewTitle: (n: string) => `Delete view “${n}”`, deleteViewBody: 'The view is deleted permanently, including for those it is shared with.', badQuery: 'Invalid query.',
  },
  detail: { panel: 'Item detail', expand: 'Expand', close: 'Close' },
  rail: {
    favorites: 'Favorites', recents: 'Recent', project: 'Project', trackers: 'Trackers', pin: 'Pin', unpin: 'Unpin', moveUp: 'Move up', moveDown: 'Move down',
    collapse: 'Collapse the rail', expand: 'Expand the rail',
  },
  crumb: { label: 'Breadcrumb', siblingProject: 'Switch project', siblingTracker: 'Switch tracker', siblingView: 'Switch view' },
  activity: {
    title: 'Activity', filters: 'Activity filters', tracker: 'Tracker', person: 'Person', kind: 'Event type', date: 'Date', event: 'Event', item: 'Item', empty: 'No activity for these filters.', older: 'Older',
    kinds: { created: 'Creations', updated: 'Changes', transition: 'Transitions', comment: 'Comments' },
    created: 'created the item', updated: 'changed', transitioned: 'moved from', to: 'to', commented: 'commented',
  },
  columns: { button: 'Columns', legend: 'Displayed columns' },
  links: {
    type: 'Link type', target: 'Target item (key or title)', results: 'Suggested items', link: 'Link', unlink: 'Delete link', acknowledge: 'Acknowledge',
    created: 'Link created.', removed: 'Link deleted.', acknowledged: 'Link acknowledged.', noTypes: 'No link type is defined for this project.',
    deleteTitle: (label: string, other: string) => `Delete link “${label} ${other}”`, deleteBody: 'The link is deleted on both sides. It can be created again.',
  },
  linkTypes: {
    title: 'Link types', note: 'An organization link type can be used in every project (a project type with the same key overrides it). Without pairs it links any trackers; with pairs it only links the declared tracker types, in that direction (an untyped tracker is never constrained).',
    key: 'Link type key (lowercase)', outward: 'Outward label (e.g. verifies)', inward: 'Inward label (e.g. is verified by)', hierarchical: 'Hierarchical', pairs: 'Tracker type pairs', anyPair: 'All trackers',
    pairsHelp: 'Allowed pairs (source type → target type)', fromType: 'Source type', toType: 'Target type', addPair: 'Add pair', create: 'Create link type', editing: (k: string) => `Editing link type “${k}”`,
    saved: 'Link type saved.', created: 'Link type created.', deleted: 'Link type deleted.', resetDone: 'Link type restored to its original state.', empty: 'No link type.',
    deleteTitle: (k: string) => `Delete link type “${k}”`, deleteBody: 'The type is deleted permanently. Refused while links use it.',
    resetTitle: (k: string) => `Reset link type “${k}”`, resetBody: 'Your changes to this built-in type are discarded. Refused while links use it.',
  },
  suspicion: {
    column: 'Content', content: 'Content field', contentHelp: 'Changing it makes the links to the item suspect', toggle: 'Content field:', propagates: 'Propagates suspicion', noPropagation: 'No suspicion',
    contentSaved: 'Content field saved.',
  },
  traceability: {
    title: 'Traceability', addRule: 'Add a rule', createRule: 'Create the rule', created: 'Rule created.', deleted: 'Rule deleted.', empty: 'No coverage rule. A rule says, for instance, that every validated requirement is verified by at least one test.',
    ruleKey: 'Rule key (lowercase)', ruleName: 'Rule name', scope: 'Scope', fromTracker: 'Target tracker', linkType: 'Link type', direction: 'Link direction', minCount: 'Minimum number of links',
    statuses: 'Target statuses (keys separated by commas, all if empty)', targetLabel: 'Target (%)', warningLabel: 'Warning threshold (%)',
    scopes: { project: 'Project', organization: 'Organisation' }, directions: { any: 'Either direction', in: 'Towards the item (incoming)', out: 'From the item (outgoing)' },
    levels: { ok: 'Met', warning: 'Warning', critical: 'Insufficient', none: 'Not applicable' },
    target: (target: number, warning?: number) => `target ${target}%${warning === undefined ? '' : `, warning ${warning}%`}`,
    sentence: (tracker: string, type: string, min: number, direction: string, statuses: string[]) => `Every ${tracker} item${statuses.length ? ` (statuses ${statuses.join(', ')})` : ''} has at least ${min} “${type}” link(s)${direction === 'in' ? ', incoming' : direction === 'out' ? ', outgoing' : ''}.`,
    nTotal: (n: number) => (n === 1 ? '1 item in scope' : `${n} items in scope`), nCovered: (n: number) => `${n} compliant`,
    nGaps: (n: number) => `${n} failing`, nSuspect: (n: number) => (n === 1 ? '1 with a suspect link' : `${n} with a suspect link`),
    gapsCaption: (name: string) => `Items failing the rule “${name}”`, item: 'Item', itemTitle: 'Title', moreGaps: (n: number) => `${n} more failing items: open the list.`,
    deleteTitle: (name: string) => `Delete the rule “${name}”`, deleteBody: 'The rule is deleted for good; items and links do not change.',
  },
  matrix: {
    columns: 'Tracker in columns', linkType: 'Link type', exportCsv: 'Export as CSV', uncovered: 'not covered', noOther: 'This project has no other tracker to cross.',
    linked: 'existing link', linkedSuspect: 'suspect link', link: (row: string, col: string) => `Link ${row} and ${col}`,
    summary: (covered: number, shown: number, total: number) => `${covered} of ${shown} displayed rows covered (${total} items)`,
    caption: (rows: string, cols: string, label: string) => `Traceability matrix: ${rows} in rows, ${cols} in columns, link “${label}”`,
    rowsTruncated: (shown: number, total: number) => `${shown} rows displayed out of ${total}.`,
  },
  tree: { label: 'Item tree', empty: 'No item in this tracker.' },
  types: {
    title: 'Tracker types', note: 'A type sets the category, the proposed views and the base fields of the trackers derived from it. Built-in types can be edited and reset.',
    key: 'Type key (lowercase)', name: 'Type name', description: 'Description', category: 'Category',
    categories: { engineering: 'Engineering', development: 'Development', verification: 'Verification', management: 'Management', other: 'Other' },
    views: 'Proposed views', viewNames: { tableau: 'Table', board: 'Board', arbre: 'Tree', matrice: 'Matrix', document: 'Document', timeline: 'Timeline', calendrier: 'Calendar' },
    baseFields: 'Base fields', fieldKey: 'Field key', fieldLabel: 'Field label', fieldType: 'Field type', addField: 'Add to base fields', removeField: 'Remove',
    create: 'Create type', save: 'Save', cancel: 'Cancel', edit: 'Edit', delete: 'Delete', reset: 'Reset', builtin: 'Built-in', modified: 'Modified',
    created: 'Type created.', saved: 'Type saved.', deleted: 'Type deleted.', resetDone: 'Type restored to its original state.', editing: (n: string) => `Editing type “${n}”`,
    deleteTitle: (n: string) => `Delete type “${n}”`, deleteBody: 'The type is deleted permanently. It is refused while a tracker derives from it.',
    resetTitle: (n: string) => `Reset type “${n}”`, resetBody: 'Your changes to this built-in type are discarded.',
    trackerType: 'Tracker type', noType: 'No type', typeSaved: 'Tracker type saved.', empty: 'No type.',
  },
  confirm: {
    cancel: 'Cancel', delete: 'Delete', uninstall: 'Uninstall',
    deleteTitle: (n: string) => `Delete “${n}”`, deleteTemplate: 'The template is permanently deleted. Projects already created are unchanged.',
    uninstallTitle: (n: string) => `Uninstall “${n}”`, uninstallBody: 'The plugin is removed: its actions, widgets and connectors disappear, and its data policy applies. This cannot be undone.',
    purgeTitle: (n: string) => `Delete field ${n}`,
    removeAttachmentTitle: (n: string) => `Delete attachment “${n}”`, removeAttachmentBody: 'The file is permanently removed from the artifact.',
    deleteFilterTitle: (n: string) => `Delete filter “${n}”`, deleteFilterBody: 'The saved filter is permanently deleted, including for those it is shared with.',
  },
  help: {
    eyebrow: 'Help', title: 'Help', guide: 'The full guide is in docs/user/GUIDE.md in the repository.', key: 'Key', effect: 'Effect', example: 'Example', meaning: 'Meaning', role: 'Role', capabilities: 'Can',
    shortcuts: 'Keyboard shortcuts',
    shortcutRows: [['Ctrl+K', 'Opens or closes the command palette'], ['Tab', 'Moves to the next control; “Skip to content” is the first'], ['Esc', 'Closes a window or the palette'], ['Enter', 'Confirms the selection or runs the search'], ['J / K', 'In a tracker table: next / previous item, the record opens on the right'], ['Esc', 'Closes the detail panel and returns focus to the row']],
    atql: 'Search language (ATQL)',
    atqlRows: [['status = in_progress', 'suggestions show a status technical key next to its name'], ['severity IN (major, blocker)', 'list of values'], ['title ~ "crash"', 'contains'], ['assignee IS EMPTY', 'empty field'], ['updated > daysAgo(7)', 'relative to today']],
    roles: 'Roles',
    roleRows: [['User', 'processes their artifacts (My work), searches, comments'], ['Project manager', 'manages actors, sprints, releases and boards of their projects'], ['Administrator', 'creates projects, templates and trackers, manages plugins']],
  },
  layout: {
    title: 'Details view layout', help: 'Choose how attributes are laid out on an artifact sheet.',
    autoNote: 'Automatic layout: title full width, short attributes on one column, long texts full width.',
    customNote: 'Custom layout: drag attributes, or use the buttons on each attribute.',
    customize: 'Customize', backToAuto: 'Back to automatic', general: 'General', details: 'Details', others: 'Other attributes',
    untitled: (n: number) => `Section ${n}`, sectionTitle: (n: number) => `Section ${n} title`, addSection: 'Add a section', removeSection: 'Delete section',
    sectionUp: 'Move section up', sectionDown: 'Move section down', unplaced: 'Unplaced attributes', allPlaced: 'All attributes are placed.', place: 'Place',
    width: 'Width', columns: (n: number) => `${n} column${n > 1 ? 's' : ''} of 3`, earlier: 'Move earlier', later: 'Move later', moveTo: 'Move to section', unplace: 'Remove',
    emptySection: 'Empty section: drop an attribute here.', dragHint: 'An unplaced attribute still shows after the others on the sheet.', save: 'Save layout', saved: 'Layout saved.',
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
