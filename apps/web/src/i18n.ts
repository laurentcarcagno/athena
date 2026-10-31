/** Textes de l'interface (français). Ton factuel : pas de point d'exclamation, pas de formule d'excuse. */
export const fr = {
  loading: 'Chargement…',
  nav: { projects: 'Projets', search: 'Recherche', logout: 'Déconnexion' },
  projects: { eyebrow: 'Mission console', title: 'Projets', empty: 'Aucun projet.', emptyEyebrow: 'Aucun résultat', trackers: 'Trackers', boards: 'Boards' },
  list: {
    eyebrow: 'Recherche', placeholder: 'Requête ATQL, par exemple status = open AND severity = majeure', run: 'Rechercher',
    key: 'Clé', title: 'Titre', status: 'Statut', tracker: 'Tracker', updated: 'Mis à jour', total: (n: number) => `${n} résultat${n > 1 ? 's' : ''}`,
    empty: 'Aucun artefact ne correspond à la requête.', emptyEyebrow: 'Aucun résultat', reset: 'Réinitialiser',
    previous: 'Précédent', next: 'Suivant',
  },
  artifact: {
    details: 'Détails', links: 'Liens', history: 'Historique', activity: 'Commentaires', development: 'Développement',
    transitions: 'Transitions', save: 'Enregistrer', saved: 'Modification enregistrée.', comment: 'Commentaire', addComment: 'Ajouter',
    noHistory: 'Aucune révision.', noLinks: 'Aucun lien.', noComments: 'Aucun commentaire.', noCode: 'Aucune référence de code.', noDocs: 'Aucune exigence liée.',
    suspect: 'Suspect', commit: 'Commit', docs: 'Documentation liée', transitioned: (name: string) => `Transition « ${name} » appliquée.`,
    required: 'obligatoire',
  },
  board: { eyebrow: 'Board', moveTo: 'Déplacer vers', unmapped: (n: number) => `${n} artefact(s) hors colonnes`, wip: 'Limite WIP', moved: 'Carte déplacée.', empty: 'Aucune carte.' },
  errors: {
    generic: 'Une erreur est survenue. Réessayez.', notFoundTitle: 'Page introuvable', notFoundEyebrow: 'Erreur 404', notFound: 'Cette adresse ne correspond à aucune page.',
    unavailableEyebrow: 'Connexion', unavailable: 'Authentification indisponible.',
  },
} as const;
