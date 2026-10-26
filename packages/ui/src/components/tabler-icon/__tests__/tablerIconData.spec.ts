import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import * as tabler from '@tabler/icons-vue';
import { describe, expect, it } from 'vitest';
import type { VNode } from 'vue';
import { tablerBucketFile } from '../bucket';
import { tablerIconBody } from '../tablerIconData';
import { tablerIconName } from '../tablerIconName';

const dataDir = fileURLToPath(new NodeURL('../data/', import.meta.url));

type IconFunction = (props: object, context: object) => VNode;

const exports = Object.entries(tabler).filter(
  (entry): entry is [string, IconFunction] =>
    /^Icon[A-Z0-9]/.test(entry[0]) && typeof entry[1] === 'function'
);

function renderTabler(component: IconFunction): VNode {
  return component({}, { attrs: {}, slots: {} });
}

/** Each child's tag and attributes, as Tabler's own component renders them. */
function tablerNodes(component: IconFunction): Array<[string, Record<string, string>]> {
  return (renderTabler(component).children as VNode[]).map((child) => {
    const { key: _key, ...attributes } = child.props ?? {};
    return [
      child.type as string,
      Object.fromEntries(Object.entries(attributes).map(([name, value]) => [name, String(value)])),
    ];
  });
}

/** The same, read back through a real SVG parser from the markup TablerIcon injects. */
function parsedNodes(body: string): Array<[string, Record<string, string>]> {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.innerHTML = body;
  return [...svg.children].map((element) => [
    element.tagName,
    Object.fromEntries(
      [...element.attributes].map((attribute) => [attribute.name, attribute.value])
    ),
  ]);
}

describe('Tabler icon data', () => {
  it('holds every icon @tabler/icons-vue exports, aliases included', () => {
    expect(exports.length).toBeGreaterThan(6000);
  });

  it('draws every icon exactly as @tabler/icons-vue does', async () => {
    const bodies = await Promise.all(exports.map(([name]) => tablerIconBody(name)));
    const mismatched = exports
      .filter(([, component], index) => {
        const body = bodies[index];
        return (
          typeof body !== 'string' ||
          JSON.stringify(parsedNodes(body)) !== JSON.stringify(tablerNodes(component))
        );
      })
      .map(([name]) => name);
    expect(mismatched).toEqual([]);
  }, 30_000);

  it("resolves Tabler's kebab-case name of every icon to its export name", () => {
    const mismatched = Object.entries(tabler.icons).filter(([name, component]) => {
      const kebab = String(renderTabler(component as IconFunction).props?.class).replace(
        /^tabler-icon tabler-icon-/,
        ''
      );
      return tablerIconName(kebab) !== name;
    });
    expect(mismatched.map(([name]) => name)).toEqual([]);
  });

  it('keeps a name Studio offered that Tabler later dropped without an alias', async () => {
    expect('IconMoodConfuzedFilled' in tabler).toBe(false);
    expect(await tablerIconBody('IconMoodConfuzedFilled')).toBe(
      await tablerIconBody('IconMoodConfusedFilled')
    );
  });

  it('files every name in the bucket the runtime looks in', () => {
    const misfiled = readdirSync(dataDir).flatMap((file) =>
      Object.keys(JSON.parse(readFileSync(`${dataDir}${file}`, 'utf8')) as object)
        .filter((name) => `${tablerBucketFile(name)}.json` !== file)
        .map((name) => `${name} in ${file}`)
    );
    expect(misfiled).toEqual([]);
  });

  it('answers null for a name Tabler does not have', async () => {
    expect(await tablerIconBody('IconNoSuchIcon')).toBeNull();
    expect(await tablerIconBody('constructor')).toBeNull();
    expect(await tablerIconBody('__proto__')).toBeNull();
  });
});
