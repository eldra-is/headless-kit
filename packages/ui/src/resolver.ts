// `unplugin-vue-components` resolver entry (`@eldrajs/ui/resolver`).
import { componentNames } from './componentNames';

export interface EldraUiResolverOptions {
  /** Prefix every resolved tag name is expected to start with. Default `'Eldra'`. */
  prefix?: string;
}

interface ResolvedComponent {
  name: string;
  from: '@eldrajs/ui';
}

const componentNameSet: ReadonlySet<string> = new Set(componentNames);

/**
 * Resolver for [`unplugin-vue-components`](https://github.com/unplugin/unplugin-vue-components):
 *
 * ```ts
 * import Components from 'unplugin-vue-components/vite';
 * import { EldraUiResolver } from '@eldrajs/ui/resolver';
 *
 * export default defineConfig({
 *   plugins: [Components({ resolvers: [EldraUiResolver()] })],
 * });
 * ```
 *
 * A template can then use `<EldraButton>`, `<EldraSelect>`, and so on, with no explicit import —
 * the plugin rewrites the tag into `import { Button } from '@eldrajs/ui'` (auto-imported, not
 * globally registered) the first time it sees it. `EldraUiResolver` resolves against exactly the
 * names in `componentNames` (`src/index.ts`'s component exports — see
 * `src/__tests__/componentNames.spec.ts` for the guard that keeps the two in sync); anything else,
 * including the private library's own `Ui*` names, resolves to `undefined` and is left for another
 * resolver or a real component.
 *
 * The default prefix is `'Eldra'`, never `'Ui'` — that prefix belongs to the private Eldra
 * library's own resolver. Pass `{ prefix: 'Ui' }` yourself if a consumer really wants that name;
 * the package never implies it.
 */
export function EldraUiResolver(options: EldraUiResolverOptions = {}): {
  type: 'component';
  resolve: (name: string) => ResolvedComponent | undefined;
} {
  const prefix = options.prefix ?? 'Eldra';
  return {
    type: 'component',
    resolve(name: string): ResolvedComponent | undefined {
      if (!name.startsWith(prefix)) return undefined;
      const componentName = name.slice(prefix.length);
      if (!componentNameSet.has(componentName)) return undefined;
      return { name: componentName, from: '@eldrajs/ui' };
    },
  };
}

/**
 * The list the resolver resolves against — every component the root entry exports, in one array —
 * and the union of its names. Exported here, beside the resolver, because it is the same question:
 * "which components does this package ship?". A consumer registering all of them globally, or
 * typing their own `Record<ComponentName, …>` wrapper map, needs the list rather than a copy of it.
 */
export { componentNames, type ComponentName } from './componentNames';
