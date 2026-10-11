import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldCopyTemplatePath } from '../templateExclude.mjs';

export function initTheme(targetDir: string): void {
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new Error(`init: target directory ${targetDir} is not empty`);
  }
  const source = templateSource();
  cpSync(source, targetDir, {
    recursive: true,
    filter: shouldCopyTemplatePath,
  });
  rewriteWorkspaceVersions(join(targetDir, 'package.json'));
}

function rewriteWorkspaceVersions(packagePath: string): void {
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const group of [packageJson.dependencies, packageJson.devDependencies]) {
    if (group === undefined) continue;
    for (const [name, version] of Object.entries(group)) {
      if (name.startsWith('@eldrajs/') && version.startsWith('workspace:')) group[name] = '^0.1.0';
    }
  }
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function templateSource(): string {
  const candidates = [
    new URL('../template', import.meta.url),
    new URL('../../template', import.meta.url),
    new URL('../../../examples/starter-nuxt', import.meta.url),
    new URL('../../../../examples/starter-nuxt', import.meta.url),
  ].map((url) => fileURLToPath(url));
  const source = candidates.find((candidate) => existsSync(join(candidate, 'package.json')));
  if (source === undefined)
    throw new Error('starter template not found (package built without template/)');
  return source;
}
