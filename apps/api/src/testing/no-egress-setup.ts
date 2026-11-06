import { afterEach, beforeAll, afterAll } from 'vitest';
import { installNoEgress, type EgressGuard } from './no-egress';

/** Active le garde « aucune sortie » pour tous les tests de l'API : une tentative vers un hôte non autorisé fait échouer le test. */
let guard: EgressGuard | undefined;
beforeAll(() => { guard = installNoEgress(); });
afterEach(() => {
  const seen = guard?.take() ?? [];
  if (seen.length) throw new Error(`Sortie réseau interdite pendant le test : ${seen.join(', ')}`);
});
afterAll(() => guard?.uninstall());
