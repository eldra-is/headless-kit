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

/** The three catalog ids a route template may name instead of a CMS schema,
 * plus the home seed. `catalog:product` / `catalog:collection` /
 * `catalog:category` are reserved ids resolved against the catalog at render
 * time, not CMS schemas. */
export type TemplateSeedSchemaApiId =
  | 'catalog:product'
  | 'catalog:collection'
  | 'catalog:category'
  | 'home';

/** A seed's other target: a static site **Page** at `/<slug>`, rather than a
 * route template. A seed names one or the other — `schemaApiId`/`routePattern`
 * for a template, `page` for a page — never both. */
export interface PageSeedTarget {
  /** The page's own slug, the whole path it serves (`cart` -> `/cart`). The
   * pattern is the platform's own slug rule, so the scan refuses what the
   * deploy would refuse. */
  slug: string;
}

/** A page seed's block as a theme declares it: the block it is an instance of
 * and the data it is seeded with, plus whether the node Core creates for it is
 * locked. A page seed carries no node ids — it declares no layout, so there is
 * nothing for an id to be referenced from, and Core mints the nodes itself. */
export interface DeclaredPageSeedBlock {
  apiId: string;
  data: Record<string, unknown>;
  /**
   * `true` makes the layout node Core creates **locked**: the author may
   * reorder it and edit its fields, but not delete it or move it out of the
   * page root. It is how a page whose whole purpose is one block — a cart, a
   * search results page — cannot lose that block. Only a page seed's blocks
   * may carry it; a route template's blocks may not.
   */
  required?: true;
}

/** A page seed's placement of one of the site's two shared regions, in the
 * page's block order. It carries no data: the block behind the region is
 * `templateRoles`, and Core resolves the placement to the site's own reusable
 * component, so every seeded page shares one header and one footer. */
export interface DeclaredPageSeedRegion {
  role: 'header' | 'footer';
}

/** One entry of a page seed's ordered block list. */
export type DeclaredPageSeedEntry = DeclaredPageSeedBlock | DeclaredPageSeedRegion;

/** A page seed's block as the manifest carries it. `type` is the block's
 * `apiId`; the key is named for the layout node Core creates from it. */
export interface ManifestPageSeedBlock {
  type: string;
  data: Record<string, unknown>;
  /** Emitted only when the theme declared it, so a seed of ordinary blocks
   * keeps emitting the shape it would have had without this key. */
  required?: true;
}

/** A shared region's placement as the manifest carries it: the reserved types
 * `@header` and `@footer`, which cannot collide with a block apiId. */
export interface ManifestPageSeedRegion {
  type: '@header' | '@footer';
}

/** One entry of the emitted `blocks` array, which **is** the page in document
 * order: Core synthesises the one-column layout from it. */
export type ManifestPageSeedEntry = ManifestPageSeedBlock | ManifestPageSeedRegion;

/** A static site page the theme seeds, as the manifest carries it: Core creates
 * the Page (published, at `/<slug>`) on deploy when the organization has no
 * page with that slug, lays its blocks out in one column in this order, and
 * locks every `required` one. */
export interface ManifestPageSeed {
  slug: string;
  title: string;
  blocks: ManifestPageSeedEntry[];
}

export interface ManifestTemplateSeedBlock {
  id: string;
  apiId: string;
  data: Record<string, unknown>;
}

/** A seed block as a theme declares it: the manifest shape plus the optional
 * template bindings that belong to the block's *node* in the seed's layout —
 * how a catalog-backed template fills the block in from the object the route
 * resolved (`{ currentTitle: '{{ title }}' }`), rather than pinning one
 * product or collection into the seed data. Both are keyed by a target path
 * into the block's own fields. */
export interface DeclaredTemplateSeedBlock extends ManifestTemplateSeedBlock {
  /** Text templates: `{{ path }}` tokens resolved against the routed entry. */
  templates?: Record<string, string>;
  /** Whole-value bindings: a path on the routed entry, copied into the field. */
  bindings?: Record<string, string>;
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
  /** Carried over from the seed block that declared them. Emitted only when
   * the block declared any, so a seed without bindings keeps emitting the node
   * an older Core already accepts. */
  templates?: Record<string, string>;
  bindings?: Record<string, string>;
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

/** The block data behind the `header`/`footer` roles a template seed's layout
 * may reference: the theme block and the data instance a site's reusable
 * header/footer component is seeded from on first deploy. Required whenever
 * any declared template seed's layout places that role. */
export interface ManifestTemplateRoles {
  header?: { apiId: string; data: Record<string, unknown> };
  footer?: { apiId: string; data: Record<string, unknown> };
}

/** A static page seed as a theme declares it: a title, the slug the page is
 * created at, and the page's content in document order — blocks, and the
 * placements of the site's shared header and footer among them. There is no
 * `layout`: the list **is** the page, and Core lays it out in one column. */
export interface DeclaredPageSeed {
  page: PageSeedTarget;
  title: string;
  blocks: DeclaredPageSeedEntry[];
}

/** One entry of a theme's `templates` option: a route-template (or home) seed,
 * or a static page seed. The two are told apart by the target they name. */
export type DeclaredSeed = DeclaredTemplateSeed | DeclaredPageSeed;

/** A template seed as a theme declares it. */
export interface DeclaredTemplateSeed {
  routePattern: string;
  schemaApiId: TemplateSeedSchemaApiId;
  title: string;
  blocks: DeclaredTemplateSeedBlock[];
  /** Omit to get a column of the blocks in order, framed by the roles below. */
  layout?: TemplateSeedLayout;
  /** Place the header role before the blocks (default true). Scanner input
   * only — never emitted to the manifest. */
  header?: boolean;
  /** Place the footer role after the blocks (default true). Scanner input
   * only — never emitted to the manifest. */
  footer?: boolean;
}

/**
 * Conditional visibility for a block field: the field is shown to an author
 * only while the named sibling holds one of `in`'s values. `field` names a
 * sibling in the *same* field set — top level, or the same composite / list
 * item — which must be a `select`, `bool` or `string` field carrying no
 * `showWhen` of its own (conditions do not chain).
 *
 * `equals` is sugar for a single-entry `in`; the scanner normalizes it away, so
 * a manifest always carries `in`. Visibility is authoring UX, not storage:
 * adding, changing or removing it is never a breaking field change and never
 * needs a version bump.
 */
export interface BlockFieldShowWhen {
  field: string;
  in?: string[];
  equals?: string;
}

/** What a `link` field's value points at. Six are destinations; `none` is a
 * heading — a row that groups the links under it and goes nowhere itself, which
 * is the only shape a mega-menu column heading has. Core validates a stored
 * value against the same seven. */
export type LinkKind = 'product' | 'collection' | 'category' | 'entry' | 'page' | 'url' | 'none';

/** The whole metadata surface a `link` field may declare. Core's field
 * registry allows exactly these three keys on the type and refuses any other,
 * so a block declaring more is refused at ingest rather than at render. */
export interface BlockFieldLinkMetadata {
  /** The kinds an author may pick from; every kind when absent. */
  kinds?: LinkKind[];
  /** Restricts `kind: "entry"` to entries of the named schemas. */
  allowedEntrySchemaApiIds?: string[];
  /** Author this link as a tree of one level of children. Declared on the
   * link itself — a `list` may declare only `allowedSchemas` and `item` — so a
   * `link` carrying it must be a list's item. */
  tree?: boolean;
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
  /** Show this field only while a sibling holds one of the listed values. */
  showWhen?: BlockFieldShowWhen;
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

/** One field's values converted into a `link` field's on deploy. `from` is read
 * and `to` is written; `from` is never deleted, so the engine's ordinary
 * retirement pass stashes it as `<from>__v<previousVersion>` and anything the
 * old shape carried and a link cannot hold stays readable. */
export interface BlockMigrationLinkConversion {
  /** The field read, as the previous local manifest names it. */
  from: string;
  /** The `link` field written — or the `list` of links, for `shape: "list"`. */
  to: string;
  /** What `from` was: a string holding an href, or a list of composites. */
  shape: 'string' | 'list';
  /** The child (or, for `shape: "string"`, the sibling field) holding the label. */
  label?: string;
  /** `shape: "list"` only: the child holding the href. */
  url?: string;
  /** `shape: "list"` only: the child holding the column heading. */
  group?: string;
  /**
   * `shape: "list"` only: the child list holding the nested links, and the key
   * names those nested rows use. They are named separately because the row
   * above rarely uses the same ones — a footer column is `{title, links[]}`
   * while each link under it is `{label, href}`. Each name falls back to the
   * step's own when it is left out.
   */
  children?: {
    from: string;
    label?: string;
    url?: string;
    group?: string;
  };
}

export interface BlockMigration {
  version: number;
  /** Optional: a step may carry only conversions. A step must declare at least
   * one of `renames` and `convertToLink`. */
  renames?: Array<{ from: string; to: string }>;
  convertToLink?: BlockMigrationLinkConversion[];
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
  /** The block data behind the `header`/`footer` roles a declared template
   * seed's layout references. Absent rather than empty when the theme
   * declares no roles, for the same reason `templates` is absent when empty. */
  templateRoles?: ManifestTemplateRoles;
  /** The static Pages the site is seeded with, `/<slug>` each. The home page
   * is **not** one of them: it keeps being the `templates` entry it has always
   * been, which Core maps to a Page itself, so this manifest's home seed is
   * byte-identical to the one themes have always emitted. Absent rather than
   * empty when the theme seeds no pages, for the same reason `templates` is. */
  pageSeeds?: ManifestPageSeed[];
  tokens: ThemeDesignTokens | LegacyThemeTokens;
  /** The theme's own message catalogue, read from `i18n/<tag>.json` and
   *  flattened to dotted keys. Absent rather than empty when the theme ships
   *  no `i18n/` directory, so a theme that declares no texts keeps emitting
   *  the manifest shape an older Core already accepts. */
  messages?: ThemeMessages;
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

/** The theme's own message catalogue — `i18n/<tag>.json`, flattened to dotted
 *  keys. `defaultLocale` is the locale whose key set every other locale's keys
 *  must be a subset of; see `ThemeManifest['messages']` for why it is absent
 *  rather than present-but-empty when the theme ships none. */
export interface ThemeMessages {
  defaultLocale: string;
  locales: Record<string, Record<string, string>>;
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
  /** The seeds a site is created with: route templates (at most 8) and static
   * pages (at most 8). */
  templates?: DeclaredSeed[];
  /** The block data behind the `header`/`footer` roles the declared
   * `templates` layouts may reference. Required for a role once any template
   * seed's layout places it. */
  templateRoles?: ManifestTemplateRoles;
  /** The theme's raw, as-configured breakpoints — validated and defaulted
   * into the manifest's `breakpoints` by resolveLayoutBreakpoints (Core),
   * not here. */
  breakpoints?: LayoutBreakpoints;
}

export interface EldraThemeOptions {
  framework?: string;
  routes?: ManifestRoute[];
  customPages?: DeclaredThemeCodePage[];
  /** The seeds a site is created with on its first deploy: the route templates
   * a merchant gets without building anything (the product and collection
   * pages, the home page), at most 8, and the static **page** seeds beside them
   * (`{ page: { slug }, title, blocks }`), also at most 8 — a page at
   * `/<slug>` whose `required` blocks the author cannot delete. A seed is
   * ignored once the site has a template for its pattern, or a page with its
   * slug, so a merchant's edits are never overwritten. */
  templates?: DeclaredSeed[];
  /** The block data behind the `header`/`footer` roles the declared
   * `templates` layouts may reference. Required for a role once any template
   * seed's layout places it. */
  templateRoles?: ManifestTemplateRoles;
  /** Theme source root. Nuxt 4 sets Vite's root to app/, so adapters pass rootDir explicitly. */
  themeDir?: string;
  /** Opt in to the Tailwind v4 virtual theme module; false keeps Tailwind entirely optional. */
  tailwind?: boolean;
  /** The theme's own tablet/normal layout breakpoints (min-width px).
   * Validated and defaulted (768/1024) into the manifest by Core's
   * resolveLayoutBreakpoints; an invalid pair here falls back with a console
   * warning rather than failing the build. */
  breakpoints?: LayoutBreakpoints;
  /**
   * Transforms `virtual:eldra/messages`'s content before it is served — called with the
   * manifest's own `messages` block (or the fallback catalogue, `{ defaultLocale: 'en-US',
   * locales: {} }`, when the theme ships no `i18n/` directory) and returning what the virtual
   * module actually exports. Absent, the module keeps serving that input unchanged.
   *
   * The one caller today is `@eldrajs/theme-nuxt`: it reads the public platform route once per
   * build (a read this package knows nothing about) and, once that read settles, sets this to a
   * closure merging the platform's response over whatever manifest messages it is handed
   * (`@eldrajs/theme-core/i18n`'s `mergeMessageCatalogues`/`resolveMessageCatalogue`) — set on the
   * same options object this function closed over, after `eldraTheme(options)` was already called,
   * which works because `load()` (like every other hook here) reads `options` through the closure,
   * not a snapshot taken at construction time, and Nuxt's own module `setup()` always finishes —
   * platform read included — before Vite's build hooks run.
   */
  resolveMessages?: (themeMessages: ThemeMessages) => ThemeMessages;
  /**
   * Transforms `virtual:eldra/tokens.css`'s content before it is served — called with the
   * manifest's own `tokens` block (the theme's raw, as-authored `tokens.json`) and returning the
   * `ThemeDesignTokens` the virtual module renders into generic `--eldra-color-*`/
   * `--eldra-container-*` CSS. Absent, the module keeps rendering
   * `normalizeThemeDesignTokens(manifest.tokens)` unchanged.
   *
   * The one caller today is `@eldrajs/theme-nuxt`: it reads the public platform route once per
   * build (a read this package knows nothing about) and, once that read settles, sets this to a
   * closure answering the platform's resolved catalog when the read succeeded, falling back to
   * `normalizeThemeDesignTokens(manifestTokens)` otherwise — set on the same options object this
   * function closed over, after `eldraTheme(options)` was already called, which works because
   * `load()` (like every other hook here) reads `options` through the closure, not a snapshot taken
   * at construction time, and Nuxt's own module `setup()` always finishes — platform read included
   * — before Vite's build hooks run.
   */
  resolveTokens?: (manifestTokens: ThemeDesignTokens | LegacyThemeTokens) => ThemeDesignTokens;
}
