import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme; Node's own resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'vue/compiler-sfc';

interface TemplateNode {
  type: number;
  tag?: string;
  tagType?: number;
  props?: Array<{ type: number; name: string }>;
  children?: TemplateNode[];
}

const ELEMENT = 1;
const ATTRIBUTE = 6;
const COMPONENT = 1;
const WRAPPERS = new Set(['template', 'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport']);

const src = fileURLToPath(new NodeURL('../', import.meta.url));

function sfcs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sfcs(path);
    return entry.name.endsWith('.vue') ? [path] : [];
  });
}

const files = [...sfcs(join(src, 'components')), ...sfcs(join(src, 'vee-validate'))];
const packageComponents = new Set(files.map((file) => basename(file, '.vue')));

const elements = (nodes: TemplateNode[] = []) => nodes.filter((node) => node.type === ELEMENT);

/** What a template puts in the DOM at its top level, seen through wrappers that render no element. */
function roots(nodes: TemplateNode[] = []): TemplateNode[] {
  return elements(nodes).flatMap((node) =>
    WRAPPERS.has(node.tag ?? '') ? roots(node.children) : [node]
  );
}

function teleports(node: TemplateNode): TemplateNode[] {
  return elements(node.children).flatMap((child) => [
    ...(child.tag === 'Teleport' ? [child] : []),
    ...teleports(child),
  ]);
}

/** Another of this package's components brings the marker on its own root, checked in its own file. */
const marked = (node: TemplateNode) =>
  (node.tagType === COMPONENT && packageComponents.has(node.tag ?? '')) ||
  (node.props ?? []).some((prop) => prop.type === ATTRIBUTE && prop.name === 'data-eldra-ui');

const templates = files.map((file) => {
  const ast = parse(readFileSync(file, 'utf8')).descriptor.template?.ast as
    | TemplateNode
    | undefined;
  return { file: relative(src, file), ast };
});

describe('data-eldra-ui, the marker components.css scopes its reset to', () => {
  it('finds the templates and the teleports to check', () => {
    expect(files.length).toBeGreaterThan(70);
    expect(templates.flatMap(({ ast }) => (ast ? teleports(ast) : [])).length).toBeGreaterThan(5);
  });

  it('is on every root a component renders and every root it teleports', () => {
    const missing = templates.flatMap(({ file, ast }) => {
      if (!ast) return [`${file}: no <template> to check`];
      const outer = [...roots(ast.children), ...teleports(ast).flatMap((t) => roots(t.children))];
      return outer.filter((node) => !marked(node)).map((node) => `${file}: <${node.tag}>`);
    });
    expect(missing).toEqual([]);
  });
});
