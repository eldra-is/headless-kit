import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'examples/starter-nuxt'],
    reporters: process.env.CI ? ['github-actions', 'verbose'] : ['default'],
  },
});
