import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import {
  generateDesignTokenCss,
  generateTailwindThemeCss,
  normalizeThemeDesignTokens,
} from '@eldrajs/theme-core/design-tokens';
import { DEFAULT_LAYOUT_BREAKPOINTS } from '@eldrajs/theme-core/layout';
import { generateBlockTypes } from './blockTypes';
import { readPreviousManifest, scanTheme } from './scan';
import type { BlockDefinition, EldraThemeOptions, ScanResult, ThemeManifest } from './types';

const MANIFEST_ID = 'virtual:eldra/manifest';
const BLOCKS_ID = 'virtual:eldra/blocks';
const BLOCK_FIELDS_ID = 'virtual:eldra/block-fields';
const BREAKPOINTS_ID = 'virtual:eldra/breakpoints';
const TOKENS_ID = 'virtual:eldra/tokens.css';
const TAILWIND_ID = 'virtual:eldra/tailwind-theme.css';
const MESSAGES_ID = 'virtual:eldra/messages';
const RESOLVED_MANIFEST_ID = `\0${MANIFEST_ID}`;
const RESOLVED_BLOCKS_ID = `\0${BLOCKS_ID}`;
const RESOLVED_BLOCK_FIELDS_ID = `\0${BLOCK_FIELDS_ID}`;
const RESOLVED_BREAKPOINTS_ID = `\0${BREAKPOINTS_ID}`;
const RESOLVED_TOKENS_ID = `\0${TOKENS_ID}`;
const RESOLVED_TAILWIND_ID = `\0${TAILWIND_ID}`;
const RESOLVED_MESSAGES_ID = `\0${MESSAGES_ID}`;
/** `virtual:eldra/messages`'s shape when the theme ships no `i18n/`
 * directory — `manifest.messages` is absent, not an empty catalogue, so the
 * module needs its own fallback rather than reading one off the manifest. */
const EMPTY_MESSAGES = { defaultLocale: 'en-US', locales: {} };

export default function eldraTheme(options: EldraThemeOptions = {}): Plugin {
  let config: ResolvedConfig | null = null;
  let themeDir = '';
  let scan: ScanResult = {
    manifest: null,
    blockDirs: {},
    errors: [],
    breakpoints: DEFAULT_LAYOUT_BREAKPOINTS,
  };

  function rescanOrThrow(failHard: boolean): void {
    const historyErrors: string[] = [];
    const previousManifest = readPreviousManifest(themeDir, historyErrors);
    scan = scanTheme({
      previousManifest,
      themeDir,
      framework: options.framework ?? 'vite',
      routes: options.routes,
      customPages: options.customPages,
      templates: options.templates,
      templateRoles: options.templateRoles,
      breakpoints: options.breakpoints,
    });
    scan.errors.unshift(...historyErrors);
    if (scan.errors.length > 0 || scan.manifest === null) {
      scan.manifest = null;
      const message = `eldra theme validation failed:\n  ${scan.errors.join('\n  ')}`;
      if (failHard) throw new Error(message);
      config?.logger.error(message);
      return;
    }
    writeManifest(join(themeDir, '.eldra', 'manifest.json'), scan.manifest);
    writeBlockTypes(
      join(themeDir, '.eldra', 'block-types.d.ts'),
      scan.manifest.blocks,
      scan.manifest.messages
    );
  }

  return {
    name: 'eldra-theme',
    config() {
      return {
        define: {
          'import.meta.env.ELDRA_GATEWAY_URL': JSON.stringify(process.env.ELDRA_GATEWAY_URL ?? ''),
          'import.meta.env.ELDRA_ORG_ID': JSON.stringify(process.env.ELDRA_ORG_ID ?? ''),
        },
      };
    },
    configResolved(resolved) {
      config = resolved;
      themeDir = options.themeDir ?? resolved.root;
    },
    buildStart() {
      rescanOrThrow(config?.command === 'build');
      if (options.tailwind === true) assertTailwindV4(themeDir);
    },
    resolveId(id) {
      if (id === MANIFEST_ID) return RESOLVED_MANIFEST_ID;
      if (id === BLOCKS_ID) return RESOLVED_BLOCKS_ID;
      if (id === BLOCK_FIELDS_ID) return RESOLVED_BLOCK_FIELDS_ID;
      if (id === BREAKPOINTS_ID) return RESOLVED_BREAKPOINTS_ID;
      if (id === MESSAGES_ID) return RESOLVED_MESSAGES_ID;
      if (id === TOKENS_ID) return RESOLVED_TOKENS_ID;
      if (id === TAILWIND_ID) {
        if (options.tailwind !== true) {
          throw new Error(
            'eldra: virtual:eldra/tailwind-theme.css is disabled; set tailwind: true in eldraTheme()'
          );
        }
        return RESOLVED_TAILWIND_ID;
      }
      return null;
    },
    load(id) {
      if (id === RESOLVED_MANIFEST_ID) {
        return `export default ${JSON.stringify(scan.manifest)};`;
      }
      if (id === RESOLVED_BLOCKS_ID) {
        const entries = Object.entries(scan.blockDirs)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([apiId, directory]) => blockImportLine(apiId, join(directory, 'Block.vue')))
          .join(',\n');
        return `export default {\n${entries}\n};`;
      }
      if (id === RESOLVED_BLOCK_FIELDS_ID) {
        if (scan.manifest === null) throw new Error('eldra theme manifest is unavailable');
        return blockFieldsModuleSource(scan.manifest);
      }
      if (id === RESOLVED_BREAKPOINTS_ID) {
        // Deliberately not part of `virtual:eldra/manifest` — see
        // ScanResult['breakpoints']'s comment: it must never reach
        // `.eldra/manifest.json`, which Core's ingest validates strictly.
        return `export default ${JSON.stringify(scan.breakpoints)};`;
      }
      if (id === RESOLVED_MESSAGES_ID) {
        // The manifest's own `messages` block — absent means the theme ships no `i18n/`
        // directory, so this falls back to an empty English catalogue rather than throwing, a
        // theme with no texts still gets a working vue-i18n. `options.resolveMessages`, when set
        // (`@eldrajs/theme-nuxt`'s module, once its own platform read has settled), transforms it
        // — the build-time merge over the platform's theme-message overrides, resolved over the
        // organisation's locales; see `EldraThemeOptions['resolveMessages']`'s own doc comment.
        const manifestMessages = scan.manifest?.messages ?? EMPTY_MESSAGES;
        const messages = options.resolveMessages
          ? options.resolveMessages(manifestMessages)
          : manifestMessages;
        return `export default ${JSON.stringify(messages)};`;
      }
      if (id === RESOLVED_TOKENS_ID) {
        if (scan.manifest === null) throw new Error('eldra theme manifest is unavailable');
        // `options.resolveTokens`, when set (`@eldrajs/theme-nuxt`'s module, once its own platform
        // read has settled), answers the organisation's resolved design-token catalog — the
        // theme's own tokens with the site's overrides applied — in place of the theme's raw
        // `tokens.json`; see `EldraThemeOptions['resolveTokens']`'s own doc comment.
        const tokens = options.resolveTokens
          ? options.resolveTokens(scan.manifest.tokens)
          : normalizeThemeDesignTokens(scan.manifest.tokens);
        return generateDesignTokenCss(tokens);
      }
      if (id === RESOLVED_TAILWIND_ID) {
        if (scan.manifest === null) throw new Error('eldra theme manifest is unavailable');
        const tokens = normalizeThemeDesignTokens(scan.manifest.tokens);
        return `@import "tailwindcss";${generateDesignTokenCss(tokens)}${generateTailwindThemeCss(tokens)}`;
      }
      return null;
    },
    handleHotUpdate(context) {
      const file = relative(themeDir, context.file).split('\\').join('/');
      if (
        !/^blocks\/[^/]+\/(block\.json|mock\.json|preview\.png)$/.test(file) &&
        !/^i18n\/[^/]+\.json$/.test(file) &&
        file !== 'tokens.json' &&
        file !== 'package.json'
      )
        return;
      rescanOrThrow(false);
      for (const virtualId of [
        RESOLVED_MANIFEST_ID,
        RESOLVED_BLOCKS_ID,
        RESOLVED_BLOCK_FIELDS_ID,
        RESOLVED_BREAKPOINTS_ID,
        RESOLVED_TOKENS_ID,
        RESOLVED_TAILWIND_ID,
        RESOLVED_MESSAGES_ID,
      ]) {
        const module = context.server.moduleGraph.getModuleById(virtualId);
        if (module !== undefined) context.server.moduleGraph.invalidateModule(module);
      }
      context.server.ws.send({ type: 'full-reload' });
      return [];
    },
    generateBundle() {
      if (scan.manifest === null) throw new Error('eldra theme manifest is unavailable');
      this.emitFile({
        type: 'asset',
        fileName: '.eldra/manifest.json',
        source: serializeManifest(scan.manifest),
      });
      for (const block of scan.manifest.blocks) {
        if (block.previewImage === null) continue;
        const source = join(themeDir, block.previewImage);
        if (!existsSync(source)) continue;
        this.emitFile({
          type: 'asset',
          fileName: block.previewImage,
          source: readFileSync(source),
        });
      }
    },
  };
}

function assertTailwindV4(themeDir: string): void {
  let directory = themeDir;
  for (;;) {
    const packagePath = join(directory, 'node_modules', 'tailwindcss', 'package.json');
    if (existsSync(packagePath)) {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown };
      const version = typeof pkg.version === 'string' ? pkg.version : '';
      if (!version.startsWith('4.')) {
        throw new Error(
          `eldra: Tailwind adapter requires tailwindcss major 4 (found ${version || 'unknown'}); set tailwind: false to disable it`
        );
      }
      return;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(
    'eldra: Tailwind adapter is enabled but tailwindcss was not found; install tailwindcss@^4 or set tailwind: false'
  );
}

function writeManifest(path: string, manifest: ThemeManifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeManifest(manifest));
}

/**
 * Writes `.eldra/block-types.d.ts` from the manifest's blocks (which already
 * carry every `BlockDefinition` field plus `mock`/`previewImage` — the
 * generator only reads `apiId`/`fields`, so the extra keys are harmless).
 * Tracked like `manifest.json`, but only rewritten when content actually
 * changed, so an unrelated rescan does not touch its mtime.
 */
function writeBlockTypes(
  path: string,
  blocks: ThemeManifest['blocks'],
  messages: ThemeManifest['messages']
): void {
  const content = generateBlockTypes(blocks as unknown as BlockDefinition[], messages);
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function serializeManifest(manifest: ThemeManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

interface ProjectedBlockField {
  fieldId: string;
  type: string;
  /** Only emitted when true: `EldraRichText` reads it to default an omitted
   * `locale` prop to the preview's active content locale. */
  localized?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Builds `virtual:eldra/block-fields`: per block, only `fieldId`, `type`,
 * `localized` (omitted when false) and `metadata` (nested composite
 * `metadata.fields` passed through as-is) — the slice theme-core needs at
 * runtime without pulling in the rest of the manifest. `isBlockFieldLocalized`
 * uses `fieldId`/`localized` to resolve a field's locale default;
 * `isBlockFieldSelect` uses `type` plus `metadata.item`/`metadata.fields`
 * (carried verbatim here) to resolve a field's type through `list`/`composite`
 * nesting. `metadata` is also carried because a theme may read its own keys;
 * the SDK itself no longer reads `metadata.toolbar` (§18 v2 moved the toolbar
 * to Studio).
 */
function blockFieldsModuleSource(manifest: ThemeManifest): string {
  const entries = manifest.blocks
    .map((block) => {
      const apiId = String((block as { apiId?: unknown }).apiId ?? '');
      const fields = Array.isArray(block.fields)
        ? (block.fields as Array<Record<string, unknown>>)
        : [];
      const projected: ProjectedBlockField[] = fields.map((field) => {
        const entry: ProjectedBlockField = {
          fieldId: String(field.fieldId ?? ''),
          type: String(field.type ?? ''),
        };
        if (field.localized === true) entry.localized = true;
        if (field.metadata !== null && typeof field.metadata === 'object') {
          entry.metadata = field.metadata as Record<string, unknown>;
        }
        return entry;
      });
      return [apiId, projected] as const;
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([apiId, projected]) => `  ${JSON.stringify(apiId)}: ${JSON.stringify(projected)}`)
    .join(',\n');
  return `export default {\n${entries}\n};`;
}

/**
 * One line of the generated `virtual:eldra/blocks` module:
 * `  "<apiId>": () => import("<path>")`. Both `apiId` (a block's directory name,
 * which need not match `API_ID_PATTERN` when `block.json`'s own `apiId` is
 * missing — `scanTheme` then falls back to the raw directory name) and `path`
 * (that directory joined with `Block.vue`) are scanned from disk, so each is
 * `library input` as far as static analysis is concerned. Rather than escaping
 * them with two separate `JSON.stringify` calls spliced into one template —
 * two partially-sanitized pieces glued together by hand around a `() =>
 * import(...)` wrapper, which read as the code construction CodeQL's
 * "improperly sanitized value" check flags — this stringifies the whole
 * `[apiId, path]` pair in one call and only ever reuses the two JSON string
 * literals it produced, by slicing them back out; nothing is re-escaped or
 * re-interpolated from the raw values. `findJsonStringEnd` walks the escape
 * sequences `JSON.stringify` wrote so the slice lands on the real closing
 * quote, not one inside an escaped character.
 */
function blockImportLine(apiId: string, path: string): string {
  const tuple = JSON.stringify([apiId, path]); // e.g. '["hero","/abs/blocks/hero/Block.vue"]'
  const keyEnd = findJsonStringEnd(tuple, 1); // index of apiId's closing quote
  const key = tuple.slice(1, keyEnd + 1); // apiId's own JSON string literal, quotes included
  const value = tuple.slice(keyEnd + 2, -1); // path's own JSON string literal, quotes included
  return `  ${key}: () => import(${value})`;
}

/**
 * The index of the closing `"` of the JSON string literal that starts at
 * `text[start]` (itself a `"`), skipping over `\"`, `\\` and every other
 * backslash escape `JSON.stringify` may have written.
 */
function findJsonStringEnd(text: string, start: number): number {
  let i = start + 1;
  while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
  return i;
}
