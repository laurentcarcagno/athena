import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Dates affichées dans le fuseau du navigateur (lib/dates.ts) : les tests fixent l'UTC pour rester déterministes.
process.env.TZ = 'UTC';

// jsdom annonce « en-US » : les tests s'exécutent en français, la langue par défaut de l'interface.
Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true });

// Les attentes asynchrones (findBy, waitFor) valent 1 s par défaut : trop court quand la suite complète charge le poste (vues Matrice et Traçabilité).
configure({ asyncUtilTimeout: 6000 });

afterEach(() => cleanup());

// Le responsable d'un projet est mis en cache par personne et par projet : chaque test repart sans mémoire.
import { beforeEach } from 'vitest';
import { forgetProjectRoles } from './lib/project-role';
beforeEach(() => forgetProjectRoles());
