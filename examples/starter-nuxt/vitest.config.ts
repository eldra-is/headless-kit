import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Only used to compile the .vue SFCs mounted directly in unit tests
  // (test/eldraIcon.test.ts) outside of a full Nuxt build; it does not
  // affect the generate-based tests, which build through Nuxt's own Vite
  // pipeline in a child process.
  plugins: [vue()],
  test: { environment: 'node' },
});
