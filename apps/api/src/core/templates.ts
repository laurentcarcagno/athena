import type { TrackerSpec } from './tracker.service';

/** Gabarits de trackers livrés (plan § 15.3). Ils ne sont que des données : tout reste configurable. */
export function bugTemplate(projectKey: string, key = 'BUG'): TrackerSpec {
  return {
    projectKey,
    key,
    name: 'Bugs',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'description', label: 'Description', type: 'richtext', semanticRole: 'description' },
      { key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'majeure', 'bloquante'] }, required: true },
      { key: 'assignee', label: 'Responsable', type: 'user', semanticRole: 'assignee', isContent: false },
      { key: 'affected_version', label: 'Version affectée', type: 'text', isContent: false },
      { key: 'fixed_version', label: 'Version corrigée', type: 'text', isContent: false },
      { key: 'root_cause', label: 'Cause racine', type: 'richtext' },
    ],
    statuses: [
      { key: 'open', name: 'Ouvert', category: 'todo' },
      { key: 'in_progress', name: 'En cours', category: 'in_progress' },
      { key: 'in_review', name: 'En revue', category: 'in_progress' },
      { key: 'resolved', name: 'Résolu', category: 'done' },
      { key: 'delivered', name: 'Livré', category: 'done' },
    ],
    transitions: [
      { name: 'Démarrer', from: 'open', to: 'in_progress', validators: [{ type: 'required_fields', fields: ['assignee'] }] },
      { name: 'Soumettre à revue', from: 'in_progress', to: 'in_review' },
      { name: 'Résoudre', from: 'in_review', to: 'resolved', validators: [{ type: 'required_fields', fields: ['root_cause'] }] },
      { name: 'Livrer', from: 'resolved', to: 'delivered', conditions: [{ type: 'role', roles: ['athena-admin'] }] },
      { name: 'Rouvrir', from: null, to: 'open' },
    ],
  };
}

export function requirementTemplate(projectKey: string, key = 'REQ'): TrackerSpec {
  return {
    projectKey,
    key,
    name: 'Exigences',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'statement', label: 'Énoncé', type: 'richtext', required: true, semanticRole: 'description' },
      { key: 'priority', label: 'Priorité', type: 'select', config: { options: ['basse', 'moyenne', 'haute'] }, isContent: false },
      { key: 'doc_uid', label: 'UID documentaire', type: 'text', config: { maxLength: 128 } },
    ],
    statuses: [
      { key: 'draft', name: 'Brouillon', category: 'todo' },
      { key: 'approved', name: 'Approuvée', category: 'in_progress' },
      { key: 'verified', name: 'Vérifiée', category: 'done' },
    ],
    transitions: [
      { name: 'Approuver', from: 'draft', to: 'approved' },
      { name: 'Vérifier', from: 'approved', to: 'verified' },
    ],
  };
}

/** Tracker « Exigences normatives » : les clauses d'une norme, importées d'un CSV (référence, titre, texte). */
export function normativeClauseTracker(projectKey: string, key = 'NORM'): TrackerSpec {
  return {
    projectKey, key, name: 'Exigences normatives', typeKey: 'requirement',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
      { key: 'reference', label: 'Référence', type: 'text', required: true, config: { maxLength: 200 } },
      { key: 'standard', label: 'Norme', type: 'text', isContent: false },
      { key: 'statement', label: 'Texte de la clause', type: 'richtext', semanticRole: 'description' },
    ],
    statuses: [{ key: 'active', name: 'En vigueur', category: 'todo' }, { key: 'withdrawn', name: 'Retirée', category: 'done' }],
    transitions: [{ name: 'Retirer', from: 'active', to: 'withdrawn' }, { name: 'Rétablir', from: 'withdrawn', to: 'active' }],
  };
}
