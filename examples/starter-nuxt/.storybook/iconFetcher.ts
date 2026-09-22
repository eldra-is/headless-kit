import type { IconFetcher } from '../app/composables/iconFetcher';

// Storybook has no Nuxt server, so `/api/eldra-icon` (the real app's route,
// see server/api/eldra-icon.get.ts + server/utils/tablerIcon.ts) does not
// exist here. `import.meta.glob` reads the same `@tabler/icons` package
// directly at build time instead: the package's export map remaps
// `@tabler/icons/outline/<name>.svg` to `./icons/outline/<name>.svg` for
// Node's resolver (see server/utils/tablerIcon.ts's `require.resolve`),
// but `import.meta.glob`'s root-relative pattern globs the real filesystem
// and bypasses that export map, so the pattern below targets the package's
// actual `icons/outline/` directory.
const icons = import.meta.glob('/node_modules/@tabler/icons/icons/outline/*.svg', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

export const createStorybookIconFetcher = (): IconFetcher => {
  return async (name: string): Promise<string | null> => {
    const loader = icons[`/node_modules/@tabler/icons/icons/outline/${name}.svg`];
    if (!loader) return null;
    return loader();
  };
};
