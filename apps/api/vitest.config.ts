import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  // Les tests d'intégration partagent un GitLab local à un seul worker : fichiers exécutés en série.
  test: { include: ['src/**/*.test.ts'], fileParallelism: false, testTimeout: 15_000, hookTimeout: 60_000 },
});
