import Ajv, { type ErrorObject } from 'ajv';
import { RICH_TEXT_TOOLBAR_CONTROLS } from '@eldrajs/theme-core';
import {
  DesignTokenValidationError,
  normalizeThemeDesignTokens,
} from '@eldrajs/theme-core/design-tokens';
import { resolveLayoutBreakpoints } from '@eldrajs/theme-core/layout';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { blockJsonSchema } from './blockSchema';
import { migrationChecks, validMigrationFieldShape } from './migrations';
import { checkSeedMedia } from './seedData';
import { validateTemplateRoles, validateTemplateSeeds } from './templates';
import { codePointLength, isRecord, stripPlainTextControls } from './util';
import type {
  BlockDefinition,
  ManifestRoute,
  ScanOptions,
  ScanResult,
  ThemeManifest,
} from './types';

const MAX_BLOCKS = 100;
const MAX_MOCK_BYTES = 64 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_COMPOSITE_DEPTH = 5;
const MAX_CUSTOM_PAGES = 100;
const MAX_CUSTOM_PAGE_PATH_BYTES = 255;
const MAX_CUSTOM_PAGE_TITLE_LENGTH = 80;
const MAX_CUSTOM_PAGE_DESCRIPTION_LENGTH = 240;
const DEFAULT_ROUTES: ManifestRoute[] = [{ pattern: '/:path(.*)*', kind: 'page' }];
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SLOT_ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
// Mirrors Core's stripControlRunes: Unicode categories Cc (IsControl) and Cf (format).
const SLOT_CONTROL_CHARS = /[\p{Cc}\p{Cf}]/gu;
const RICH_TEXT_TOOLBAR_CONTROL_SET = new Set<string>(RICH_TEXT_TOOLBAR_CONTROLS);

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validateBlockJson = ajv.compile(blockJsonSchema);

export function scanTheme(opts: ScanOptions): ScanResult {
  const themeDir = opts.themeDir;
  const blocksDir = join(themeDir, 'blocks');
  const errors: string[] = [];
  const previous = previousBlocks(opts.previousManifest, errors);
  const blockDirs: Record<string, string> = {};
  const blocks: ThemeManifest['blocks'] = [];
  const seenApiIds = new Set<string>();
  const blockFiles = new Map<string, string>();

  const packageJson = readJsonObject(join(themeDir, 'package.json'), themeDir, errors);
  const entries = directoryNames(blocksDir, errors);
  if (entries.length > MAX_BLOCKS) {
    errors.push(`blocks: contains ${entries.length} blocks — exceeds ${MAX_BLOCKS}`);
  }

  for (const dirName of entries.slice(0, MAX_BLOCKS)) {
    const blockDir = join(blocksDir, dirName);
    const blockFile = join(blockDir, 'block.json');
    const relativeBlockFile = toRelative(themeDir, blockFile);
    const block = readJsonObject(blockFile, themeDir, errors);
    if (block === null) continue;

    const validBlock = validateBlockJson(block);
    if (!validBlock) {
      for (const error of validateBlockJson.errors ?? []) {
        errors.push(formatAjvError(relativeBlockFile, error));
      }
    }
    semanticChecks(relativeBlockFile, block, errors);
    if (validBlock)
      migrationChecks(
        relativeBlockFile,
        block as unknown as BlockDefinition,
        previous.get(String(block.apiId)),
        errors
      );

    const apiId = typeof block.apiId === 'string' ? block.apiId : dirName;
    if (apiId !== dirName) {
      errors.push(
        `${relativeBlockFile}: apiId — must match directory name "${dirName}" (got "${apiId}")`
      );
    }
    if (seenApiIds.has(apiId)) {
      errors.push(`${relativeBlockFile}: apiId — duplicate apiId "${apiId}"`);
    }
    seenApiIds.add(apiId);
    blockDirs[apiId] = blockDir;

    const componentFile = join(blockDir, 'Block.vue');
    if (!existsSync(componentFile))
      errors.push(`${toRelative(themeDir, componentFile)}: file is required`);

    const mockFile = join(blockDir, 'mock.json');
    let mock: Record<string, unknown> | null = null;
    if (existsSync(mockFile)) {
      const size = statSync(mockFile).size;
      if (size > MAX_MOCK_BYTES) {
        errors.push(`${toRelative(themeDir, mockFile)}: exceeds 64 KB (${size} bytes)`);
      } else {
        mock = readJsonObject(mockFile, themeDir, errors);
      }
    } else {
      errors.push(`${toRelative(themeDir, mockFile)}: file is required`);
    }
    if (mock !== null && validBlock) {
      const mockPath = toRelative(themeDir, mockFile);
      checkSeedMedia(
        (path, message) => `${mockPath}: ${path}: ${message}`,
        Array.isArray(block.fields) ? (block.fields as Array<Record<string, unknown>>) : [],
        mock,
        errors
      );
    }

    let previewImage: string | null = null;
    const previewFile = join(blockDir, 'preview.png');
    if (existsSync(previewFile)) {
      previewImage = `.eldra/previews/${apiId}.png`;
      const target = join(themeDir, previewImage);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(previewFile, target);
    }

    blocks.push({
      ...block,
      category: typeof block.category === 'string' ? block.category : 'general',
      mock: mock ?? {},
      previewImage,
    });
    blockFiles.set(apiId, relativeBlockFile);
  }

  // Slot allowlist membership is checked against the full same-manifest apiId
  // set once every block has been read (§14 binding rule 1).
  const knownApiIds = new Set(blocks.map((block) => block.apiId));
  for (const block of blocks) {
    const slots = Array.isArray(block.slots) ? (block.slots as Array<Record<string, unknown>>) : [];
    for (const slot of slots) {
      if (!Array.isArray(slot.allowedBlockApiIds)) continue;
      for (const id of slot.allowedBlockApiIds) {
        if (typeof id !== 'string' || !knownApiIds.has(id)) {
          const file = typeof block.apiId === 'string' ? (blockFiles.get(block.apiId) ?? '') : '';
          errors.push(`${file}: slots — unknown allowlisted block "${String(id)}"`);
        }
      }
    }
  }

  const templates = validateTemplateSeeds(opts.templates ?? [], blocks, errors);
  // Cross-checked against the seeds just validated: a role a seed's layout
  // places — generated or declared — and the theme did not declare the block
  // data for is an error naming that seed.
  const templateRoles = validateTemplateRoles(opts.templateRoles, blocks, templates, errors);

  const manifest: ThemeManifest = {
    manifestVersion: 1,
    theme: {
      name: sanitizeThemeName(typeof packageJson?.name === 'string' ? packageJson.name : ''),
      version: typeof packageJson?.version === 'string' ? packageJson.version : '0.0.0',
      framework: opts.framework ?? 'vite',
      sdk: {
        core: resolvePackageVersion(themeDir, '@eldrajs/theme-core'),
        vitePlugin: resolvePackageVersion(themeDir, '@eldrajs/vite-plugin-theme'),
      },
    },
    blocks,
    routes: opts.routes ?? DEFAULT_ROUTES,
    customPages: validateCustomPages(opts.customPages ?? [], errors),
    // Seeds are validated against the blocks just scanned — every referenced
    // apiId must be one the theme ships, and the data must be a write Core
    // accepts. Omitted from the manifest entirely when the theme declares
    // none, so a theme that seeds nothing keeps emitting the file shape it
    // always has.
    ...(templates.length === 0 ? {} : { templates }),
    // Same reasoning as `templates`: absent rather than empty when the theme
    // declares no roles, so a theme that seeds no header/footer keeps
    // emitting the manifest shape an older Core already accepts.
    ...(templateRoles === undefined ? {} : { templateRoles }),
    tokens: readTokens(themeDir, errors),
  };
  // Resolved independently of the manifest object above: it must never be
  // serialized into `.eldra/manifest.json` (Core's ingest rejects an
  // unrecognized top-level key), so it travels through `ScanResult` instead —
  // see plugin.ts's separate `virtual:eldra/breakpoints` module.
  const breakpoints = resolveLayoutBreakpoints(opts.breakpoints);

  if (!/^[a-z][a-z0-9-]{1,48}$/.test(manifest.theme.name)) {
    errors.push('package.json: name — cannot be sanitized to a valid theme name');
  }
  if (!SEMVER_PATTERN.test(manifest.theme.version)) {
    errors.push(`package.json: version — must be semver (got "${manifest.theme.version}")`);
  }
  validateRoutes(manifest.routes, errors);
  if (
    new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`).byteLength >
    MAX_MANIFEST_BYTES
  ) {
    errors.push('.eldra/manifest.json: exceeds 2 MB');
  }

  return errors.length === 0
    ? { manifest, blockDirs, errors, breakpoints }
    : { manifest: null, blockDirs, errors, breakpoints };
}

function validateCustomPages(
  pages: NonNullable<ScanOptions['customPages']>,
  errors: string[]
): ThemeManifest['customPages'] {
  if (pages.length > MAX_CUSTOM_PAGES) {
    errors.push(`customPages: contains ${pages.length} pages — exceeds ${MAX_CUSTOM_PAGES}`);
  }
  const normalized: ThemeManifest['customPages'] = [];
  const seen = new Set<string>();
  for (const [index, page] of pages.slice(0, MAX_CUSTOM_PAGES).entries()) {
    if (!validCustomPagePath(page.path)) {
      errors.push(`customPages[${index}].path — invalid static path`);
    } else if (seen.has(page.path)) {
      errors.push(`customPages[${index}].path — duplicate path ${JSON.stringify(page.path)}`);
    }
    seen.add(page.path);
    const title = stripPlainTextControls(page.title).trim();
    if (codePointLength(title) < 1 || codePointLength(title) > MAX_CUSTOM_PAGE_TITLE_LENGTH) {
      errors.push(
        `customPages[${index}].title — must contain 1..${MAX_CUSTOM_PAGE_TITLE_LENGTH} characters`
      );
    }
    const description =
      page.description === undefined ? undefined : stripPlainTextControls(page.description).trim();
    if (
      description !== undefined &&
      codePointLength(description) > MAX_CUSTOM_PAGE_DESCRIPTION_LENGTH
    ) {
      errors.push(
        `customPages[${index}].description — exceeds ${MAX_CUSTOM_PAGE_DESCRIPTION_LENGTH} characters`
      );
    }
    normalized.push({
      path: page.path,
      title,
      ...(description === undefined ? {} : { description }),
    });
  }
  return normalized;
}

function validCustomPagePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value !== '' &&
    new TextEncoder().encode(value).byteLength <= MAX_CUSTOM_PAGE_PATH_BYTES &&
    value.startsWith('/') &&
    !value.includes('//') &&
    !/[:?#*\\]/.test(value) &&
    (value === '/' || !value.endsWith('/'))
  );
}

function directoryNames(blocksDir: string, errors: string[]): string[] {
  if (!existsSync(blocksDir)) {
    errors.push('blocks: directory is required');
    return [];
  }
  return readdirSync(blocksDir)
    .filter((name) => statSync(join(blocksDir, name)).isDirectory())
    .sort((a, b) => a.localeCompare(b));
}

function readJsonObject(
  path: string,
  themeDir: string,
  errors: string[]
): Record<string, unknown> | null {
  const file = toRelative(themeDir, path);
  if (!existsSync(path)) {
    errors.push(`${file}: file is required`);
    return null;
  }
  try {
    const source = readFileSync(path, 'utf8');
    const duplicate = duplicateJsonKey(source);
    if (duplicate !== null) {
      errors.push(`${file}: invalid JSON — duplicate object key ${JSON.stringify(duplicate)}`);
      return null;
    }
    const parsed: unknown = JSON.parse(source);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors.push(`${file}: root — must be an object`);
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    errors.push(
      `${file}: invalid JSON — ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

function duplicateJsonKey(source: string): string | null {
  let offset = 0;
  let duplicate: string | null = null;
  const whitespace = () => {
    while (/\s/.test(source[offset] ?? '')) offset += 1;
  };
  const string = (): string => {
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      if (source[offset] === '\\') {
        offset += 2;
        continue;
      }
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset)) as string;
      }
      offset += 1;
    }
    throw new Error('unterminated string');
  };
  const value = (): void => {
    whitespace();
    if (source[offset] === '{') {
      objectValue();
      return;
    }
    if (source[offset] === '[') {
      offset += 1;
      whitespace();
      if (source[offset] === ']') {
        offset += 1;
        return;
      }
      for (;;) {
        value();
        whitespace();
        if (source[offset] === ']') {
          offset += 1;
          return;
        }
        if (source[offset] !== ',') throw new Error('invalid array');
        offset += 1;
      }
    }
    if (source[offset] === '"') {
      string();
      return;
    }
    const match = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(
      source.slice(offset)
    );
    if (!match) throw new Error('invalid value');
    offset += match[0].length;
  };
  const objectValue = (): void => {
    offset += 1;
    whitespace();
    const keys = new Set<string>();
    if (source[offset] === '}') {
      offset += 1;
      return;
    }
    for (;;) {
      whitespace();
      if (source[offset] !== '"') throw new Error('invalid object key');
      const key = string();
      if (keys.has(key) && duplicate === null) duplicate = key;
      keys.add(key);
      whitespace();
      if (source[offset] !== ':') throw new Error('missing colon');
      offset += 1;
      value();
      whitespace();
      if (source[offset] === '}') {
        offset += 1;
        return;
      }
      if (source[offset] !== ',') throw new Error('invalid object');
      offset += 1;
    }
  };
  try {
    value();
  } catch {
    return null;
  }
  return duplicate;
}

function formatAjvError(file: string, error: ErrorObject): string {
  const params = error.params as {
    missingProperty?: string;
    pattern?: string;
    additionalProperty?: string;
  };
  const where =
    error.instancePath === ''
      ? (params.missingProperty ?? '(root)')
      : error.instancePath
          .slice(1)
          .replaceAll('/', '.')
          .replace(/\.(\d+)/g, '[$1]');
  if (error.keyword === 'pattern') {
    const data = typeof error.data === 'string' ? ` (got ${JSON.stringify(error.data)})` : '';
    return `${file}: ${where} — must match ${params.pattern ?? ''}${data}`;
  }
  if (error.keyword === 'additionalProperties') {
    const property = params.additionalProperty ?? '';
    // Schema ids are not portable across organizations, so a theme may never
    // name one; catalog products and collections are (`allowProducts` /
    // `allowCollections` are part of the relation schema).
    if (property === 'allowedSchemaIds') {
      return `${file}: ${where}.${property} — themes may use only relation.allowedTagIds, relation.allowProducts and relation.allowCollections`;
    }
    return `${file}: ${where} — unknown property "${property}"`;
  }
  return `${file}: ${where} — ${error.message ?? 'invalid'}`;
}

function semanticChecks(file: string, block: Record<string, unknown>, errors: string[]): void {
  const fields = Array.isArray(block.fields)
    ? (block.fields as Array<Record<string, unknown>>)
    : [];
  const seen = new Set<string>();
  let titleCount = 0;
  const groups = Array.isArray(block.groups)
    ? (block.groups as Array<Record<string, unknown>>)
    : [];
  const groupIds = new Set<string>();
  groups.forEach((group, index) => {
    const groupId = String(group.groupId ?? '');
    if (groupIds.has(groupId))
      errors.push(`${file}: groups[${index}] — duplicate groupId "${groupId}"`);
    groupIds.add(groupId);
  });
  fields.forEach((field, index) => {
    const id = String(field.fieldId ?? '');
    if (seen.has(id)) errors.push(`${file}: fields[${index}] — duplicate fieldId "${id}"`);
    seen.add(id);
    if (field.isTitle === true) titleCount += 1;
    if (field.relation !== undefined && field.type !== 'reference') {
      errors.push(
        `${file}: fields[${index}].relation — only allowed on type "reference" (got "${String(field.type)}")`
      );
    }
    // A relation with no target would let Studio offer nothing to pick and
    // leave Core with no rule to validate against on publish — a relation
    // carrying only `multiple` included. Core's manifest ingest refuses the
    // same shape with the same wording.
    if (isRecord(field.relation) && !namesARelationTarget(field.relation)) {
      errors.push(
        `${file}: fields[${index}] — relation requires one of allowedTagIds, allowProducts or allowCollections`
      );
    }
    if (field.groupId !== undefined && !groupIds.has(String(field.groupId))) {
      errors.push(
        `${file}: fields[${index}].groupId — references undeclared group "${String(field.groupId)}"`
      );
    }
    const depth = compositeDepth(field);
    if (depth > MAX_COMPOSITE_DEPTH) {
      errors.push(
        `${file}: fields[${index}].metadata — composite nesting depth ${depth} exceeds ${MAX_COMPOSITE_DEPTH}`
      );
    }
    const metadata =
      field.metadata !== null && typeof field.metadata === 'object'
        ? (field.metadata as Record<string, unknown>)
        : {};
    if ('framing' in metadata || 'framingAspectRatio' in metadata) {
      if (field.type !== 'media') {
        const key = 'framing' in metadata ? 'framing' : 'framingAspectRatio';
        errors.push(`${file}: fields[${index}].metadata.${key} — only allowed on type "media"`);
      } else {
        if ('framing' in metadata && typeof metadata.framing !== 'boolean') {
          errors.push(`${file}: fields[${index}].metadata.framing — must be a boolean`);
        }
        if ('framingAspectRatio' in metadata) {
          const ratio = metadata.framingAspectRatio;
          if (typeof ratio !== 'string' || !/^[1-9][0-9]*\/[1-9][0-9]*$/.test(ratio)) {
            errors.push(
              `${file}: fields[${index}].metadata.framingAspectRatio — must be "W/H" with positive integers (got "${String(ratio)}")`
            );
          } else if (metadata.framing !== true) {
            errors.push(
              `${file}: fields[${index}].metadata.framingAspectRatio — requires metadata.framing: true`
            );
          }
        }
      }
    }
    if ('toolbar' in metadata) {
      if (field.type !== 'rich-text') {
        errors.push(
          `${file}: fields[${index}].metadata.toolbar — only allowed on type "rich-text"`
        );
      } else {
        const toolbar = metadata.toolbar;
        if (!Array.isArray(toolbar) || toolbar.some((control) => typeof control !== 'string')) {
          errors.push(
            `${file}: fields[${index}].metadata.toolbar — must be an array of control ids`
          );
        } else {
          const controlSeen = new Set<string>();
          for (const control of toolbar as string[]) {
            if (!RICH_TEXT_TOOLBAR_CONTROL_SET.has(control)) {
              errors.push(
                `${file}: fields[${index}].metadata.toolbar — unknown control "${control}"`
              );
            } else if (controlSeen.has(control)) {
              errors.push(
                `${file}: fields[${index}].metadata.toolbar — duplicate control "${control}"`
              );
            } else {
              controlSeen.add(control);
            }
          }
        }
      }
    }
  });
  if (titleCount > 1)
    errors.push(`${file}: fields — at most one field may set isTitle (found ${titleCount})`);

  const slots = Array.isArray(block.slots) ? (block.slots as Array<Record<string, unknown>>) : [];
  const slotIds = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    const slotId = typeof slot.id === 'string' ? slot.id : '';
    if (!SLOT_ID_PATTERN.test(slotId)) {
      errors.push(
        `${file}: slots[${index}] — invalid slot id "${String(slot.id)}" (expected ^[a-z][a-z0-9-]{0,47}$)`
      );
    } else if (slotIds.has(slotId)) {
      errors.push(`${file}: slots[${index}] — duplicate slot id "${slotId}"`);
    } else {
      slotIds.add(slotId);
    }
    // strip control characters from label/description (mirror Core)
    if (typeof slot.label === 'string') slot.label = slot.label.replace(SLOT_CONTROL_CHARS, '');
    if (typeof slot.description === 'string')
      slot.description = slot.description.replace(SLOT_CONTROL_CHARS, '');
    if (Array.isArray(slot.allowedBlockApiIds) && slot.allowedBlockApiIds.includes(block.apiId)) {
      errors.push(
        `${file}: slots[${index}] — allowedBlockApiIds may not contain the host block "${String(block.apiId)}"`
      );
    }
  }
}

function compositeDepth(field: Record<string, unknown>, depth = 1): number {
  const metadata = field.metadata;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return depth;
  const children: Array<Record<string, unknown>> = [];
  const meta = metadata as Record<string, unknown>;
  if (Array.isArray(meta.fields)) {
    children.push(...meta.fields.filter(isRecord));
  }
  if (isRecord(meta.item)) children.push(meta.item);
  return children.reduce((max, child) => Math.max(max, compositeDepth(child, depth + 1)), depth);
}

function readTokens(themeDir: string, errors: string[]): ThemeManifest['tokens'] {
  const path = join(themeDir, 'tokens.json');
  if (!existsSync(path)) return { colors: {}, containers: {} };
  const parsed = readJsonObject(path, themeDir, errors);
  if (parsed === null) return { colors: {}, containers: {} };
  try {
    const normalized = normalizeThemeDesignTokens(parsed);
    if (
      !Object.prototype.hasOwnProperty.call(parsed, 'containers') &&
      !Object.prototype.hasOwnProperty.call(parsed, 'allowCustomColors')
    ) {
      return {
        colors: Object.fromEntries(
          Object.keys(normalized.colors)
            .sort()
            .map((id) => [id, normalized.colors[id]!.value])
        ),
        fonts: sortedStringRecord(parsed.fonts),
        spacing: sortedStringRecord(parsed.spacing),
      };
    }
    return normalized;
  } catch (error) {
    if (error instanceof DesignTokenValidationError) {
      errors.push(`tokens.json: ${error.path || '(root)'} — ${error.code}`);
    } else {
      errors.push(
        `tokens.json: invalid design tokens — ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return { colors: {}, containers: {} };
  }
}

function sortedStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key] as string])
  );
}

function validateRoutes(routes: ManifestRoute[], errors: string[]): void {
  routes.forEach((route, index) => {
    const value = route as Partial<ManifestRoute> & { kind?: unknown };
    if (typeof value.pattern !== 'string' || value.pattern.length === 0) {
      errors.push(`routes[${index}].pattern — must be a non-empty string`);
    }
    if (value.kind !== 'page' && value.kind !== 'entry') {
      errors.push(`routes[${index}].kind — must be "page" or "entry"`);
      return;
    }
    if (value.kind === 'entry') {
      if (typeof value.schemaApiId !== 'string' || value.schemaApiId.length === 0) {
        errors.push(`routes[${index}].schemaApiId — required for entry routes`);
      }
      if (typeof value.field !== 'string' || value.field.length === 0) {
        errors.push(`routes[${index}].field — required for entry routes`);
      }
    } else if (value.schemaApiId !== undefined || value.field !== undefined) {
      errors.push(`routes[${index}] — page routes must not set schemaApiId or field`);
    }
  });
}

function resolvePackageVersion(themeDir: string, packageName: string): string {
  try {
    const require = createRequire(join(themeDir, 'package.json'));
    let directory = dirname(require.resolve(packageName));
    for (;;) {
      const packagePath = join(directory, 'package.json');
      if (existsSync(packagePath)) {
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown };
        return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
      }
      const parent = dirname(directory);
      if (parent === directory) return '0.0.0';
      directory = parent;
    }
  } catch {
    return '0.0.0';
  }
}

function sanitizeThemeName(name: string): string {
  return (name.split('/').pop() ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 49);
}

/** Whether a `relation` names something an editor can actually pick: at least
 *  one semantic tag, catalog products, or catalog collections. Only values the
 *  closed AJV schema already accepted reach here, so a non-empty
 *  `allowedTagIds` array and boolean flags are the only shapes to weigh. */
function namesARelationTarget(relation: Record<string, unknown>): boolean {
  const tags = relation.allowedTagIds;
  return (
    (Array.isArray(tags) && tags.length > 0) ||
    relation.allowProducts === true ||
    relation.allowCollections === true
  );
}

function toRelative(themeDir: string, path: string): string {
  return relative(themeDir, path).split('\\').join('/');
}

export type {
  DeclaredTemplateSeed,
  ManifestRoute,
  ManifestTemplateSeed,
  ScanOptions,
  ScanResult,
  ThemeManifest,
} from './types';

function previousBlocks(
  manifest: ScanOptions['previousManifest'],
  errors: string[]
): Map<string, BlockDefinition> {
  const result = new Map<string, BlockDefinition>();
  if (manifest === undefined) return result;
  if (!isRecord(manifest) || manifest.manifestVersion !== 1 || !Array.isArray(manifest.blocks)) {
    errors.push('previous manifest: expected manifestVersion 1 and a blocks array');
    return result;
  }
  for (const [index, value] of manifest.blocks.entries()) {
    const at = `previous manifest: blocks[${index}]`;
    if (!isRecord(value)) {
      errors.push(`${at} — invalid block`);
      continue;
    }
    const { mock: _mock, previewImage: _preview, ...block } = value;
    if (!validateBlockJson(block)) {
      errors.push(`${at} — invalid block definition`);
      continue;
    }
    const definition = block as unknown as BlockDefinition;
    if (!definition.fields.every((field) => validMigrationFieldShape(field))) {
      errors.push(`${at} — invalid recursive field storage shape`);
      continue;
    }
    if (result.has(definition.apiId)) errors.push(`${at} — duplicate block apiId`);
    semanticChecks(at, block, errors);
    migrationChecks(at, definition, undefined, errors);
    result.set(definition.apiId, definition);
  }
  return result;
}

// The plugin reads before overwriting; standalone scans opt in explicitly.
// Reuse the same duplicate-key-aware parser as block.json.
export function readPreviousManifest(
  themeDir: string,
  errors: string[]
): ThemeManifest | undefined {
  const path = join(themeDir, '.eldra', 'manifest.json');
  if (!existsSync(path)) return undefined;
  if (statSync(path).size > MAX_MANIFEST_BYTES) {
    errors.push('previous manifest: .eldra/manifest.json exceeds 2 MB');
    return undefined;
  }
  const parsed = readJsonObject(path, themeDir, errors);
  return parsed === null ? undefined : (parsed as unknown as ThemeManifest);
}
