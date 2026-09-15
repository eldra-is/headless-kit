import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadEnv, type Plugin, type ResolvedConfig } from 'vite';
import { DEFAULT_ELDRA_API_BASE_URL } from './client';
import type { RuntimeEnv, RuntimeValue } from './types';

const defaultOutDir = '.eldra/web-studio';
const defaultTypesFileName = 'cms-types.ts';
const defaultClientFileName = 'client.ts';
const defaultIndexFileName = 'index.ts';
const defaultModuleName = 'EldraCMS';
const defaultSdkImport = '@eldrajs/sdk';

const apiBaseUrlEnvKeys = [
  'ELDRA_API_BASE_URL',
  'VITE_ELDRA_API_BASE_URL',
  'NEXT_PUBLIC_ELDRA_API_BASE_URL',
  'NUXT_PUBLIC_ELDRA_API_BASE_URL',
  'PUBLIC_ELDRA_API_BASE_URL',
] as const;

const orgIdEnvKeys = [
  'ELDRA_ORG_ID',
  'VITE_ELDRA_ORG_ID',
  'NEXT_PUBLIC_ELDRA_ORG_ID',
  'NUXT_PUBLIC_ELDRA_ORG_ID',
  'PUBLIC_ELDRA_ORG_ID',
] as const;

export interface EldraCmsVitePluginOptions {
  apiBaseUrl?: RuntimeValue<string>;
  orgId?: RuntimeValue<string>;
  env?: RuntimeValue<RuntimeEnv>;
  headers?: RuntimeValue<HeadersInit>;
  schemas?: string[];
  maxDepth?: number;
  moduleName?: string;
  outDir?: string;
  typesFileName?: string;
  clientFileName?: string;
  indexFileName?: string;
  sdkImport?: string;
  fetch?: typeof fetch;
  skipOnMissingConfig?: boolean;
}

export function eldraCms(options: EldraCmsVitePluginOptions = {}): Plugin {
  let config: ResolvedConfig | undefined;
  let generated = false;

  return {
    name: 'eldra-cms',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async buildStart() {
      if (generated) {
        return;
      }
      generated = true;
      await generateEldraCmsFiles(config?.root ?? process.cwd(), options, config?.mode);
    },
  };
}

export async function generateEldraCmsFiles(
  root: string,
  options: EldraCmsVitePluginOptions,
  mode = process.env.NODE_ENV ?? 'development'
): Promise<void> {
  const env = resolvePluginEnv(root, mode, options);
  const apiBaseUrl =
    resolveRuntimeValue(options.apiBaseUrl) ??
    readFirstEnvValue(env, apiBaseUrlEnvKeys) ??
    DEFAULT_ELDRA_API_BASE_URL;
  const orgId = resolveRuntimeValue(options.orgId) ?? readFirstEnvValue(env, orgIdEnvKeys);

  if (!orgId) {
    if (options.skipOnMissingConfig) {
      return;
    }
    throw new Error(
      'Missing Eldra CMS generation config. Set orgId or ELDRA_ORG_ID. Set apiBaseUrl only for staging, local, or test gateways.'
    );
  }

  const moduleName = options.moduleName ?? defaultModuleName;
  const outDir = resolve(root, options.outDir ?? defaultOutDir);
  const typesFileName = options.typesFileName ?? defaultTypesFileName;
  const clientFileName = options.clientFileName ?? defaultClientFileName;
  const indexFileName = options.indexFileName ?? defaultIndexFileName;
  const typesSource = await fetchCmsTypesOrSkip(apiBaseUrl, orgId, {
    fetch: options.fetch,
    headers: resolveRuntimeValue(options.headers),
    maxDepth: options.maxDepth,
    moduleName,
    schemas: options.schemas,
  });

  if (!typesSource) {
    return;
  }

  await mkdir(outDir, { recursive: true });
  await writeGeneratedFile(resolve(outDir, typesFileName), typesSource);
  await writeGeneratedFile(
    resolve(outDir, clientFileName),
    createGeneratedClientSource({
      moduleName,
      sdkImport: options.sdkImport ?? defaultSdkImport,
      typesImport: `./${stripTSExtension(typesFileName)}`,
    })
  );
  await writeGeneratedFile(
    resolve(outDir, indexFileName),
    `export * from './${stripTSExtension(clientFileName)}';\n`
  );
}

async function fetchCmsTypes(
  apiBaseUrl: string,
  orgId: string,
  options: {
    fetch: typeof fetch | undefined;
    headers: HeadersInit | undefined;
    maxDepth: number | undefined;
    moduleName: string;
    schemas: string[] | undefined;
  }
): Promise<string> {
  const url = new URL(`${apiBaseUrl.replace(/\/$/, '')}/cms/v1/typescript-definitions`);
  url.searchParams.set('moduleName', options.moduleName);
  if (options.maxDepth !== undefined) {
    url.searchParams.set('maxDepth', String(options.maxDepth));
  }
  if (options.schemas && options.schemas.length > 0) {
    url.searchParams.set('schemas', options.schemas.join(','));
  }

  const headers = new Headers(options.headers);
  headers.set('Accept', 'text/plain');
  headers.set('X-Org-Id', orgId);

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation is available for Eldra CMS generation.');
  }

  const response = await fetchImpl(url, { headers });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Failed to generate Eldra CMS types: ${response.status} ${response.statusText}\n${body}`
    );
  }
  return body.endsWith('\n') ? body : `${body}\n`;
}

async function fetchCmsTypesOrSkip(
  apiBaseUrl: string,
  orgId: string,
  options: {
    fetch: typeof fetch | undefined;
    headers: HeadersInit | undefined;
    maxDepth: number | undefined;
    moduleName: string;
    schemas: string[] | undefined;
  }
): Promise<string | undefined> {
  try {
    return await fetchCmsTypes(apiBaseUrl, orgId, options);
  } catch {
    return undefined;
  }
}

function createGeneratedClientSource(options: {
  moduleName: string;
  sdkImport: string;
  typesImport: string;
}): string {
  const prefix = pascalTypeName(options.moduleName) || defaultModuleName;
  return `import {
  createEldraClient,
  getEldraClient,
  initEldraClient,
  type EldraClient,
  type EldraClientOptions,
} from '${options.sdkImport}';
import type { ${prefix}Client } from '${options.typesImport}';

export * from '${options.typesImport}';
export type WebStudioCmsClient = ${prefix}Client & Pick<EldraClient['cms'], 'resolveEntryList'>;
export type WebStudioClientOptions = EldraClientOptions;

export interface WebStudioClient extends Omit<EldraClient, 'cms'> {
  cms: WebStudioCmsClient;
}

export function createWebStudioClient(options: WebStudioClientOptions): WebStudioClient {
  return createEldraClient(options) as unknown as WebStudioClient;
}

export function initWebStudioClient(options: WebStudioClientOptions): WebStudioClient {
  return initEldraClient(options) as unknown as WebStudioClient;
}

export function getWebStudioClient(): WebStudioClient {
  return getEldraClient() as unknown as WebStudioClient;
}
`;
}

function resolvePluginEnv(
  root: string,
  mode: string,
  options: EldraCmsVitePluginOptions
): RuntimeEnv {
  return {
    ...loadEnv(mode, root, ''),
    ...process.env,
    ...resolveRuntimeValue(options.env),
  };
}

function readFirstEnvValue(env: RuntimeEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function resolveRuntimeValue<T>(value: RuntimeValue<T>): T | undefined {
  return typeof value === 'function' ? (value as () => T | undefined)() : value;
}

async function writeGeneratedFile(path: string, source: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source, 'utf8');
}

function stripTSExtension(path: string): string {
  return path.replace(/\.ts$/, '');
}

function pascalTypeName(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
