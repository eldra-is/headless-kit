import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shouldCopyTemplatePath } from '../src/templateExclude.mjs';

const source = fileURLToPath(new URL('../../../examples/starter-nuxt', import.meta.url));
const target = fileURLToPath(new URL('../template', import.meta.url));

rmSync(target, { recursive: true, force: true });
cpSync(source, target, {
  recursive: true,
  filter: shouldCopyTemplatePath,
});
