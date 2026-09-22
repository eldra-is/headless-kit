import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'theme-core',
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
});
