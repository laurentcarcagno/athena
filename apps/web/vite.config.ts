import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env['ATHENA_API_URL'] ?? 'http://localhost:3001';

// Les routes de l'API passent par le même hôte : le cookie de session reste de même origine.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, proxy: { '/v1': api, '/auth': api, '/healthz': api } },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], globals: true, testTimeout: 20000, include: ['src/**/*.test.{ts,tsx}'] },
});
