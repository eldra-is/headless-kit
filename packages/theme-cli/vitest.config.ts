import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'theme-cli',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
