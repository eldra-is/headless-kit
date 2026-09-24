import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

const entry = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    dts({ tsconfigPath: './tsconfig.build.json', copyDtsFiles: false }),
  ],
  build: {
    minify: false,
    cssCodeSplit: false,
    lib: {
      entry: {
        index: entry('./src/index.ts'),
        resolver: entry('./src/resolver.ts'),
        'vee-validate': entry('./src/vee-validate/index.ts'),
        'messages/is-IS': entry('./src/messages/is-IS.ts'),
        style: entry('./src/styles/style.ts'),
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rolldownOptions: {
      external: ['vue', 'vee-validate', '@floating-ui/vue', '@vueuse/core', 'tailwind-merge'],
      output: {
        assetFileNames: (info) =>
          info.names?.[0]?.endsWith('.css') ? 'style.css' : '[name][extname]',
      },
    },
  },
  test: {
    name: 'ui',
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    css: false,
  },
});
