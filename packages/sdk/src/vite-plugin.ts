import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';
import { loadEnv, type Plugin, type ResolvedConfig } from 'vite';
import { DEFAULT_ELDRA_API_BASE_URL } from './client';
import type { RuntimeEnv, RuntimeValue } from './types';

const defaultOutDir = '.eldra/web-studio';
const defaultTypesFileName = 'cms-types.ts';
const defaultContractFileName = 'contract.ts';
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

export interface EldraVitePluginOptions {
  apiBaseUrl?: RuntimeValue<string>;
  orgId?: RuntimeValue<string>;
  env?: RuntimeValue<RuntimeEnv>;
  headers?: RuntimeValue<HeadersInit>;
  schemas?: string[];
  maxDepth?: number;
  moduleName?: string;
  outDir?: string;
  typesFileName?: string;
  /** Set to `false` to skip the gateway contract; CMS types are still generated. */
  contract?: boolean;
  contractFileName?: string;
  clientFileName?: string;
  indexFileName?: string;
  sdkImport?: string;
  fetch?: typeof fetch;
  skipOnMissingConfig?: boolean;
}

// Generates, on every dev start and build, the types a storefront works against: the
// organisation's CMS schemas and the gateway's own contract, both fetched from the configured
// gateway. A fetch that fails leaves the previously generated file in place.
export function eldra(options: EldraVitePluginOptions = {}): Plugin {
  let config: ResolvedConfig | undefined;
  let generated = false;

  return {
    name: 'eldra',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async buildStart() {
      if (generated) {
        return;
      }
      generated = true;
      await generateEldraFiles(config?.root ?? process.cwd(), options, config?.mode);
    },
  };
}

export async function generateEldraFiles(
  root: string,
  options: EldraVitePluginOptions,
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
      'Missing Eldra generation config. Set orgId or ELDRA_ORG_ID. Set apiBaseUrl only for staging, local, or test gateways.'
    );
  }

  const moduleName = options.moduleName ?? defaultModuleName;
  const sdkImport = options.sdkImport ?? defaultSdkImport;
  const outDir = resolve(root, options.outDir ?? defaultOutDir);
  const typesFileName = options.typesFileName ?? defaultTypesFileName;
  const contractFileName = options.contractFileName ?? defaultContractFileName;
  const clientFileName = options.clientFileName ?? defaultClientFileName;
  const indexFileName = options.indexFileName ?? defaultIndexFileName;
  const fetchOptions = {
    fetch: options.fetch,
    headers: resolveRuntimeValue(options.headers),
  };

  const typesSource = await orSkip(() =>
    fetchCmsTypes(apiBaseUrl, orgId, {
      ...fetchOptions,
      maxDepth: options.maxDepth,
      moduleName,
      schemas: options.schemas,
    })
  );
  const contractSource =
    options.contract === false
      ? undefined
      : await orSkip(() => fetchContract(apiBaseUrl, orgId, { ...fetchOptions, sdkImport }));

  if (!typesSource && !contractSource) {
    return;
  }

  await mkdir(outDir, { recursive: true });
  if (typesSource) {
    await writeGeneratedFile(resolve(outDir, typesFileName), typesSource);
    await writeGeneratedFile(
      resolve(outDir, clientFileName),
      createGeneratedClientSource({
        moduleName,
        sdkImport,
        typesImport: `./${stripTSExtension(typesFileName)}`,
      })
    );
  }
  if (contractSource) {
    await writeGeneratedFile(resolve(outDir, contractFileName), contractSource);
  }

  const hasClient = typesSource !== undefined || (await exists(resolve(outDir, clientFileName)));
  const hasContract =
    contractSource !== undefined || (await exists(resolve(outDir, contractFileName)));
  await writeGeneratedFile(
    resolve(outDir, indexFileName),
    [
      hasClient ? `export * from './${stripTSExtension(clientFileName)}';` : undefined,
      hasContract ? `export * from './${stripTSExtension(contractFileName)}';` : undefined,
    ]
      .filter(Boolean)
      .join('\n') + '\n'
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
  const url = new URL(`${trimSlash(apiBaseUrl)}/cms/v1/typescript-definitions`);
  url.searchParams.set('moduleName', options.moduleName);
  if (options.maxDepth !== undefined) {
    url.searchParams.set('maxDepth', String(options.maxDepth));
  }
  if (options.schemas && options.schemas.length > 0) {
    url.searchParams.set('schemas', options.schemas.join(','));
  }

  const body = await fetchText(url, orgId, { ...options, accept: 'text/plain' });
  return body.endsWith('\n') ? body : `${body}\n`;
}

async function fetchContract(
  apiBaseUrl: string,
  orgId: string,
  options: { fetch: typeof fetch | undefined; headers: HeadersInit | undefined; sdkImport: string }
): Promise<string> {
  const url = new URL(`${trimSlash(apiBaseUrl)}/public/openapi.json`);
  const body = await fetchText(url, orgId, { ...options, accept: 'application/json' });
  return createContractSource(JSON.parse(body), { sdkImport: options.sdkImport, source: url });
}

// The generated contract module: the OpenAPI document as TypeScript, plus the augmentation that
// makes every SDK method typed against it.
export async function createContractSource(
  document: unknown,
  options: { sdkImport?: string; source?: URL | string } = {}
): Promise<string> {
  const version = readVersion(document);
  const sdkImport = options.sdkImport ?? defaultSdkImport;
  const ast = await openapiTS(document as Parameters<typeof openapiTS>[0], {
    alphabetize: true,
    exportType: true,
  });
  const origin = options.source ? ` from ${options.source.toString()}` : '';
  return (
    `// Generated by ${sdkImport}${origin} (contract ${version}). Do not edit; it is rewritten on every\n` +
    `// dev start and build. Commit it so the types exist without a running gateway.\n` +
    `export const ELDRA_CONTRACT_VERSION = '${version}';\n\n` +
    astToString(ast) +
    `\ndeclare module '${sdkImport}' {\n  interface EldraContract {\n    paths: paths;\n  }\n}\n`
  );
}

function readVersion(document: unknown): string {
  const version = (document as { info?: { version?: unknown } } | null)?.info?.version;
  if (typeof version !== 'string' || !version) {
    throw new Error('The OpenAPI document has no info.version.');
  }
  return version;
}

async function fetchText(
  url: URL,
  orgId: string,
  options: { fetch: typeof fetch | undefined; headers: HeadersInit | undefined; accept: string }
): Promise<string> {
  const headers = new Headers(options.headers);
  headers.set('Accept', options.accept);
  headers.set('X-Org-Id', orgId);

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation is available for Eldra generation.');
  }

  const response = await fetchImpl(url, { headers });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}\n${body}`);
  }
  return body;
}

async function orSkip<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
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

function resolvePluginEnv(root: string, mode: string, options: EldraVitePluginOptions): RuntimeEnv {
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, '');
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
