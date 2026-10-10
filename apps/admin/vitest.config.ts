import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` e o santinelă de build pentru Next: importată în afara lui, aruncă. Păstrăm marcajul
      // în fișiere (e util: oprește la compilare un import accidental din client) și îl neutralizăm doar
      // aici, ca generatoarele pure de XML să poată fi testate.
      'server-only': path.resolve(__dirname, 'src/test/server-only.ts'),
    },
  },
});
