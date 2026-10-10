declare module 'virtual:eldra/blocks' {
  import type { Component } from 'vue';

  const blocks: Record<string, () => Promise<{ default: Component }>>;
  export default blocks;
}

declare module 'virtual:eldra/manifest' {
  import type { BlockSlotDefinition } from '@eldrajs/theme-core';

  // No `breakpoints` here: the manifest is exactly what is persisted to
  // `.eldra/manifest.json` and uploaded; Core's ingest rejects an
  // unrecognized top-level key. The resolved breakpoints travel through the
  // separate `virtual:eldra/breakpoints` module below instead.
  const manifest: {
    blocks?: Array<{ apiId?: string; slots?: BlockSlotDefinition[] }>;
  };
  export default manifest;
}

declare module 'virtual:eldra/breakpoints' {
  import type { LayoutBreakpoints } from '@eldrajs/theme-core';

  const breakpoints: LayoutBreakpoints;
  export default breakpoints;
}
