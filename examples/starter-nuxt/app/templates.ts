import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DeclaredTemplateSeed, ManifestTemplateRoles } from '@eldrajs/vite-plugin-theme';

/**
 * The default page templates this theme seeds a site with on its first deploy,
 * built from the sample pages in `pages/*.page.json` so there is exactly one
 * copy of the starter's product, collection and home page — the one Storybook
 * renders (`stories/pages/*.stories.ts`), the one `test/pages/*.spec.ts`
 * exercises, and the one a merchant lands in the page builder with.
 *
 * Read at config time only: `nuxt.config.ts` passes the result to
 * `eldra.templates` / `eldra.templateRoles`, which
 * `@eldrajs/vite-plugin-theme` validates and writes into
 * `.eldra/manifest.json`; Core seeds from that on deploy. Nothing here ships
 * in the browser bundle, which is why `node:fs` is fine in an `app/` file
 * (nothing under `app/` imports this module — only `nuxt.config.ts` and the
 * starter's own tests do).
 *
 * Two shapes leave this file:
 *
 * - `starterTemplates()` — one seed per template. Its `blocks` are the
 *   fixture's blocks **minus** `navigation` and `footer`: those two travel
 *   separately as roles (below) and the scanner's `header`/`footer` switches
 *   (default true) place them around every seed, so Core resolves them to the
 *   site's own reusable components rather than seeding a second copy per page.
 * - `starterTemplateRoles()` — the `navigation` and `footer` block data behind
 *   those roles, taken from the home page fixture (all three fixtures carry
 *   the same header and footer).
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
      .map((block) => ({
        id: block.id,
        apiId: block.apiId,
        data: stripSeedMedia(block.data, blockFields(block.apiId)),
      })),
  }));
}

/** The `header`/`footer` block data every seed's layout places. */
export function starterTemplateRoles(): ManifestTemplateRoles {
  const home = pageFixture('home');
  const role = (apiId: string): { apiId: string; data: Record<string, unknown> } => {
    const block = home.blocks.find((candidate) => candidate.apiId === apiId);
    if (block === undefined) {
      throw new Error(`pages/home.page.json declares no "${apiId}" block to seed the role from`);
    }
    return { apiId, data: stripSeedMedia(block.data, blockFields(apiId)) };
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
 */
export function stripSeedMedia(
  data: Record<string, unknown>,
  fields: readonly ManifestField[]
): Record<string, unknown> {
  const copy = structuredClone(data);
  stripInto(copy, fields);
  return copy;
}

/** One field of a block's `block.json`, as the manifest carries it verbatim. */
export interface ManifestField {
  fieldId: string;
  type: string;
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
  template: string;
  title: string;
  blocks: PageFixtureBlock[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_VALUE_KEYS = new Set(['assetId', 'framing']);

function isRoleBlock(apiId: string): boolean {
  return apiId === ROLE_BLOCKS.header || apiId === ROLE_BLOCKS.footer;
}

function stripInto(data: Record<string, unknown>, fields: readonly ManifestField[]): void {
  for (const field of fields) {
    const fieldId = field.fieldId;
    if (typeof fieldId !== 'string' || fieldId === '' || !Object.hasOwn(data, fieldId)) continue;
    const value = data[fieldId];
    const metadata = isRecord(field.metadata) ? field.metadata : {};

    if (field.type === 'media') {
      if (metadata.multiple === true && Array.isArray(value)) keepValidMedia(data, fieldId, value);
      else if (!isWriteValidMedia(value)) delete data[fieldId];
      continue;
    }

    if (field.type === 'composite') {
      if (isRecord(value)) stripInto(value, fieldList(metadata.fields));
      continue;
    }

    if (field.type === 'list') {
      const item = isRecord(metadata.item) ? (metadata.item as ManifestField) : null;
      if (item === null || !Array.isArray(value)) continue;
      if (item.type === 'media') {
        keepValidMedia(data, fieldId, value);
        continue;
      }
      const itemFields =
        item.type === 'composite'
          ? fieldList(isRecord(item.metadata) ? item.metadata.fields : undefined)
          : [];
      if (itemFields.length === 0) continue;
      for (const entry of value) if (isRecord(entry)) stripInto(entry, itemFields);
    }
  }
}

/** Keep only the write-valid members of a multi-value media field; a field
 * left with nothing is dropped rather than seeded as an empty list, so it
 * reads exactly like a media field a `mock.json` omits. */
function keepValidMedia(data: Record<string, unknown>, fieldId: string, value: unknown[]): void {
  const kept = value.filter(isWriteValidMedia);
  if (kept.length === 0) delete data[fieldId];
  else data[fieldId] = kept;
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
