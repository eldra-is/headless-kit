import type { ThemeDesignTokens } from '@eldrajs/theme-core/design-tokens';
import type { LayoutBreakpoints } from '@eldrajs/theme-core/layout';

export interface ManifestRoute {
  pattern: string;
  kind: 'page' | 'entry';
  schemaApiId?: string;
  field?: string;
}

export interface DeclaredThemeCodePage {
  path: string;
  title: string;
  description?: string;
}

/** The two catalog ids a route template may name instead of a CMS schema, plus
 * the home seed. `catalog:product` / `catalog:collection` are reserved ids
 * resolved against the catalog at render time, not CMS schemas. */
export type TemplateSeedSchemaApiId = 'catalog:product' | 'catalog:collection' | 'home';

export interface ManifestTemplateSeedBlock {
  id: string;
  apiId: string;
  data: Record<string, unknown>;
}

/** A reusable component named by the role it fills rather than by id: the theme
 * cannot know a site's component ids, so the role is resolved on deploy. */
export interface TemplateSeedReusableNode {
  id: string;
  type: 'reusable';
  role: 'header' | 'footer';
}

export interface TemplateSeedBlockNode {
  id: string;
  type: 'block';
  /** The id of one of the seed's own `blocks[]`, not a CMS entry id. */
  entryId: string;
}

export type TemplateSeedLayoutNode = TemplateSeedReusableNode | TemplateSeedBlockNode;

/** A single column of role and block nodes — the only layout shape a seed may
 * take, so what ships is exactly what the deploy decodes. */
export interface TemplateSeedLayout {
  version: 1;
  root: {
    id: string;
    type: 'flex';
    layout: { direction: { normal: 'column' } };
    children: TemplateSeedLayoutNode[];
  };
}

/** A template seed as it is emitted to the manifest: a layout is always
 * present, and the declaration-only `header`/`footer` switches are gone. */
export interface ManifestTemplateSeed {
  routePattern: string;
  schemaApiId: TemplateSeedSchemaApiId;
  title: string;
  blocks: ManifestTemplateSeedBlock[];
  layout: TemplateSeedLayout;
}

/** A template seed as a theme declares it. */
export interface DeclaredTemplateSeed {
  routePattern: string;
  schemaApiId: TemplateSeedSchemaApiId;
  title: string;
  blocks: ManifestTemplateSeedBlock[];
  /** Omit to get a column of the blocks in order, framed by the roles below. */
  layout?: TemplateSeedLayout;
  /** Place the header role before the blocks (default true). Scanner input
   * only — never emitted to the manifest. */
  header?: boolean;
  /** Place the footer role after the blocks (default true). Scanner input
   * only — never emitted to the manifest. */
  footer?: boolean;
}

export interface BlockField {
  fieldId: string;
  name: string;
  type: string;
  groupId?: string;
  isTitle?: boolean;
  localized?: boolean;
  default?: unknown;
  description?: string;
  helpText?: string;
  validators?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** `reference` fields only. A relation must name at least one target
   * (`allowedTagIds`, `allowProducts` or `allowCollections`); `allowedSchemaIds`
   * stays refused, because schema ids are not portable across organizations
   * while products and collections are catalog objects every organization has. */
  relation?: {
    allowedTagIds?: string[];
    allowProducts?: boolean;
    allowCollections?: boolean;
    multiple?: boolean;
  };
}

export interface BlockSlotDefinition {
  id: string; // ^[a-z][a-z0-9-]{0,47}$
  label: string; // 1..80 Unicode scalar values
  description?: string; // ≤240
  minItems?: 0; // v1: only 0 allowed
  maxItems: number; // 1..20
  allowedBlockApiIds?: string[]; // unique, ≤50
}

export interface BlockMigration {
  version: number;
  renames: Array<{ from: string; to: string }>;
}

export interface BlockDefinition {
  apiId: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  version: number;
  fields: BlockField[];
  groups?: Array<{ groupId: string; name: string; defaultOpen?: boolean }>;
  slots?: BlockSlotDefinition[];
  migrations?: BlockMigration[];
}

export interface ThemeManifest {
  manifestVersion: 1;
  theme: {
    name: string;
    version: string;
    framework: string;
    sdk: { core: string; vitePlugin: string };
  };
  blocks: Array<
    Record<string, unknown> & {
      mock: Record<string, unknown>;
      previewImage: string | null;
    }
  >;
  routes: ManifestRoute[];
  customPages: DeclaredThemeCodePage[];
  /** Default templates the site is seeded with on its first deploy. Absent
   * rather than empty when the theme declares none, so a theme that seeds
   * nothing keeps emitting the manifest an older Core already accepts. */
  templates?: ManifestTemplateSeed[];
  tokens: ThemeDesignTokens | LegacyThemeTokens;
  // No `breakpoints` field here: this type is exactly what is persisted to
  // disk and uploaded (`.eldra/manifest.json`), and Core's ingest validates
  // that file strictly — an unrecognized top-level key is rejected outright.
  // The resolved breakpoints reach the runtime through `ScanResult.breakpoints`
  // and the separate `virtual:eldra/breakpoints` module instead; see plugin.ts.
}

export interface LegacyThemeTokens {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  spacing: Record<string, string>;
}

export interface ScanResult {
  manifest: ThemeManifest | null;
  blockDirs: Record<string, string>;
  errors: string[];
  /** The theme's own tablet/normal layout breakpoints — resolved and
   * validated (defaults, 768/1024, when the theme configured none or
   * something invalid; see @eldrajs/theme-core's resolveLayoutBreakpoints).
   * Deliberately outside `ThemeManifest`: build-time-only, carried to the
   * runtime through `virtual:eldra/breakpoints`, never written to
   * `.eldra/manifest.json`. Always resolved, independent of `errors`. */
  breakpoints: LayoutBreakpoints;
}

export interface ScanOptions {
  /** Last validated local manifest, advisory only; Core owns installed history. */
  previousManifest?: ThemeManifest;
  themeDir: string;
  framework?: string;
  routes?: ManifestRoute[];
  customPages?: DeclaredThemeCodePage[];
  /** Default templates to seed a site with, at most 8. */
  templates?: DeclaredTemplateSeed[];
  /** The theme's raw, as-configured breakpoints — validated and defaulted
   * into the manifest's `breakpoints` by resolveLayoutBreakpoints (Core),
   * not here. */
  breakpoints?: LayoutBreakpoints;
}

export interface EldraThemeOptions {
  framework?: string;
  routes?: ManifestRoute[];
  customPages?: DeclaredThemeCodePage[];
  /** Default templates to seed a site with on its first deploy, at most 8:
   * the product and collection pages a merchant gets without building
   * anything. A seed is ignored once the site has a template for its pattern,
   * so a merchant's edits are never overwritten. */
  templates?: DeclaredTemplateSeed[];
  /** Theme source root. Nuxt 4 sets Vite's root to app/, so adapters pass rootDir explicitly. */
  themeDir?: string;
  /** Opt in to the Tailwind v4 virtual theme module; false keeps Tailwind entirely optional. */
  tailwind?: boolean;
  /** The theme's own tablet/normal layout breakpoints (min-width px).
   * Validated and defaulted (768/1024) into the manifest by Core's
   * resolveLayoutBreakpoints; an invalid pair here falls back with a console
   * warning rather than failing the build. */
  breakpoints?: LayoutBreakpoints;
}
