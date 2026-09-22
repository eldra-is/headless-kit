import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../../examples/starter-nuxt', import.meta.url));
const target = fileURLToPath(new URL('../template', import.meta.url));

rmSync(target, { recursive: true, force: true });
cpSync(source, target, {
  recursive: true,
  filter(path) {
    const parts = path.split(/[\\/]/);
    if (
      parts.some(
        (part) =>
          part === 'node_modules' || part === '.git' || part === '.nuxt' || part === '.output'
      )
    )
      return false;
    return !parts.some((part, index) => part === '.eldra' && parts[index + 1] === 'previews');
  },
});
