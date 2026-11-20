import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: { outDir: process.env.ARTIFACT ? 'dist-artifact' : 'dist', sourcemap: !process.env.ARTIFACT },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
