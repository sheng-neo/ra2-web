/**
 * The feature switches of this build.
 *
 * The profile comes from the build variable VITE_BUILD_PROFILE: "full" (the default) or
 * "launch". `pnpm build:launch` and `pnpm dev:launch` set it through .env.launch. The switches
 * themselves, and what each one means, are in src/core/features.ts.
 *
 * Screens read `features.<name>` directly. The value is fixed when the bundle is built, so in a
 * production build the bundler leaves out the code behind a switch that is off (the launch
 * bundle has no code that can call /api/parse; scripts/check-launch.mjs checks that).
 */
import { FULL, LAUNCH, parseBuildProfile, type BuildProfile, type Features } from '../core/features';

/** The profile this bundle was built as. An unknown value stops the app (and the build) with an error. */
export const BUILD_PROFILE: BuildProfile = parseBuildProfile(import.meta.env.VITE_BUILD_PROFILE);

// The comparison is written out here, instead of calling featuresFor(), so the bundler can see
// at build time which table is used.
export const features: Features = import.meta.env.VITE_BUILD_PROFILE === 'launch' ? LAUNCH : FULL;
