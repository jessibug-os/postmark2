/**
 * Vitest runs against the app's own Vite config — same plugins, same resolution
 * — with one addition: a setup file that installs the browser globals a few
 * modules touch while they initialise. Merging rather than replacing keeps the
 * `?raw` glob imports the authored-content gates rely on working.
 */
import { defineConfig, mergeConfig } from 'vite';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      setupFiles: ['./tests/setup.ts'],
    },
  } as never),
);
