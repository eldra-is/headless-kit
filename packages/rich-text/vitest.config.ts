import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'rich-text',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
