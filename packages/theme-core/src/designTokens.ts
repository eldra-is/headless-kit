export type DesignTokenId = string;
export type ColorLiteral = string;

export type ResponsiveTokenValue<T> = { normal: T; tablet?: T; mobile?: T };

export interface ThemeColorToken {
  label: string;
  value: ColorLiteral;
  group?: string;
  allowSiteOverride?: boolean;
}

export interface ContainerPreset {
  label: string;
  maxWidth: CssTokenLength | 'none';
  gutter: ResponsiveTokenValue<CssTokenLength>;
  allowSiteOverride?: boolean;
}

export interface ThemeDesignTokens {
  colors: Record<DesignTokenId, ThemeColorToken>;
  containers: Record<DesignTokenId, ContainerPreset>;
  allowCustomColors?: boolean;
}

export interface ContainerOverride {
  maxWidth: CssTokenLength | 'none';
  gutter: ResponsiveTokenValue<CssTokenLength>;
}

export interface SiteDesignTokenOverrides {
  colors: Record<DesignTokenId, ColorLiteral>;
  containers: Record<DesignTokenId, ContainerOverride>;
}

export interface DesignTokenCatalog {
  revision: number;
  theme: ThemeDesignTokens;
  overrides: SiteDesignTokenOverrides;
  resolved: ThemeDesignTokens;
}

export type ColorSelection =
  | { kind: 'token'; token: DesignTokenId }
  | { kind: 'custom'; value: ColorLiteral };

export type CssTokenLength = `${number}px` | `${number}rem` | `${number}%`;
export type DesignTokenValidationCode =
  | 'INVALID_TYPE'
  | 'UNKNOWN_KEY'
  | 'REQUIRED'
  | 'INVALID_VALUE'
  | 'LIMIT_EXCEEDED'
  | 'TOKEN_NOT_FOUND'
  | 'OVERRIDE_FORBIDDEN';

export class DesignTokenValidationError extends Error {
  constructor(
    readonly path: string,
    readonly code: DesignTokenValidationCode
  ) {
    super(`invalid design tokens at ${JSON.stringify(path)}: ${code}`);
    this.name = 'DesignTokenValidationError';
  }
}

const TOKEN_ID = /^[a-z][a-z0-9-]{0,48}$/;
const LENGTH = /^(0|[1-9][0-9]*)(\.[0-9]{1,4})?(px|rem|%)$/;
const HEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/;
const OKLCH =
  /^oklch\(([0-9]+(?:\.\d{1,4})?) ([0-9]+(?:\.\d{1,4})?) ([0-9]+(?:\.\d{1,4})?)(?: \/ ([0-9]+(?:\.\d{1,4})?))?\)$/;
const REQUIRED_CONTAINERS = ['narrow', 'content', 'wide', 'full'] as const;
const BREAKPOINTS = ['normal', 'tablet', 'mobile'] as const;
const MAX_COLORS = 100;
const MAX_CONTAINERS = 16;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type JsonObject = Record<string, unknown>;

export function normalizeThemeDesignTokens(value: unknown): ThemeDesignTokens {
  const root = object(value, '');
  rejectKeys(root, ['colors', 'containers', 'allowCustomColors', 'fonts', 'spacing'], '');
  const legacy = !own(root, 'containers') && !own(root, 'allowCustomColors');
  if (legacy) return normalizeLegacyTokens(root);
  rejectKeys(root, ['colors', 'containers', 'allowCustomColors'], '');
  if (!own(root, 'colors')) fail('/colors', 'REQUIRED');
  if (!own(root, 'containers')) fail('/containers', 'REQUIRED');
  const colors = normalizeColorTokens(root.colors, '/colors');
  const containers = normalizeContainerPresets(root.containers, '/containers');
  const emptyCatalog =
    Object.keys(colors).length === 0 &&
    Object.keys(containers).length === 0 &&
    root.allowCustomColors !== true;
  for (const id of REQUIRED_CONTAINERS) {
    if (!emptyCatalog && !own(containers, id)) fail(`/containers/${id}`, 'REQUIRED');
  }
  if (!emptyCatalog && containers.full!.maxWidth !== 'none')
    fail('/containers/full/maxWidth', 'INVALID_VALUE');
  const result: ThemeDesignTokens = { colors, containers };
  if (own(root, 'allowCustomColors')) {
    if (typeof root.allowCustomColors !== 'boolean') fail('/allowCustomColors', 'INVALID_TYPE');
    if (root.allowCustomColors) result.allowCustomColors = true;
  }
  return result;
}

export function normalizeSiteDesignTokenOverrides(
  value: unknown,
  theme: ThemeDesignTokens
): SiteDesignTokenOverrides {
  const root = object(value, '');
  rejectKeys(root, ['colors', 'containers'], '');
  if (!own(root, 'colors')) fail('/colors', 'REQUIRED');
  if (!own(root, 'containers')) fail('/containers', 'REQUIRED');
  const rawColors = record(root.colors, '/colors', MAX_COLORS);
  const rawContainers = record(root.containers, '/containers', MAX_CONTAINERS);
  const colors: Record<string, ColorLiteral> = Object.create(null) as Record<string, ColorLiteral>;
  const containers: Record<string, ContainerOverride> = Object.create(null) as Record<
    string,
    ContainerOverride
  >;
  for (const id of sortedKeys(rawColors)) {
    tokenId(id, `/colors/${pointer(id)}`);
    const definition = theme.colors[id];
    if (!definition) fail(`/colors/${id}`, 'TOKEN_NOT_FOUND');
    if (definition.allowSiteOverride !== true) fail(`/colors/${id}`, 'OVERRIDE_FORBIDDEN');
    colors[id] = normalizeColorLiteral(rawColors[id], `/colors/${id}`);
  }
  for (const id of sortedKeys(rawContainers)) {
    tokenId(id, `/containers/${pointer(id)}`);
    const definition = theme.containers[id];
    if (!definition) fail(`/containers/${id}`, 'TOKEN_NOT_FOUND');
    if (definition.allowSiteOverride !== true) fail(`/containers/${id}`, 'OVERRIDE_FORBIDDEN');
    containers[id] = normalizeContainerValue(rawContainers[id], `/containers/${id}`, false);
    if (id === 'full' && containers[id]!.maxWidth !== 'none') {
      fail('/containers/full/maxWidth', 'INVALID_VALUE');
    }
  }
  return { colors: plain(colors), containers: plain(containers) };
}

export function resolveDesignTokenCatalog(value: unknown): DesignTokenCatalog {
  const root = object(value, '');
  rejectKeys(root, ['revision', 'theme', 'overrides', 'resolved'], '');
  for (const key of ['revision', 'theme', 'overrides', 'resolved']) {
    if (!own(root, key)) fail(`/${key}`, 'REQUIRED');
  }
  if (
    typeof root.revision !== 'number' ||
    !Number.isSafeInteger(root.revision) ||
    root.revision < 1
  ) {
    fail('/revision', 'INVALID_VALUE');
  }
  const theme = normalizeThemeDesignTokens(root.theme);
  const overrides = normalizeSiteDesignTokenOverrides(root.overrides, theme);
  const resolved = applyNormalizedOverrides(theme, overrides);
  const supplied = normalizeThemeDesignTokens(root.resolved);
  if (canonicalJson(supplied) !== canonicalJson(resolved)) fail('/resolved', 'INVALID_VALUE');
  return { revision: root.revision, theme, overrides, resolved };
}

export function applyDesignTokenOverrides(
  themeValue: unknown,
  overridesValue: unknown
): ThemeDesignTokens {
  const theme = normalizeThemeDesignTokens(themeValue);
  const overrides = normalizeSiteDesignTokenOverrides(overridesValue, theme);
  return applyNormalizedOverrides(theme, overrides);
}

function applyNormalizedOverrides(
  theme: ThemeDesignTokens,
  overrides: SiteDesignTokenOverrides
): ThemeDesignTokens {
  const colors = mapSorted(theme.colors, (id, token) => ({
    ...token,
    value: overrides.colors[id] ?? token.value,
  }));
  const containers = mapSorted(theme.containers, (id, preset) => ({
    ...preset,
    ...overrides.containers[id],
  }));
  return {
    colors,
    containers,
    ...(theme.allowCustomColors === true ? { allowCustomColors: true } : {}),
  };
}

export function normalizeColorSelection(
  value: unknown,
  tokens: ThemeDesignTokens,
  opts: { allowCustomColors?: boolean } = {}
): ColorSelection {
  if (typeof value === 'string') {
    if (!opts.allowCustomColors || tokens.allowCustomColors !== true)
      fail('', 'OVERRIDE_FORBIDDEN');
    return { kind: 'custom', value: normalizeColorLiteral(value, '/value') };
  }
  const root = object(value, '');
  if (root.kind === 'token') {
    rejectKeys(root, ['kind', 'token'], '');
    if (typeof root.token !== 'string') fail('/token', 'INVALID_TYPE');
    tokenId(root.token, '/token');
    if (!tokens.colors[root.token]) fail('/token', 'TOKEN_NOT_FOUND');
    return { kind: 'token', token: root.token };
  }
  if (root.kind === 'custom') {
    rejectKeys(root, ['kind', 'value'], '');
    if (!opts.allowCustomColors || tokens.allowCustomColors !== true)
      fail('', 'OVERRIDE_FORBIDDEN');
    return { kind: 'custom', value: normalizeColorLiteral(root.value, '/value') };
  }
  fail('/kind', 'INVALID_VALUE');
}

export function resolveColorSelection(selection: unknown, tokens: ThemeDesignTokens): string {
  const normalized = normalizeColorSelection(selection, tokens, { allowCustomColors: true });
  return normalized.kind === 'token' ? `var(--eldra-color-${normalized.token})` : normalized.value;
}

export function generateDesignTokenCss(
  value: ThemeDesignTokens | DesignTokenCatalog,
  opts: { scope?: string } = {}
): string {
  const tokens = 'resolved' in value ? value.resolved : value;
  const scope = opts.scope ?? ':root';
  if (scope !== ':root' && !/^\[data-eldra-theme="[a-z][a-z0-9-]{0,48}"\]$/.test(scope)) {
    fail('/scope', 'INVALID_VALUE');
  }
  const declarations: string[] = [];
  for (const id of sortedKeys(tokens.colors))
    declarations.push(`--eldra-color-${id}:${tokens.colors[id]!.value};`);
  for (const id of sortedKeys(tokens.containers)) {
    const preset = tokens.containers[id]!;
    declarations.push(
      `--eldra-container-${id}-max-width:${preset.maxWidth === 'none' ? 'none' : preset.maxWidth};`
    );
    for (const breakpoint of BREAKPOINTS) {
      declarations.push(
        `--eldra-container-${id}-gutter-${breakpoint}:${responsiveValue(preset.gutter, breakpoint)};`
      );
    }
  }
  return declarations.length === 0 ? '' : `${scope}{${declarations.join('')}}`;
}

export function generateTailwindThemeCss(value: ThemeDesignTokens | DesignTokenCatalog): string {
  const tokens = 'resolved' in value ? value.resolved : value;
  const declarations = sortedKeys(tokens.colors)
    .map((id) => `--color-${id}:var(--eldra-color-${id});`)
    .join('');
  return declarations === '' ? '' : `@theme static{${declarations}}`;
}

export function designTokenRevisionHash(value: ThemeDesignTokens | DesignTokenCatalog): string {
  const tokens = 'resolved' in value ? value.resolved : value;
  return sha256Hex(new TextEncoder().encode(canonicalJson(tokens)));
}

export function responsiveValue<T>(
  value: ResponsiveTokenValue<T>,
  breakpoint: 'normal' | 'tablet' | 'mobile'
): T {
  if (breakpoint === 'mobile') return value.mobile ?? value.tablet ?? value.normal;
  if (breakpoint === 'tablet') return value.tablet ?? value.normal;
  return value.normal;
}

function normalizeLegacyTokens(root: JsonObject): ThemeDesignTokens {
  const raw = own(root, 'colors') ? record(root.colors, '/colors', MAX_COLORS) : {};
  const colors: Record<string, ThemeColorToken> = Object.create(null) as Record<
    string,
    ThemeColorToken
  >;
  for (const id of sortedKeys(raw)) {
    tokenId(id, `/colors/${pointer(id)}`);
    colors[id] = { label: titleFromId(id), value: normalizeColorLiteral(raw[id], `/colors/${id}`) };
  }
  if (own(root, 'fonts')) stringRecord(root.fonts, '/fonts');
  if (own(root, 'spacing')) stringRecord(root.spacing, '/spacing');
  return { colors: plain(colors), containers: {} };
}

function normalizeColorTokens(value: unknown, path: string): Record<string, ThemeColorToken> {
  const raw = record(value, path, MAX_COLORS);
  const result: Record<string, ThemeColorToken> = Object.create(null) as Record<
    string,
    ThemeColorToken
  >;
  for (const id of sortedKeys(raw)) {
    tokenId(id, `${path}/${pointer(id)}`);
    const token = object(raw[id], `${path}/${id}`);
    rejectKeys(token, ['label', 'value', 'group', 'allowSiteOverride'], `${path}/${id}`);
    if (!own(token, 'label')) fail(`${path}/${id}/label`, 'REQUIRED');
    if (!own(token, 'value')) fail(`${path}/${id}/value`, 'REQUIRED');
    const normalized: ThemeColorToken = {
      label: plainText(token.label, 80, `${path}/${id}/label`),
      value: normalizeColorLiteral(token.value, `${path}/${id}/value`),
    };
    if (own(token, 'group')) normalized.group = plainText(token.group, 40, `${path}/${id}/group`);
    if (own(token, 'allowSiteOverride')) {
      if (typeof token.allowSiteOverride !== 'boolean')
        fail(`${path}/${id}/allowSiteOverride`, 'INVALID_TYPE');
      if (token.allowSiteOverride) normalized.allowSiteOverride = true;
    }
    result[id] = normalized;
  }
  return plain(result);
}

function normalizeContainerPresets(value: unknown, path: string): Record<string, ContainerPreset> {
  const raw = record(value, path, MAX_CONTAINERS);
  const result: Record<string, ContainerPreset> = Object.create(null) as Record<
    string,
    ContainerPreset
  >;
  for (const id of sortedKeys(raw)) {
    tokenId(id, `${path}/${pointer(id)}`);
    result[id] = normalizeContainerValue(raw[id], `${path}/${id}`, true) as ContainerPreset;
  }
  return plain(result);
}

function normalizeContainerValue(
  value: unknown,
  path: string,
  descriptor: boolean
): ContainerPreset | ContainerOverride {
  const root = object(value, path);
  rejectKeys(
    root,
    descriptor ? ['label', 'maxWidth', 'gutter', 'allowSiteOverride'] : ['maxWidth', 'gutter'],
    path
  );
  if (descriptor && !own(root, 'label')) fail(`${path}/label`, 'REQUIRED');
  if (!own(root, 'maxWidth')) fail(`${path}/maxWidth`, 'REQUIRED');
  if (!own(root, 'gutter')) fail(`${path}/gutter`, 'REQUIRED');
  const common = {
    maxWidth:
      root.maxWidth === 'none'
        ? ('none' as const)
        : normalizeLength(root.maxWidth, `${path}/maxWidth`),
    gutter: normalizeResponsiveLength(root.gutter, `${path}/gutter`),
  };
  if (!descriptor) return common;
  const result: ContainerPreset = { label: plainText(root.label, 80, `${path}/label`), ...common };
  if (own(root, 'allowSiteOverride')) {
    if (typeof root.allowSiteOverride !== 'boolean')
      fail(`${path}/allowSiteOverride`, 'INVALID_TYPE');
    if (root.allowSiteOverride) result.allowSiteOverride = true;
  }
  return result;
}

function normalizeResponsiveLength(
  value: unknown,
  path: string
): ResponsiveTokenValue<CssTokenLength> {
  const root = object(value, path);
  rejectKeys(root, [...BREAKPOINTS], path);
  if (!own(root, 'normal')) fail(`${path}/normal`, 'REQUIRED');
  const result: ResponsiveTokenValue<CssTokenLength> = {
    normal: normalizeLength(root.normal, `${path}/normal`),
  };
  if (own(root, 'tablet')) result.tablet = normalizeLength(root.tablet, `${path}/tablet`);
  if (own(root, 'mobile')) result.mobile = normalizeLength(root.mobile, `${path}/mobile`);
  return result;
}

function normalizeColorLiteral(value: unknown, path: string): ColorLiteral {
  if (typeof value !== 'string') fail(path, 'INVALID_TYPE');
  if (HEX.test(value)) return value;
  const match = OKLCH.exec(value);
  if (!match) fail(path, 'INVALID_VALUE');
  const numbers = match
    .slice(1)
    .filter((part): part is string => part !== undefined)
    .map(Number);
  if (numbers.some((part) => !Number.isFinite(part))) fail(path, 'INVALID_VALUE');
  const [lightness, chroma, hue, alpha] = numbers;
  if (
    lightness! < 0 ||
    lightness! > 1 ||
    chroma! < 0 ||
    chroma! > 0.5 ||
    hue! < 0 ||
    hue! >= 360 ||
    (alpha !== undefined && (alpha < 0 || alpha > 1))
  ) {
    fail(path, 'INVALID_VALUE');
  }
  const parts = `${canonicalNumber(lightness!)} ${canonicalNumber(chroma!)} ${canonicalNumber(hue!)}`;
  return `oklch(${parts}${alpha === undefined ? '' : ` / ${canonicalNumber(alpha)}`})`;
}

function normalizeLength(value: unknown, path: string): CssTokenLength {
  if (typeof value !== 'string') fail(path, 'INVALID_TYPE');
  const match = LENGTH.exec(value);
  if (!match) fail(path, 'INVALID_VALUE');
  const magnitude = Number(`${match[1]}${match[2] ?? ''}`);
  const unit = match[3]!;
  const maximum = unit === 'px' ? 4096 : unit === 'rem' ? 256 : 100;
  if (!Number.isFinite(magnitude) || magnitude > maximum) fail(path, 'INVALID_VALUE');
  return `${canonicalNumber(magnitude)}${unit}` as CssTokenLength;
}

function plainText(value: unknown, max: number, path: string): string {
  if (typeof value !== 'string') fail(path, 'INVALID_TYPE');
  const length = [...value].length;
  const hasControl = [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 31 || codePoint === 127;
  });
  if (length < 1 || length > max || hasControl) fail(path, 'INVALID_VALUE');
  return value;
}

function stringRecord(value: unknown, path: string): void {
  const root = record(value, path, 100);
  for (const key of Object.keys(root))
    if (typeof root[key] !== 'string') fail(`${path}/${pointer(key)}`, 'INVALID_TYPE');
}

function tokenId(value: string, path: string): void {
  if (!TOKEN_ID.test(value) || FORBIDDEN_KEYS.has(value)) fail(path, 'INVALID_VALUE');
}

function object(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    fail(path, 'INVALID_TYPE');
  return value as JsonObject;
}

function record(value: unknown, path: string, max: number): JsonObject {
  const result = object(value, path);
  const keys = Object.keys(result);
  if (keys.length > max) fail(path, 'LIMIT_EXCEEDED');
  for (const key of keys)
    if (FORBIDDEN_KEYS.has(key)) fail(`${path}/${pointer(key)}`, 'INVALID_VALUE');
  return result;
}

function rejectKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value)
    .filter((key) => !allowedSet.has(key))
    .sort()[0];
  if (unknown !== undefined) fail(`${path}/${pointer(unknown)}`, 'UNKNOWN_KEY');
}

function mapSorted<T, R>(
  source: Record<string, T>,
  map: (id: string, value: T) => R
): Record<string, R> {
  return Object.fromEntries(sortedKeys(source).map((id) => [id, map(id, source[id]!)]));
}

function plain<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(sortedKeys(value).map((key) => [key, value[key]!]));
}

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort((a, b) => a.localeCompare(b));
}
function own(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function pointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
function canonicalNumber(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}
function titleFromId(id: string): string {
  return id
    .split('-')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : ''))
    .join(' ');
}
function fail(path: string, code: DesignTokenValidationCode): never {
  throw new DesignTokenValidationError(path, code);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${sortedKeys(value)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as JsonObject)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// Pure synchronous SHA-256 keeps hashes identical in browsers, SSR, and builds.
function sha256Hex(bytes: Uint8Array): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  const words = new Uint32Array(64);
  const rotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15]!,
        y = words[index - 2]!;
      words[index] =
        (words[index - 16]! +
          (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) +
          words[index - 7]! +
          (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>>
        0;
    }
    let [a, b, c, d, e, f, g, h] = hash as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let index = 0; index < 64; index += 1) {
      const t1 =
        (h +
          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
          ((e & f) ^ (~e & g)) +
          constants[index]! +
          words[index]!) >>>
        0;
      const t2 =
        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }
  return hash.map((value) => value.toString(16).padStart(8, '0')).join('');
}
