import type { EntryDoc } from './clientTypes';
import {
  generateLayoutCss,
  layoutNodeClass,
  LayoutValidationError,
  normalizeLayoutDocument,
  type LayoutBreakpoints,
  type LayoutContainerNode,
  type LayoutNode,
  type LayoutStyle,
} from './layout';

export interface TemplateBlockFieldDefinition {
  fieldId: string;
  default?: unknown;
}

export interface TemplateBlockDefinition {
  apiId: string;
  fields: readonly TemplateBlockFieldDefinition[];
  // Historical top-level field renames (from -> to), already flattened across
  // every `migrations[].renames` step and chain-resolved (a->b then b->c
  // yields { a: 'c', b: 'c' }). Built by `buildTemplateBlockRenames` from a
  // block's raw `migrations` array so a template-block node written against a
  // field's old name still resolves — Core rewrites the stored bindings
  // separately, but an un-migrated route template must keep rendering too.
  renames?: Readonly<Record<string, string>>;
}

/**
 * Flattens a block's `migrations` array (each step's `renames: [{ from, to
 * }]`) into one `from -> to` map, applied in ascending `version` order with
 * chains resolved: a step renaming `a -> b` followed by one renaming `b -> c`
 * yields `{ a: 'c', b: 'c' }`, so every historical name for a field resolves
 * straight to its current one. `migrations` is untrusted input (a manifest
 * read at runtime) — any entry that is not a well-formed `{ version: number,
 * renames: Array<{ from: string, to: string }> }` step is ignored rather than
 * thrown on, and malformed rename pairs within an otherwise valid step are
 * skipped the same way.
 */
export function buildTemplateBlockRenames(migrations: unknown): Readonly<Record<string, string>> {
  const renames: Record<string, string> = {};
  if (!Array.isArray(migrations)) return renames;
  const steps = migrations
    .filter(
      (step): step is { version: number; renames: unknown[] } =>
        isRecord(step) && typeof step.version === 'number' && Array.isArray(step.renames)
    )
    .sort((a, b) => a.version - b.version);
  for (const step of steps) {
    for (const entry of step.renames) {
      if (!isRecord(entry)) continue;
      const { from, to } = entry as { from?: unknown; to?: unknown };
      if (typeof from !== 'string' || typeof to !== 'string' || from === '' || to === '') continue;
      for (const key of Object.keys(renames)) {
        if (renames[key] === from) renames[key] = to;
      }
      renames[from] = to;
    }
  }
  return renames;
}

export type TemplateBlockNode = {
  id: string;
  type: 'template-block';
  apiId: string;
  entryId?: string;
  bindings?: Record<string, string>;
  templates?: Record<string, string>;
};

export type TemplateLayoutNode =
  | TemplateBlockNode
  | {
      id: string;
      type: 'flex';
      children: TemplateLayoutNode[];
      style?: LayoutStyle;
      layout: Extract<LayoutNode, { type: 'flex' }>['layout'];
    }
  | {
      id: string;
      type: 'grid';
      children: TemplateLayoutNode[];
      style?: LayoutStyle;
      layout: Extract<LayoutNode, { type: 'grid' }>['layout'];
    };

export type TemplateLayoutDocument = {
  version: 1;
  root: Extract<TemplateLayoutNode, { type: 'flex' | 'grid' }>;
};

export type TemplateLayoutRenderNode =
  | { id: string; type: 'template-block'; apiId: string; entry: EntryDoc; className: string }
  | (Omit<Extract<TemplateLayoutNode, { type: 'flex' }>, 'children'> & {
      className: string;
      children: TemplateLayoutRenderNode[];
    })
  | (Omit<Extract<TemplateLayoutNode, { type: 'grid' }>, 'children'> & {
      className: string;
      children: TemplateLayoutRenderNode[];
    });

export interface TemplateLayoutRenderModel {
  document: TemplateLayoutDocument;
  root: Extract<TemplateLayoutRenderNode, { type: 'flex' | 'grid' }>;
  css: string;
}

export interface TemplateLayoutContext {
  entry: EntryDoc;
  blockEntries?: readonly EntryDoc[];
  blockCatalog: Readonly<Record<string, TemplateBlockDefinition>>;
  allowedContainerIds?: ReadonlySet<string>;
  breakpoints?: LayoutBreakpoints;
}

const API_ID = /^[a-z][a-z0-9-]{1,48}$/;
const FIELD_ID = /^[a-z][a-zA-Z0-9]{0,48}$/;
// A canonical non-negative list index: `0`, or digits with no leading zero.
// `-1`, `01` and `1a` are field names that happen to look numeric, not indices.
const LIST_INDEX = /^(?:0|[1-9][0-9]*)$/;
const TARGET_FIELD_PATH = /^[a-z][a-zA-Z0-9]{0,48}(?:\.(?:[a-z][a-zA-Z0-9]{0,48}|0|[1-9][0-9]*))*$/;
const MAX_BINDINGS = 100;
const MAX_TEMPLATE_BYTES = 2048;
const MAX_TEMPLATE_TOKENS = 32;
const TEMPLATE_TOKEN = /\{\{\s*([a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*)\s*\}\}/g;

type TemplatePlacement = {
  apiId: string;
  entryId?: string;
  bindings: Record<string, string>;
  templates: Record<string, string>;
  entry: EntryDoc;
};

export function createTemplateLayoutRenderModel(
  value: unknown,
  context: TemplateLayoutContext
): TemplateLayoutRenderModel {
  if (!isRecord(value) || value.version !== 1) fail('/version', 'INVALID_VALUE');
  const placements = new Map<string, TemplatePlacement>();
  let sequence = 0;
  const transformed = transformNode(value.root, '/root', context, placements, () => {
    sequence += 1;
    return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  });
  if (transformed.type === 'block') fail('/root/type', 'INVALID_VALUE');
  const normalized = normalizeLayoutDocument(
    { version: 1, root: transformed },
    new Set(collectEntryIds(transformed)),
    context.allowedContainerIds
  );
  const document = restoreTemplateDocument(normalized.document.root, placements);
  return {
    document: { version: 1, root: document },
    root: renderTemplateNode(document, placements) as Extract<
      TemplateLayoutRenderNode,
      { type: 'flex' | 'grid' }
    >,
    css: generateLayoutCss(normalized.document, undefined, undefined, context.breakpoints),
  };
}

function transformNode(
  value: unknown,
  path: string,
  context: TemplateLayoutContext,
  placements: Map<string, TemplatePlacement>,
  nextEntryId: () => string
): LayoutNode {
  if (!isRecord(value)) fail(path, 'INVALID_TYPE');
  if (value.type === 'template-block') {
    exactKeys(value, ['id', 'type', 'apiId', 'entryId', 'bindings', 'templates'], path);
    if (typeof value.id !== 'string') fail(`${path}/id`, 'INVALID_TYPE');
    if (typeof value.apiId !== 'string' || !API_ID.test(value.apiId))
      fail(`${path}/apiId`, 'INVALID_VALUE');
    const definition = context.blockCatalog[value.apiId];
    if (definition === undefined) fail(`${path}/apiId`, 'BLOCK_NOT_FOUND');
    const declared = new Set(definition.fields.map((field) => field.fieldId));
    const renames = definition.renames ?? {};
    const bindings = normalizeBindings(
      resolveRenamedKeys(value.bindings, path, 'bindings', declared, renames),
      path,
      definition,
      context.entry
    );
    const templates = normalizeTemplates(
      resolveRenamedKeys(value.templates, path, 'templates', declared, renames),
      path,
      definition,
      context.entry,
      bindings
    );
    const entryId = value.entryId;
    if (entryId !== undefined && typeof entryId !== 'string')
      fail(`${path}/entryId`, 'INVALID_TYPE');
    const baseEntry =
      entryId === undefined
        ? undefined
        : context.blockEntries?.find((candidate) => candidate.id === entryId);
    if (entryId !== undefined && baseEntry === undefined)
      fail(`${path}/entryId`, 'BLOCK_NOT_FOUND');
    const schemaApiId = baseEntry?.schemaApiId;
    if (typeof schemaApiId === 'string' && schemaApiId !== value.apiId) {
      fail(`${path}/entryId`, 'BLOCK_NOT_FOUND');
    }
    const data = baseEntry === undefined ? {} : cloneContentRecord(baseEntry.data);
    for (const field of definition.fields) {
      if (baseEntry === undefined && Object.hasOwn(field, 'default')) {
        data[field.fieldId] = cloneContent(field.default);
      }
    }
    for (const [targetPath, binding] of Object.entries(bindings)) {
      const resolved = readBindingPath(context.entry.data, binding);
      const issuePath = `${path}/bindings/${pointerToken(targetPath)}`;
      if (!resolved.found || !writeTargetPath(data, targetPath, resolved.value)) {
        fail(issuePath, 'INVALID_VALUE');
      }
    }
    for (const [targetPath, template] of Object.entries(templates)) {
      const issuePath = `${path}/templates/${pointerToken(targetPath)}`;
      const rendered = renderTextTemplate(template, context.entry, issuePath);
      if (!writeTargetPath(data, targetPath, rendered)) fail(issuePath, 'INVALID_VALUE');
    }
    placements.set(value.id, {
      apiId: value.apiId,
      ...(entryId === undefined ? {} : { entryId }),
      bindings,
      templates,
      entry:
        baseEntry === undefined
          ? { ...context.entry, schemaApiId: value.apiId, data }
          : { ...baseEntry, schemaApiId: value.apiId, data },
    });
    return { id: value.id, type: 'block', entryId: nextEntryId() };
  }
  if (value.type === 'block' || value.type === 'reusable') fail(`${path}/type`, 'INVALID_VALUE');
  if (value.type !== 'flex' && value.type !== 'grid') {
    return value as unknown as LayoutNode;
  }
  if (!Array.isArray(value.children)) return value as unknown as LayoutNode;
  return {
    ...value,
    children: value.children.map((child, index) =>
      transformNode(child, `${path}/children/${index}`, context, placements, nextEntryId)
    ),
  } as LayoutContainerNode;
}

// Rewrites the keys of a raw `bindings`/`templates` object so a key written
// against a field's historical name resolves to its current one before
// validation — an un-migrated route template (Core rewrites the stored
// document separately, but not synchronously with a block's own redeploy)
// must keep rendering rather than fail closed on a since-renamed field.
// Works on a copy; never mutates the caller's document. Only the head (the
// segment before the first `.`) is ever renamed — a nested field itself is
// never a top-level migration target. A key that is already declared is left
// alone even if it also happens to be a rename source (a redeclared field
// wins). Two source keys resolving to the same target key is a collision:
// left for `normalizeBindings`/`normalizeTemplates` to reject, since both
// still enforce `validTargetPath` and dedupe against the sibling bindings.
function resolveRenamedKeys(
  value: unknown,
  path: string,
  container: 'bindings' | 'templates',
  declared: ReadonlySet<string>,
  renames: Readonly<Record<string, string>>
): unknown {
  if (!isRecord(value)) return value;
  const rewritten: Record<string, unknown> = {};
  const sourcesByTarget = new Map<string, string[]>();
  for (const key of Object.keys(value)) {
    const dot = key.indexOf('.');
    const head = dot === -1 ? key : key.slice(0, dot);
    const rest = dot === -1 ? '' : key.slice(dot);
    const renamed = !declared.has(head) && Object.hasOwn(renames, head) ? renames[head] : undefined;
    const newKey = renamed === undefined ? key : renamed + rest;
    rewritten[newKey] = value[key];
    const sources = sourcesByTarget.get(newKey);
    if (sources === undefined) sourcesByTarget.set(newKey, [key]);
    else sources.push(key);
  }
  for (const [newKey, sources] of sourcesByTarget) {
    if (sources.length > 1) fail(`${path}/${container}/${pointerToken(newKey)}`, 'INVALID_VALUE');
  }
  return rewritten;
}

function normalizeTemplates(
  value: unknown,
  path: string,
  definition: TemplateBlockDefinition,
  entry: EntryDoc,
  bindings: Readonly<Record<string, string>>
): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) fail(`${path}/templates`, 'INVALID_TYPE');
  const keys = Object.keys(value);
  if (keys.length > MAX_BINDINGS || keys.length + Object.keys(bindings).length > MAX_BINDINGS) {
    fail(`${path}/templates`, 'LIMIT_EXCEEDED');
  }
  const declared = new Set(definition.fields.map((field) => field.fieldId));
  const templates: Record<string, string> = {};
  for (const key of keys.sort()) {
    const template = value[key];
    const issuePath = `${path}/templates/${pointerToken(key)}`;
    if (!validTargetPath(key, declared) || Object.hasOwn(bindings, key))
      fail(issuePath, 'INVALID_VALUE');
    if (typeof template !== 'string') fail(issuePath, 'INVALID_TYPE');
    const paths = templatePaths(template);
    if (paths === null || paths.some((binding) => !readBindingPath(entry.data, binding).found)) {
      fail(issuePath, 'INVALID_VALUE');
    }
    templates[key] = template;
  }
  return templates;
}

function templatePaths(value: string): string[] | null {
  if (value === '' || new TextEncoder().encode(value).byteLength > MAX_TEMPLATE_BYTES) return null;
  const paths = [...value.matchAll(TEMPLATE_TOKEN)].map((match) => match[1]!);
  if (paths.length === 0 || paths.length > MAX_TEMPLATE_TOKENS) return null;
  const remainder = value.replace(TEMPLATE_TOKEN, '');
  return remainder.includes('{{') || remainder.includes('}}') ? null : paths;
}

function renderTextTemplate(value: string, entry: EntryDoc, path: string): string {
  return value.replace(TEMPLATE_TOKEN, (_token, binding: string) => {
    const resolved = readBindingPath(entry.data, binding);
    if (!resolved.found || typeof resolved.value !== 'string') fail(path, 'INVALID_VALUE');
    return resolved.value;
  });
}

function normalizeBindings(
  value: unknown,
  path: string,
  definition: TemplateBlockDefinition,
  entry: EntryDoc
): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) fail(`${path}/bindings`, 'INVALID_TYPE');
  const keys = Object.keys(value);
  if (keys.length > MAX_BINDINGS) {
    fail(`${path}/bindings`, 'LIMIT_EXCEEDED');
  }
  const declared = new Set(definition.fields.map((field) => field.fieldId));
  const bindings: Record<string, string> = {};
  for (const key of keys.sort()) {
    const binding = value[key];
    if (!validTargetPath(key, declared))
      fail(`${path}/bindings/${pointerToken(key)}`, 'INVALID_VALUE');
    if (typeof binding !== 'string' || !validBindingPath(binding)) {
      fail(
        `${path}/bindings/${pointerToken(key)}`,
        typeof binding === 'string' ? 'INVALID_VALUE' : 'INVALID_TYPE'
      );
    }
    if (!readBindingPath(entry.data, binding).found)
      fail(`${path}/bindings/${pointerToken(key)}`, 'INVALID_VALUE');
    bindings[key] = binding;
  }
  return bindings;
}

function restoreTemplateDocument(
  node: LayoutNode,
  placements: ReadonlyMap<string, TemplatePlacement>
): Extract<TemplateLayoutNode, { type: 'flex' | 'grid' }> {
  const restore = (current: LayoutNode): TemplateLayoutNode => {
    if (current.type === 'block') {
      const placement = placements.get(current.id);
      if (placement === undefined) fail('', 'INVALID_VALUE');
      return {
        id: current.id,
        type: 'template-block',
        apiId: placement.apiId,
        ...(placement.entryId === undefined ? {} : { entryId: placement.entryId }),
        ...(Object.keys(placement.bindings).length === 0 ? {} : { bindings: placement.bindings }),
        ...(Object.keys(placement.templates).length === 0
          ? {}
          : { templates: placement.templates }),
      };
    }
    return { ...current, children: current.children.map(restore) } as TemplateLayoutNode;
  };
  return restore(node) as Extract<TemplateLayoutNode, { type: 'flex' | 'grid' }>;
}

function renderTemplateNode(
  node: TemplateLayoutNode,
  placements: ReadonlyMap<string, TemplatePlacement>
): TemplateLayoutRenderNode {
  if (node.type === 'template-block') {
    const placement = placements.get(node.id);
    if (placement === undefined) fail('', 'INVALID_VALUE');
    return { ...node, entry: placement.entry, className: layoutNodeClass(node.id) };
  }
  return {
    ...node,
    className: layoutNodeClass(node.id),
    children: node.children.map((child) => renderTemplateNode(child, placements)),
  } as TemplateLayoutRenderNode;
}

function collectEntryIds(node: LayoutNode): string[] {
  if (node.type === 'block') return [node.entryId];
  return node.children.flatMap(collectEntryIds);
}

// Resolves a binding source path against the route entry's data. A segment is
// either a field name or a list index: `images.0.url` reads the first item of
// an `images` list, the same way the target side already writes into one. An
// index against a non-array, a field name against an array, and an index past
// the end of an array are all "not found" — indistinguishable from a missing
// key, so a binding written against data this entry does not have fails closed
// in exactly one way.
function readBindingPath(
  root: Record<string, unknown>,
  path: string
): { found: boolean; value?: unknown } {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (LIST_INDEX.test(segment)) {
      if (!Array.isArray(current)) return { found: false };
      const index = Number(segment);
      if (index >= current.length) return { found: false };
      current = current[index];
      continue;
    }
    if (!isRecord(current)) return { found: false };
    if (!Object.hasOwn(current, segment) && isRecord(current.data)) current = current.data;
    if (!isRecord(current) || !Object.hasOwn(current, segment)) return { found: false };
    current = current[segment];
  }
  return { found: true, value: current };
}

function validBindingPath(path: string): boolean {
  return (
    path !== '' &&
    new TextEncoder().encode(path).byteLength <= 255 &&
    path.split('.').every((segment) => FIELD_ID.test(segment) || LIST_INDEX.test(segment))
  );
}

function validTargetPath(path: string, declaredRoots: ReadonlySet<string>): boolean {
  return TARGET_FIELD_PATH.test(path) && declaredRoots.has(path.split('.')[0]!);
}

function writeTargetPath(root: Record<string, unknown>, path: string, value: unknown): boolean {
  const segments = path.split('.');
  let current: unknown = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    if (Array.isArray(current)) {
      const itemIndex = Number(segment);
      if (!Number.isSafeInteger(itemIndex) || itemIndex < 0 || itemIndex >= current.length)
        return false;
      current = current[itemIndex];
      continue;
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) return false;
    current = current[segment];
  }
  const finalSegment = segments.at(-1)!;
  if (Array.isArray(current)) {
    const itemIndex = Number(finalSegment);
    if (!Number.isSafeInteger(itemIndex) || itemIndex < 0 || itemIndex >= current.length)
      return false;
    current[itemIndex] = value;
    return true;
  }
  if (!isRecord(current) || !FIELD_ID.test(finalSegment)) return false;
  current[finalSegment] = value;
  return true;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${path}/${pointerToken(key)}`, 'UNKNOWN_KEY');
  }
}

// CMS content is JSON-shaped, but framework adapters can wrap its records and
// arrays in reactive proxies. Copy their values instead of structured-cloning
// the proxy (which throws), and keep nested overrides isolated from shared data.
function cloneContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneContent);
  return isRecord(value) ? cloneContentRecord(value) : value;
}

function cloneContentRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneContent(child)])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pointerToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function fail(
  path: string,
  code: 'INVALID_TYPE' | 'UNKNOWN_KEY' | 'INVALID_VALUE' | 'LIMIT_EXCEEDED' | 'BLOCK_NOT_FOUND'
): never {
  throw new LayoutValidationError({ path, code });
}
