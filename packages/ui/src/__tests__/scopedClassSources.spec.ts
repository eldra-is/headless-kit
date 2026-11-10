import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'vue/compiler-sfc';

/**
 * Below `provideEldraScope()` every class a component authors must render `eldra:`-prefixed, or
 * `scoped.css` (whose selectors all carry the prefix) styles nothing and the consumer's own
 * utility of that name styles it instead. The prefix is added by `src/utils/scopedClass.ts`, so
 * every source path a class takes to the DOM has to go through it. These are the three ways to
 * miss it; the pixel and class checks in `componentsCss.browser.spec.ts` catch what they cannot.
 */
const root = fileURLToPath(new NodeURL('../', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(path);
    return /\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.stories.ts') ? [path] : [];
  });
}

const files = [...sources(join(root, 'components')), ...sources(join(root, 'composables'))];
const relative = (path: string) => path.slice(root.length);

describe('component sources build their classes through scopedClass', () => {
  it('import cx and partClass from utils/scopedClass, never the public utils/cx', () => {
    const offenders = files.filter((file) =>
      /from '(?:\.\.?\/)+utils\/cx'/.test(readFileSync(file, 'utf8'))
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  /** Vue's own `computed` loses the scope when Vue re-runs it before a re-render. */
  it("import computed from utils/scopedComputed, never from 'vue'", () => {
    const offenders = files.filter((file) =>
      [...readFileSync(file, 'utf8').matchAll(/import \{([^}]*)\} from 'vue';/g)].some((m) =>
        m[1]!.split(',').some((name) => name.trim() === 'computed')
      )
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  it('write no static class in a template: :class="kit(\'…\')" instead', () => {
    const offenders: string[] = [];
    for (const file of files.filter((f) => f.endsWith('.vue'))) {
      const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
      const walk = (node: {
        type: number;
        tag?: string;
        props?: Array<{ type: number; name: string; loc: { start: { line: number } } }>;
        children?: unknown[];
        branches?: unknown[];
      }): void => {
        if (node.type === 1 && !['template', 'slot'].includes(node.tag!))
          for (const prop of node.props ?? [])
            if (prop.type === 6 && prop.name === 'class')
              offenders.push(`${relative(file)}:${prop.loc.start.line}`);
        for (const child of [...(node.children ?? []), ...(node.branches ?? [])])
          walk(child as Parameters<typeof walk>[0]);
      };
      if (descriptor.template?.ast) walk(descriptor.template.ast as Parameters<typeof walk>[0]);
    }
    expect(offenders).toEqual([]);
  });
});
