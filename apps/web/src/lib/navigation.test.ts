import { describe, expect, it } from 'vitest';
import { PROJECT_SECTIONS, placeOf, sectionHref, visibleSections } from './navigation';

const ids = (modules: readonly string[] | null, roles: readonly string[]) => visibleSections(modules, roles).map((s) => s.id);
const ALL_MODULES = ['overview', 'trackers', 'planning', 'traceability', 'conformity', 'documents', 'code', 'activity', 'members'];

describe('sections d’un projet', () => {
  it('suivent l’ordre fixe, pages existantes comprises (Recherche, Administration)', () => {
    expect(ids(null, ['athena-admin'])).toEqual(['overview', 'backlog', 'board', 'trackers', 'planning', 'traceability', 'conformity', 'documents', 'code', 'activity', 'members', 'search', 'admin']);
  });
  it('masquent un module inactif sans décaler les autres ; l’ordre renvoyé par le serveur est sans effet', () => {
    expect(ids(['members', 'overview', 'code'], ['athena-admin'])).toEqual(['overview', 'backlog', 'board', 'code', 'members', 'search', 'admin']);
  });
  it('n’affichent jamais une section réservée à un autre rôle', () => {
    expect(ids(ALL_MODULES, ['athena-user'])).toEqual(['overview', 'backlog', 'board', 'trackers', 'traceability', 'conformity', 'documents', 'code', 'activity', 'search']);
    expect(ids(ALL_MODULES, ['athena-qa'])).toContain('planning');
    expect(ids(ALL_MODULES, ['athena-qa'])).not.toContain('members');
    expect(ids(ALL_MODULES, ['athena-pm'])).toEqual(expect.arrayContaining(['planning', 'members']));
    expect(ids(ALL_MODULES, ['athena-pm'])).not.toContain('admin');
  });
  it('ont des adresses inchangées', () => {
    expect(PROJECT_SECTIONS.map((s) => sectionHref('ARI', s))).toEqual(['/p/ARI', '/p/ARI/backlog', '/p/ARI/board', '/p/ARI/trackers', '/p/ARI/planification', '/p/ARI/tracabilite', '/p/ARI/conformite', '/p/ARI/documents', '/p/ARI/code', '/p/ARI/activite', '/p/ARI/membres', '/p/ARI/recherche', '/p/ARI/admin']);
  });
});

describe('place d’une adresse dans le projet', () => {
  it('donne la section des pages de section et des anciennes adresses', () => {
    expect(placeOf('/p/ARI')).toEqual({ project: 'ARI', section: 'overview', tracker: null });
    expect(placeOf('/p/ARI/documents/urd')).toEqual({ project: 'ARI', section: 'documents', tracker: null });
    expect(placeOf('/p/ARI/manage')?.section).toBe('planning');
    expect(placeOf('/p/ARI/recherche')?.section).toBe('search');
    expect(placeOf('/p/ARI/board/EQ')?.section).toBe('board'); // T-0114 : section Board
  });
  it('donne le tracker de l’écran Tracker, de sa configuration et d’une fiche à clé canonique', () => {
    expect(placeOf('/p/ARI/t/BUG/board')).toEqual({ project: 'ARI', section: 'trackers', tracker: 'BUG' });
    expect(placeOf('/p/ARI/trackers/REQ/config')).toEqual({ project: 'ARI', section: 'trackers', tracker: 'REQ' });
    expect(placeOf('/p/ARI/a/ARI-BUG-0002')).toEqual({ project: 'ARI', section: 'trackers', tracker: 'BUG' });
    expect(placeOf('/p/ARI/a/BUG-2')).toEqual({ project: 'ARI', section: 'trackers', tracker: null }); // ancienne clé : redirigée ensuite
    expect(placeOf('/p/ARI/trackers/new')).toEqual({ project: 'ARI', section: 'trackers', tracker: null });
  });
  it('vaut null hors d’un projet, et une section inconnue n’en donne aucune', () => {
    expect(placeOf('/me')).toBeNull();
    expect(placeOf('/p/ARI/inconnu')?.section).toBeNull();
  });
});
