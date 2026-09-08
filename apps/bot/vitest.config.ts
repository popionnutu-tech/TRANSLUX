import { defineConfig } from 'vitest/config';

// Fără DB, fără rețea: funcțiile pure au teste unitare, iar ziua operatorului se joacă
// cap-coadă prin `/app/v1/*` peste un Supabase fals în memorie (src/test/). Gardul din
// vitest.setup.ts taie orice `fetch` care nu merge spre serverul local al testelor.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
