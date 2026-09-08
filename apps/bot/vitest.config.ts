import { defineConfig } from 'vitest/config';

// Doar funcții pure (hash de token, stări de curse, validări) — fără DB, fără rețea.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
