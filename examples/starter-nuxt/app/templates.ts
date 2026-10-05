import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  DeclaredPageSeed,
  DeclaredSeed,
  DeclaredTemplateSeed,
  DeclaredTemplateSeedBlock,
  ManifestTemplateRoles,
} from '@eldrajs/vite-plugin-theme';

/**
 * The default pages and route templates this theme seeds a site with on its
 * first deploy, built from the sample pages in `pages/*.page.json` so there is
 * exactly one copy of the starter's product, collection, home, cart, wishlist
 * and search page — the one Storybook renders (`stories/pages/*.stories.ts`),
 * the one `test/pages/*.spec.ts` exercises, and the one a merchant lands in the
 * page builder with.
 *
 * Read at config time only: `nuxt.config.ts` passes the result to
 * `eldra.templates` / `eldra.templateRoles`, which
 * `@eldrajs/vite-plugin-theme` validates and writes into
 * `.eldra/manifest.json`; Core seeds from that on deploy. Nothing here ships
 * in the browser bundle, which is why `node:fs` is fine in an `app/` file
 * (nothing under `app/` imports this module — only `nuxt.config.ts` and the
 * starter's own tests do).
 *
 * Three shapes leave this file:
 *
 * - `starterTemplates()` — one seed per template. Its `blocks` are the
 *   fixture's blocks **minus** `navigation` and `footer`: those two travel
 *   separately as roles (below) and the scanner's `header`/`footer` switches
 *   (default true) place them around every seed, so Core resolves them to the
 *   site's own reusable components rather than seeding a second copy per page.
 *   A catalog seed also drops everything that names the fixture's own product or
 *   collection (`CATALOG_SEED_SHAPE`, `CATALOG_SEED_DROPPED_ITEMS`), binding the
 *   fields the routed object carries itself, so each page renders the object its
 *   route resolved.
 * - `starterPages()` — one **page** seed per fixture that declares
 *   `page: { slug }` rather than backing a route template: `/cart`,
 *   `/wishlist` and `/search`, which used to be code routes under `app/pages/`
 *   and are now documents a merchant composes. Their blocks are the fixture's
 *   minus the same two roles, and the one block the page exists for carries
 *   `required: true`, so Core creates its layout node locked and an author can
 *   reorder it and edit its copy but never delete it.
 * - `starterTemplateRoles()` — the `navigation` and `footer` block data behind
 *   those roles, taken from the home page fixture (every fixture carries the
 *   same header and footer).
 *
 * `starterSeeds()` is the two seed halves in one list, which is what
 * `eldra.templates` takes (`nuxt.config.ts` and `.storybook/main.ts` both pass
 * it, so the `.eldra/manifest.json` the two builds write is the same file).
 *
 * Both run their block data through `stripSeedMedia`, because a seed is the
 * write Core makes on deploy and the CMS only accepts `{ assetId: <uuid> }`
 * for a media field — exactly the rule `mock.json` obeys. The sample pages
 * carry demo imagery (`{ assetId: "demo-hero", url, altText, … }`) for
 * Storybook and the page specs, and that cannot be seeded.
 */

/** The block a role's data comes from, and the block a seed therefore drops. */
const ROLE_BLOCKS = { header: 'navigation', footer: 'footer' } as const;

/**
 * How a **catalog** seed differs from the sample page it is built from, per
 * block.
 *
 * A sample page names one product and one collection — that is what makes it a
 * realistic page — and a route template must name none: it renders whatever
 * object its `:slug` resolved to. Every field below either says which object to
 * show (a product handle, a collection reference), or repeats the fixture's own
 * copy for it (a title, a description, a trail, a link into its category), so a
 * seed drops it and, where the routed object carries the same thing, binds the
 * field to it instead:
 *
 * - `strip` — dropped outright. The commerce blocks read the route when their
 *   own field is empty (`storefront.route.productHandle` /
 *   `collectionHandle`, the "field wins, route is the fallback" contract each
 *   block's own `helpText` describes), and the editorial fields fall back to the
 *   storefront object the same way.
 * - `emptyLists` — emptied rather than dropped, for a list whose items are the
 *   fixture's own levels or links and where an empty list is a shape the block
 *   already renders (`breadcrumbs`' `trail`, which still shows the Home crumb
 *   from `showHome`; `collection-header`'s `subcollections`).
 * - `templates` — the text templates the seed's layout node carries, so the
 *   block shows the routed object's own value (`{{ title }}` resolves against
 *   the catalog projection `@eldrajs/theme-nuxt` binds a catalog route to).
 *
 * `product-carousel` appears here for the **product** seed only — its `related`
 * variant reads the route — while the home seed keeps its `sourceCollection`,
 * because `/` has no route context to fall back to and the carousel has no route
 * fallback at all. That seed names the collection by slug
 * (`{ "_type": "collection", "slug": "the-winter-edit" }`), the only form a
 * theme can ship: Core resolves it against the organisation's own catalog on
 * deploy, and leaves the field empty when nothing matches.
 *
 * Two fields are stripped without a binding on purpose. `collection-header`'s
 * `description` is rich text and a text template renders a string, so there is
 * nothing to bind it to; the block already falls back to the collection's own
 * description, which is the same value. `product-carousel`'s `viewAllHref`
 * points at the fixture product's category, and no projection path holds the
 * routed product's category URL.
 */
const CATALOG_SEED_SHAPE: Readonly<
  Record<
    string,
    {
      strip?: readonly string[];
      emptyLists?: readonly string[];
      templates?: Readonly<Record<string, string>>;
    }
  >
> = {
  breadcrumbs: {
    strip: ['currentTitle'],
    emptyLists: ['trail'],
    templates: { currentTitle: '{{ title }}' },
  },
  'product-detail': { strip: ['productHandle'] },
  'product-carousel': { strip: ['viewAllHref'] },
  'collection-header': {
    strip: ['collection', 'title', 'description'],
    emptyLists: ['trail', 'subcollections'],
    templates: { title: '{{ title }}' },
  },
  'collection-grid': { strip: ['collection'] },
};

/**
 * List items a catalog seed drops, named by the item field a reader recognises
 * them by. One case today: `product-detail`'s "Details" tab is the fixture
 * product's own description ("extra-fine Merino…, 17.5 micron, model is 180 cm")
 * — copy about one product, in a tab every product would show. The block has no
 * other place for a product description, so the seeded template keeps only the
 * store-wide tabs (Shipping, Returns). Binding `tabs.0.body` to the routed
 * product's `description` was the alternative and was not taken: a binding into
 * a list index fails the whole layout render once an editor reorders or removes
 * that tab, which is not a failure mode to seed a merchant's product page with.
 */
const CATALOG_SEED_DROPPED_ITEMS: Readonly<
  Record<string, { list: string; itemField: string; values: readonly string[] }>
> = {
  'product-detail': { list: 'tabs', itemField: 'label', values: ['Details'] },
};

/**
 * Title is the *template's* name in Studio's template list, not the sample
 * page's own title — `pages/collection.page.json` is titled "The winter edit",
 * which names one collection rather than the template every collection renders
 * through.
 */
const SEEDS: ReadonlyArray<{
  fixture: string;
  routePattern: string;
  schemaApiId: DeclaredTemplateSeed['schemaApiId'];
  title: string;
}> = [
  {
    fixture: 'product',
    routePattern: '/products/:slug',
    schemaApiId: 'catalog:product',
    title: 'Product',
  },
  {
    fixture: 'collection',
    routePattern: '/collections/:slug',
    schemaApiId: 'catalog:collection',
    title: 'Collection',
  },
  { fixture: 'home', routePattern: '/', schemaApiId: 'home', title: 'Home' },
];

/**
 * The fixtures that seed a **page** rather than a route template, and — for
 * each — the one block the page exists for, whose node Core creates locked.
 *
 * Naming the block rather than reading a flag out of the fixture keeps the
 * fixture a plain page document: `pages/cart.page.json` is the same shape a CMS
 * page has, and "this one cannot be deleted" is a fact about the seed, not
 * about the page a merchant ends up editing.
 */
const PAGE_SEEDS: ReadonlyArray<{ fixture: string; required: string }> = [
  { fixture: 'cart', required: 'cart' },
  { fixture: 'wishlist', required: 'wishlist' },
  { fixture: 'search', required: 'search' },
];

/** Every seed `eldra.templates` carries: the route templates, then the pages. */
export function starterSeeds(): DeclaredSeed[] {
  return [...starterTemplates(), ...starterPages()];
}

/**
 * The seeded pages, in manifest declaration order.
 *
 * A page seed has no layout: its entry list **is** the page, in the fixture's
 * own block order, and Core lays it out in one column. So unlike a template
 * seed — which drops the two role blocks and lets the scanner's
 * `header`/`footer` switches frame the generated layout — this maps each of
 * them to a *region placement* where it stands: `navigation` becomes
 * `{ role: 'header' }` and `footer` becomes `{ role: 'footer' }`, keeping the
 * announcement bar above the header exactly as the fixture has it. Their block
 * data still travels once, as `starterTemplateRoles()`, and Core resolves each
 * placement to the site's own reusable component, so every seeded page and
 * template shares one header and one footer.
 *
 * The slug and title come from the fixture itself rather than from a second
 * table, so `pages/cart.page.json` is the only place `/cart`'s own identity is
 * written down.
 */
export function starterPages(): DeclaredPageSeed[] {
  return PAGE_SEEDS.map((seed) => {
    const fixture = pageFixture(seed.fixture);
    if (fixture.page === undefined) {
      throw new Error(
        `pages/${seed.fixture}.page.json seeds a page, so it must declare "page": { "slug": … }`
      );
    }
    if (!fixture.blocks.some((block) => block.apiId === seed.required)) {
      throw new Error(
        `pages/${seed.fixture}.page.json must carry a "${seed.required}" block — it is the block ` +
          'the page exists for, and the seed marks its node required'
      );
    }
    return {
      page: { slug: fixture.page.slug },
      title: fixture.title,
      blocks: fixture.blocks.map((block) => {
        const role = roleOf(block.apiId);
        if (role !== null) return { role };
        return {
          apiId: block.apiId,
          data: stripSeedMedia(block.data, blockFields(block.apiId), block.apiId),
          ...(block.apiId === seed.required ? { required: true as const } : {}),
        };
      }),
    };
  });
}

/** The seed templates, in manifest declaration order. */
export function starterTemplates(): DeclaredTemplateSeed[] {
  return SEEDS.map((seed) => ({
    routePattern: seed.routePattern,
    schemaApiId: seed.schemaApiId,
    title: seed.title,
    // `header`/`footer` are left at their default (true), so the generated
    // layout is one column: header role, the blocks below in fixture order,
    // footer role.
    blocks: pageFixture(seed.fixture)
      .blocks.filter((block) => !isRoleBlock(block.apiId))
      .map((block) => seedBlock(block, seed.schemaApiId !== 'home')),
  }));
}

/**
 * One fixture block as a seed block: its data with everything that names the
 * fixture's own product or collection removed (catalog templates only — see
 * `CATALOG_SEED_SHAPE` and `CATALOG_SEED_DROPPED_ITEMS`), then the media strip
 * every seed goes through, plus the template bindings its layout node carries.
 */
function seedBlock(block: PageFixtureBlock, catalogRoute: boolean): DeclaredTemplateSeedBlock {
  const data = { ...block.data };
  const shape = catalogRoute ? CATALOG_SEED_SHAPE[block.apiId] : undefined;
  for (const fieldId of shape?.strip ?? []) delete data[fieldId];
  for (const fieldId of shape?.emptyLists ?? []) {
    if (Array.isArray(data[fieldId])) data[fieldId] = [];
  }
  const dropped = catalogRoute ? CATALOG_SEED_DROPPED_ITEMS[block.apiId] : undefined;
  if (dropped !== undefined && Array.isArray(data[dropped.list])) {
    data[dropped.list] = (data[dropped.list] as unknown[]).filter(
      (item) => !(isRecord(item) && dropped.values.includes(String(item[dropped.itemField])))
    );
  }
  return {
    id: block.id,
    apiId: block.apiId,
    data: stripSeedMedia(data, blockFields(block.apiId), block.apiId),
    ...(shape?.templates === undefined ? {} : { templates: { ...shape.templates } }),
  };
}

/** The `header`/`footer` block data every seed's layout places. */
export function starterTemplateRoles(): ManifestTemplateRoles {
  const home = pageFixture('home');
  const role = (apiId: string): { apiId: string; data: Record<string, unknown> } => {
    const block = home.blocks.find((candidate) => candidate.apiId === apiId);
    if (block === undefined) {
      throw new Error(`pages/home.page.json declares no "${apiId}" block to seed the role from`);
    }
    return { apiId, data: stripSeedMedia(block.data, blockFields(apiId), apiId) };
  };
  return { header: role(ROLE_BLOCKS.header), footer: role(ROLE_BLOCKS.footer) };
}

/**
 * A copy of `data` with every media value the CMS would refuse removed, walked
 * against the block's own field types so a media field nested in a `composite`
 * or a `list` (`navigation`'s `links[].features[].image`, `hero`'s
 * `slides[].image`) is reached too — the same walk
 * `@eldrajs/vite-plugin-theme`'s `checkSeedMedia` reports on, which is what
 * `eldra-theme validate` applies to `mock.json`.
 *
 * A write-valid value (`{ assetId: <uuid>, framing? }`) is kept: a theme that
 * seeds a real asset id keeps it. Everything else is dropped rather than
 * blanked, because absent is what the CMS accepts for a media field and what
 * every `mock.json` already does. The input is never mutated.
 *
 * **A seed block is created *published*, so it must satisfy publish validation
 * too, not just the write-side media rule** — and a published entry cannot omit
 * a value for a `required` field. So a required media field that has no
 * write-valid value left after the strip is not something this can shrug at:
 *
 * - Inside a **list item**, the item is dropped. The list is the only unit that
 *   can be removed without inventing data, and a shorter list is a shape the
 *   block already renders (`hero`'s four demo `slides[]` all require an image,
 *   so the seeded hero gets `slides: []` — which is what its `mock.json`
 *   carries too).
 * - Anywhere else — at the top level of the block, or inside a non-list
 *   `composite` — there is nothing to drop, so the **block is unseedable** and
 *   this throws, naming the block and the field. `starterTemplates()` therefore
 *   cannot emit a seed Core would refuse to publish; it fails the build
 *   instead. No block in this starter has such a field today, which is exactly
 *   why the guard has to be here rather than in a reviewer's head.
 */
export function stripSeedMedia(
  data: Record<string, unknown>,
  fields: readonly ManifestField[],
  apiId: string
): Record<string, unknown> {
  const copy = structuredClone(data);
  const missing = stripInto(copy, fields);
  if (missing !== null) {
    throw new Error(
      `${apiId}: cannot be seeded — the required media field "${missing}" has no write-valid ` +
        `value, and a seed block is created published. Give it a real {assetId: <uuid>}, move ` +
        `the field into a list item, or drop its "required" validator.`
    );
  }
  return copy;
}

/** One field of a block's `block.json`, as the manifest carries it verbatim. */
export interface ManifestField {
  fieldId: string;
  type: string;
  validators?: { required?: boolean; [key: string]: unknown };
  metadata?: {
    multiple?: boolean;
    fields?: ManifestField[];
    item?: ManifestField;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface PageFixtureBlock {
  id: string;
  apiId: string;
  data: Record<string, unknown>;
}

interface PageFixture {
  /** The sample page's own template name — documentation, for a fixture that
   * backs a route template or no seed at all. */
  template?: string;
  /** Set instead of `template` by a fixture that seeds a static **page**: the
   * slug it is created at (`cart` → `/cart`). */
  page?: { slug: string };
  title: string;
  blocks: PageFixtureBlock[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_VALUE_KEYS = new Set(['assetId', 'framing']);

function isRoleBlock(apiId: string): boolean {
  return roleOf(apiId) !== null;
}

/** Which page region a fixture block *is*, or null for an ordinary block. */
function roleOf(apiId: string): 'header' | 'footer' | null {
  if (apiId === ROLE_BLOCKS.header) return 'header';
  if (apiId === ROLE_BLOCKS.footer) return 'footer';
  return null;
}

/**
 * Strips `data` in place and returns the path of the first **required** media
 * field left without a write-valid value, or `null`. A list item that reports
 * one is dropped here — that is the only place a missing required value can be
 * resolved without inventing data — so a non-null return always means the
 * caller has nothing left to drop.
 */
function stripInto(
  data: Record<string, unknown>,
  fields: readonly ManifestField[],
  prefix = ''
): string | null {
  for (const field of fields) {
    const fieldId = field.fieldId;
    if (typeof fieldId !== 'string' || fieldId === '') continue;
    const path = prefix === '' ? fieldId : `${prefix}.${fieldId}`;
    const metadata = isRecord(field.metadata) ? field.metadata : {};

    if (field.type === 'media') {
      // Checked even when the key is absent: a required media field the
      // fixture never set is just as unpublishable as one this strips.
      if (Object.hasOwn(data, fieldId)) {
        const value = data[fieldId];
        if (metadata.multiple === true && Array.isArray(value))
          keepValidMedia(data, fieldId, value);
        else if (!isWriteValidMedia(value)) delete data[fieldId];
      }
      if (isRequired(field) && !Object.hasOwn(data, fieldId)) return path;
      continue;
    }

    if (!Object.hasOwn(data, fieldId)) continue;
    const value = data[fieldId];

    if (field.type === 'composite') {
      // No unit to drop here — a composite is one value, so a missing required
      // media inside it travels up to the nearest list item, or out of the block.
      if (isRecord(value)) {
        const missing = stripInto(value, fieldList(metadata.fields), path);
        if (missing !== null) return missing;
      }
      continue;
    }

    if (field.type === 'list') {
      const item = isRecord(metadata.item) ? (metadata.item as ManifestField) : null;
      if (item === null || !Array.isArray(value)) continue;
      if (item.type === 'media') {
        // A required media *item* means every member must be valid, and an
        // invalid one is simply not kept — `keepValidMedia` already does that.
        keepValidMedia(data, fieldId, value);
        continue;
      }
      const itemFields =
        item.type === 'composite'
          ? fieldList(isRecord(item.metadata) ? item.metadata.fields : undefined)
          : [];
      if (itemFields.length === 0) continue;
      const kept: unknown[] = [];
      for (const entry of value) {
        if (!isRecord(entry)) {
          kept.push(entry);
          continue;
        }
        // A list item whose required media cannot survive the strip is dropped
        // whole: the item is the smallest thing that can go, and a shorter list
        // is a shape the block already renders.
        if (stripInto(entry, itemFields, `${path}[]`) === null) kept.push(entry);
      }
      data[fieldId] = kept;
    }
  }
  return null;
}

/** Keep only the write-valid members of a multi-value media field; a field
 * left with nothing is dropped rather than seeded as an empty list, so it
 * reads exactly like a media field a `mock.json` omits. */
function keepValidMedia(data: Record<string, unknown>, fieldId: string, value: unknown[]): void {
  const kept = value.filter(isWriteValidMedia);
  if (kept.length === 0) delete data[fieldId];
  else data[fieldId] = kept;
}

function isRequired(field: ManifestField): boolean {
  const validators = field.validators;
  return isRecord(validators) && validators.required === true;
}

/** The one media shape the CMS accepts on write — the rule
 * `@eldrajs/vite-plugin-theme` enforces for `mock.json` and for seeds. */
function isWriteValidMedia(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    Object.keys(value).every((key) => MEDIA_VALUE_KEYS.has(key)) &&
    typeof value.assetId === 'string' &&
    UUID_PATTERN.test(value.assetId)
  );
}

function fieldList(value: unknown): ManifestField[] {
  return Array.isArray(value) ? (value as ManifestField[]) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const fixtures = new Map<string, PageFixture>();
const fields = new Map<string, ManifestField[]>();

function pageFixture(name: string): PageFixture {
  let fixture = fixtures.get(name);
  if (fixture === undefined) {
    fixture = readJson<PageFixture>(`../pages/${name}.page.json`);
    fixtures.set(name, fixture);
  }
  return fixture;
}

/** A block's declared fields, read straight from its `block.json` — the
 * scanner copies them into the manifest verbatim, so these *are* the manifest
 * field types the media walk needs. */
function blockFields(apiId: string): ManifestField[] {
  let declared = fields.get(apiId);
  if (declared === undefined) {
    declared = fieldList(readJson<{ fields?: unknown }>(`../blocks/${apiId}/block.json`).fields);
    fields.set(apiId, declared);
  }
  return declared;
}

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')) as T;
}
