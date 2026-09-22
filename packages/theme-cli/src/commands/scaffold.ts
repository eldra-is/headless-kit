import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API_ID_RE = /^[a-z][a-z0-9-]{1,48}$/;

export interface ScaffoldBlockOptions {
  themeDir: string;
  apiId: string;
  name?: string;
  category?: string;
  fields?: Array<Record<string, unknown>>;
}

export function scaffoldBlock(opts: ScaffoldBlockOptions): { created: string[] } {
  if (!API_ID_RE.test(opts.apiId)) {
    throw new Error(`scaffoldBlock: apiId "${opts.apiId}" must match ${API_ID_RE.source}`);
  }

  const dir = join(opts.themeDir, 'blocks', opts.apiId);
  if (existsSync(dir)) throw new Error(`scaffoldBlock: blocks/${opts.apiId} already exists`);

  const name = opts.name ?? titleCase(opts.apiId);
  const fields = opts.fields ?? [
    {
      fieldId: 'title',
      name: 'Title',
      type: 'string',
      isTitle: true,
      localized: true,
      validators: { required: true },
    },
  ];
  if (fields.length === 0) throw new Error('scaffoldBlock: fields must contain at least one field');

  const firstFieldId = fields[0]?.fieldId;
  if (typeof firstFieldId !== 'string' || firstFieldId === '') {
    throw new Error('scaffoldBlock: first field must have a non-empty fieldId');
  }

  const block = {
    apiId: opts.apiId,
    name,
    category: opts.category ?? 'general',
    version: 1,
    fields,
  };
  const mock: Record<string, unknown> = {};
  for (const field of fields) {
    if ((field.type === 'string' || field.type === 'text') && typeof field.fieldId === 'string') {
      mock[field.fieldId] = `${name} ${field.fieldId}`;
    }
  }
  const component = [
    '<script setup lang="ts">',
    'defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();',
    '</script>',
    '',
    '<template>',
    `  <section class="${opts.apiId}">`,
    `    <h2>{{ entry.data.${firstFieldId} }}</h2>`,
    '  </section>',
    '</template>',
    '',
  ].join('\n');

  mkdirSync(dir, { recursive: true });
  const created = [join(dir, 'block.json'), join(dir, 'Block.vue'), join(dir, 'mock.json')];
  writeFileSync(created[0]!, `${JSON.stringify(block, null, 2)}\n`);
  writeFileSync(created[1]!, component);
  writeFileSync(created[2]!, `${JSON.stringify(mock, null, 2)}\n`);
  return { created };
}

function titleCase(apiId: string): string {
  return apiId
    .split('-')
    .map((word) => `${word[0]!.toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
