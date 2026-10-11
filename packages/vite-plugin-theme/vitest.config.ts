import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'vite-plugin-theme',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
