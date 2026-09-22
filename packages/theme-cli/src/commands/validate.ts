import { scanTheme } from '@eldrajs/vite-plugin-theme/scan';
import type { DeclaredThemeCodePage } from '@eldrajs/vite-plugin-theme';
import { KNOWN_FIELD_TYPES } from '../knownFieldTypes';

const DEFAULT_CAPABLE_FIELD_TYPES: ReadonlySet<string> = new Set([
  'string',
  'text',
  'slug',
  'markdown',
  'rich-text',
  'lucide-icon',
  'tabler-icon',
  'int',
  'float',
  'bool',
  'color',
  'datetime',
]);

export interface ValidateOptions {
  themeDir: string;
  remote: boolean;
  gatewayUrl?: string;
  orgId?: string;
  fetch?: typeof globalThis.fetch;
  customPages?: DeclaredThemeCodePage[];
}

export interface ValidateResult {
  errors: string[];
  warnings: string[];
  blockCount: number;
}

export async function validateTheme(opts: ValidateOptions): Promise<ValidateResult> {
  const scan = scanTheme({ themeDir: opts.themeDir, customPages: opts.customPages });
  const errors = [...scan.errors];
  const warnings: string[] = [];
  if (scan.manifest === null) return { errors, warnings, blockCount: 0 };

  let validTypes: ReadonlySet<string> = new Set(KNOWN_FIELD_TYPES);
  if (opts.remote) {
    const remoteTypes = await fetchRemoteFieldTypes(opts);
    if (remoteTypes === null) {
      warnings.push(
        'remote field-type check unavailable (GET /cms/v1/field-types not reachable) — using bundled list'
      );
    } else {
      validTypes = remoteTypes;
    }
  }

  for (const block of scan.manifest.blocks) {
    validateFields(
      String(block.apiId),
      block.fields as Array<Record<string, unknown>>,
      validTypes,
      errors,
      'fields'
    );
  }
  return { errors, warnings, blockCount: scan.manifest.blocks.length };
}

async function fetchRemoteFieldTypes(opts: ValidateOptions): Promise<ReadonlySet<string> | null> {
  if (opts.gatewayUrl === undefined || opts.orgId === undefined) return null;
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  try {
    const response = await doFetch(`${opts.gatewayUrl.replace(/\/+$/, '')}/cms/v1/field-types`, {
      headers: { 'X-Org-Id': opts.orgId },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { fieldTypes?: Array<{ id?: string } | string> };
    const ids = (body.fieldTypes ?? [])
      .map((type) => (typeof type === 'string' ? type : type.id))
      .filter((id): id is string => typeof id === 'string' && id !== '');
    return ids.length === 0 ? null : new Set(ids);
  } catch {
    return null;
  }
}

function validateFields(
  apiId: string,
  fields: Array<Record<string, unknown>>,
  validTypes: ReadonlySet<string>,
  errors: string[],
  path: string
): void {
  fields.forEach((field, index) => {
    const fieldPath = `${path}[${index}]`;
    if (typeof field.type === 'string' && !validTypes.has(field.type)) {
      errors.push(
        `blocks/${apiId}/block.json: ${fieldPath}.type — unknown field type "${field.type}"`
      );
    }
    if (
      Object.hasOwn(field, 'default') &&
      typeof field.type === 'string' &&
      !DEFAULT_CAPABLE_FIELD_TYPES.has(field.type)
    ) {
      errors.push(
        `blocks/${apiId}/block.json: ${fieldPath}.default — type "${field.type}" does not support defaults`
      );
    }
    const metadata = field.metadata;
    if (typeof metadata !== 'object' || metadata === null) return;
    const nested = metadata as { fields?: unknown; item?: unknown };
    if (Array.isArray(nested.fields)) {
      validateFields(
        apiId,
        nested.fields as Array<Record<string, unknown>>,
        validTypes,
        errors,
        `${fieldPath}.metadata.fields`
      );
    }
    if (typeof nested.item === 'object' && nested.item !== null) {
      validateFields(
        apiId,
        [nested.item as Record<string, unknown>],
        validTypes,
        errors,
        `${fieldPath}.metadata.item`
      );
    }
  });
}
