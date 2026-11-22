import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { parseCountUrl } from './src/core/counts';
import { parseBuildProfile } from './src/core/features';

/**
 * Two build profiles (see src/core/features.ts), chosen by VITE_BUILD_PROFILE:
 * - "full", the default: `pnpm build` writes dist/.
 * - "launch": `pnpm build:launch` writes dist-launch/. The scripts set the variable through
 *   .env.launch (`--mode launch`); setting it in the environment works as well.
 * An unknown value stops the build.
 *
 * VITE_COUNT_URL is the address anonymous counts are sent to (src/web/counting.ts). It is not
 * set in any file here: a build counts only when it is given one, and only the launch profile
 * has the switch for it. A malformed address stops the build.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const profile = parseBuildProfile(env.VITE_BUILD_PROFILE);
  parseCountUrl(env.VITE_COUNT_URL);
  const launch = profile === 'launch';
  return {
    plugins: [react()],
    server: {
      port: 5180,
      // The launch build has no server calls, so its dev server forwards nothing.
      proxy: launch ? undefined : { '/api': 'http://localhost:8787' },
    },
    build: {
      outDir: process.env.ARTIFACT ? 'dist-artifact' : launch ? 'dist-launch' : 'dist',
      sourcemap: !process.env.ARTIFACT,
      // The preload helper is the only code in the bundle that calls fetch(), and a one-file build
      // has nothing to preload. The launch build leaves it out, so its bundle has no network call
      // at all (scripts/check-launch.mjs checks that).
      ...(launch ? { modulePreload: { polyfill: false } } : {}),
    },
    test: {
      include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    },
  };
});
