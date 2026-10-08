// Ambient shape for the one `virtual:eldra/*` id `app/` code imports directly
// (`eldra-i18n.ts`, for the theme's own declared default locale — see that file's doc comment).
// Neither `@eldrajs/vite-plugin-theme` nor `@eldrajs/theme-nuxt` ships this declaration to
// consumers (it is source-only, used to type-check the plugin's own code), so this app — the first
// place in the Nuxt build that imports a `virtual:eldra/*` id directly — declares the slice it
// actually uses, the same way `.storybook/virtual-eldra.d.ts` does for Storybook's separate
// program. Kept minimal and in sync with `@eldrajs/vite-plugin-theme`'s own equivalent internal
// declaration.
declare module 'virtual:eldra/manifest' {
  const manifest: { messages?: { defaultLocale: string } };
  export default manifest;
}
