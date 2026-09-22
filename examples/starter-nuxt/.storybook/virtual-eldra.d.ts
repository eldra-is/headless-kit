// Ambient shapes for the `virtual:eldra/*` modules `@eldrajs/vite-plugin-theme` emits.
// Neither `@eldrajs/theme-vue` nor `@eldrajs/vite-plugin-theme` ships these
// declarations to consumers (they are source-only, used to type-check each
// package's own source), so Storybook config/stories — the first place in
// this app that imports a `virtual:eldra/*` id directly — declares the slice
// it actually uses here. Kept minimal and in sync with
// `@eldrajs/vite-plugin-theme`'s own equivalent internal declaration.
declare module 'virtual:eldra/block-fields' {
  const blockFields: Record<
    string,
    Array<{
      fieldId: string;
      type: string;
      localized?: boolean;
      metadata?: Record<string, unknown>;
    }>
  >;
  export default blockFields;
}

declare module 'virtual:eldra/tokens.css' {}

// Plain `tsc` (see shims-vue.d.ts) has no `vite/client` ambient CSS-import
// shim either, and pulling in `vite/client` here would require `vite` to be
// a direct devDependency just for its types. `preview.ts`'s side-effect
// `import '../app/assets/main.css'` only needs the module to exist.
declare module '*.css';

// Same reasoning for `import.meta.glob` (used by `iconFetcher.ts`): only the
// narrow shape this config actually calls it with (`{ query, import }`
// producing lazy string loaders), not `vite/client`'s full overload set.
interface ImportMeta {
  glob(
    pattern: string,
    options: { query?: string; import?: string }
  ): Record<string, () => Promise<string>>;
}
