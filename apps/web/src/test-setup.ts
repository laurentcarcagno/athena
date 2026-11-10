import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Dates affichées dans le fuseau du navigateur (lib/dates.ts) : les tests fixent l'UTC pour rester déterministes.
process.env.TZ = 'UTC';

// jsdom annonce « en-US » : les tests s'exécutent en français, la langue par défaut de l'interface.
Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true });

afterEach(() => cleanup());
