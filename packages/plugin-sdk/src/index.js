export { checkManifest, generateKeys, pack, packageDigest, verifyPackage } from './pack.js';

/**
 * Aide de typage : `definePlugin` ne fait que retourner sa définition. Le code du plugin assigne le résultat
 * à la variable globale `plugin` (le plugin s'exécute dans un contexte isolé, sans `require` ni `process`).
 *
 *   plugin = definePlugin({ fieldTypes: { 'hex-color': { validate: (value) => ... } } });
 */
export const definePlugin = (definition) => definition;
