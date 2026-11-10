import { describe, expect, it } from 'vitest';
import { PROJECT_SECTIONS, placeOf, sectionHref, visibleSections, visibleSettings } from './navigation';

const ids = (modules: readonly string[] | null, roles: readonly string[]) => visibleSections(modules, roles).map((s) => s.id);
const ALL_MODULES = ['overview', 'trackers', 'planning', 'traceability', 'conformity', 'documents', 'code', 'activity', 'members'];

describe('sections d’un projet', () => {
  it('suivent l’ordre fixe, pages existantes comprises (Recherche, Paramètres)', () => {
    expect(ids(null, ['athena-admin'])).toEqual(['overview', 'backlog', 'board', 'trackers', 'roadmap', 'traceability', 'conformity', 'documents', 'code', 'activity', 'search', 'settings']);
  });
  it('masquent un module inactif sans décaler les autres ; l’ordre renvoyé par le serveur est sans effet', () => {
    expect(ids(['members', 'overview', 'code'], ['athena-admin'])).toEqual(['overview', 'backlog', 'board', 'roadmap', 'code', 'search', 'settings']);
  });
  it('n’affichent jamais une section réservée à un autre rôle', () => {
    expect(ids(ALL_MODULES, ['athena-user'])).toEqual(['overview', 'backlog', 'board', 'trackers', 'roadmap', 'traceability', 'conformity', 'documents', 'code', 'activity', 'search']);
    expect(ids(ALL_MODULES, ['athena-qa'])).toContain('settings');
    expect(ids(ALL_MODULES, ['athena-pm'])).toContain('settings');
    // T-0120 : sections des Paramètres selon le rôle.
    expect(visibleSettings(['athena-pm']).map((s) => s.id)).toEqual(['membres', 'boards', 'baselines', 'approbations']);
    expect(visibleSettings(['athena-qa']).map((s) => s.id)).toEqual(['approbations']);
    expect(visibleSettings(['athena-user'])).toEqual([]);
  });
  it('ont des adresses inchangées', () => {
    expect(PROJECT_SECTIONS.map((s) => sectionHref('ARI', s))).toEqual(['/p/ARI', '/p/ARI/backlog', '/p/ARI/board', '/p/ARI/trackers', '/p/ARI/roadmap', '/p/ARI/tracabilite', '/p/ARI/conformite', '/p/ARI/documents', '/p/ARI/code', '/p/ARI/activite', '/p/ARI/recherche', '/p/ARI/parametres']);
  });
});

describe('place d’une adresse dans le projet', () => {
  it('donne la section des pages de section et des anciennes adresses', () => {
    expect(placeOf('/p/ARI')).toEqual({ project: 'ARI', section: 'overview', tracker: null });
    expect(placeOf('/p/ARI/documents/urd')).toEqual({ project: 'ARI', section: 'documents', tracker: null });
    for (const old of ['manage', 'planification', 'membres', 'admin']) expect(placeOf(`/p/ARI/${old}`)?.section).toBe('settings'); // T-0120 : redirigées vers Paramètres
    expect(placeOf('/p/ARI/parametres/boards')?.section).toBe('settings');
    expect(placeOf('/p/ARI/recherche')?.section).toBe('search');
    expect(placeOf('/p/ARI/board/EQ')?.section).toBe('board'); // T-0114 : section Board
  });
  it('donne le tracker de l’écran Tracker, de sa configuration et d’une fiche à clé canonique', () => {
    expect(placeOf('/p/ARI/t/BUG/board')).toEqual({ project: 'ARI', section: 'trackers', tracker: 'BUG' });
    expect(placeOf('/p/ARI/trackers/REQ/config')).toEqual({ project: 'ARI', section: 'trackers', tracker: 'REQ' });
    expect(placeOf('/p/ARI/parametres/trackers/REQ')).toEqual({ project: 'ARI', section: 'trackers', tracker: 'REQ' }); // T-0120
    expect(placeOf('/p/ARI/a/ARI-BUG-0002')).toEqual({ project: 'ARI', section: 'trackers', tracker: 'BUG' });
    expect(placeOf('/p/ARI/a/BUG-2')).toEqual({ project: 'ARI', section: 'trackers', tracker: null }); // ancienne clé : redirigée ensuite
    expect(placeOf('/p/ARI/trackers/new')).toEqual({ project: 'ARI', section: 'trackers', tracker: null });
  });
  it('vaut null hors d’un projet, et une section inconnue n’en donne aucune', () => {
    expect(placeOf('/me')).toBeNull();
    expect(placeOf('/p/ARI/inconnu')?.section).toBeNull();
  });
});
