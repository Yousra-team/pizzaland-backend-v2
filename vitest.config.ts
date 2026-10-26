import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10000,
    include: ['tests/**/*.test.ts'],
    // Runs before every test file: fake env vars so no Doppler / real services are needed
    setupFiles: ['./tests/setup.ts'],
  },
});