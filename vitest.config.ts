import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    reporters: process.env.CI ? ['github-actions', 'verbose'] : ['default'],
  },
});
