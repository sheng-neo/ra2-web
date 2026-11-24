import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'central/*/src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
});
