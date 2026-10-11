declare module 'virtual:eldra/manifest' {
  import type { ThemeManifest } from '@eldrajs/vite-plugin-theme';
  const manifest: ThemeManifest;
  export default manifest;
}

declare module 'virtual:eldra/blocks' {
  const blocks: Record<string, () => Promise<{ default: unknown }>>;
  export default blocks;
}

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

declare module 'virtual:eldra/messages' {
  const messages: { defaultLocale: string; locales: Record<string, Record<string, string>> };
  export default messages;
}

declare module 'virtual:eldra/tokens.css' {}
declare module 'virtual:eldra/tailwind-theme.css' {}
