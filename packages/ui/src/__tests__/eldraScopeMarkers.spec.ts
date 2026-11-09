import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme; Node's own resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'vue/compiler-sfc';

/**
 * The template rules `@eldrajs/ui/scoped.css` depends on (README, "Embedding in another Tailwind
 * app"), checked on every SFC so a new slot or a new root cannot skip them:
 *
 * - every `data-eldra-ui` element also binds `:data-eldra-scope`;
 * - every element that renders a `<slot>` binds `:data-eldra-slot` naming that slot, because
 *   `scoped.css` stops at `[data-eldra-slot] > *`;
 * - every kit-owned element that sits beside a `<slot>` in such a host, and every kit-owned element
 *   handed into another component's slot, binds `:data-eldra-scope`, so it is a scope root of its
 *   own and stays styled although it is below the host's limit.
 *
 * A `<slot>` placed straight into another component's slot only forwards it, so the slot it is
 * forwarded to must be hosted in turn, through every component it passes. A slot rendered from a
 * render function (`<component :is="Trigger" />` whose `Trigger` calls `slots.trigger`) counts as a
 * `<slot>` where the `<component>` stands. A slot at the template root has no host at all.
 */

interface Prop {
  type: number;
  name: string;
  rawName?: string;
  arg?: { content: string; isStatic?: boolean };
  exp?: { content: string };
  value?: { content: string };
}
interface TemplateNode {
  type: number;
  tag?: string;
  tagType?: number;
  props?: Prop[];
  children?: TemplateNode[];
}

const ELEMENT = 1;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;
const TAG_COMPONENT = 1;
const TAG_SLOT = 2;
const TAG_TEMPLATE = 3;
const WRAPPERS = new Set(['Transition', 'TransitionGroup', 'KeepAlive']);

const src = fileURLToPath(new NodeURL('../', import.meta.url));

function sfcs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sfcs(path);
    return entry.name.endsWith('.vue') ? [path] : [];
  });
}

const files = [...sfcs(join(src, 'components')), ...sfcs(join(src, 'vee-validate'))];

const elements = (nodes: TemplateNode[] = []) => nodes.filter((node) => node.type === ELEMENT);
const binds = (node: TemplateNode, attr: string) =>
  (node.props ?? []).some(
    (prop) => prop.type === DIRECTIVE && prop.name === 'bind' && prop.arg?.content === attr
  );
const bound = (node: TemplateNode, attr: string) =>
  (node.props ?? []).find(
    (prop) => prop.type === DIRECTIVE && prop.name === 'bind' && prop.arg?.content === attr
  )?.exp?.content ?? '';
const hasAttribute = (node: TemplateNode, attr: string) =>
  (node.props ?? []).some((prop) => prop.type === ATTRIBUTE && prop.name === attr);
const slotName = (node: TemplateNode) =>
  (node.props ?? []).find((prop) => prop.type === ATTRIBUTE && prop.name === 'name')?.value
    ?.content ?? 'default';
const isSlotTemplate = (node: TemplateNode) =>
  node.tagType === TAG_TEMPLATE &&
  (node.props ?? []).some((prop) => prop.type === DIRECTIVE && prop.name === 'slot');

const functionalWrappers = (source: string) =>
  new Set([...source.matchAll(/const (\w+): FunctionalComponent\b/g)].map((match) => match[1]!));

interface File {
  file: string;
  component: string;
  ast: TemplateNode;
  local: Set<string>;
}

/** The slot a local render function renders: `function Trigger() { … slots.trigger … }`. */
function renderedSlots(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(/\nfunction (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
    const slot = /\bslots\.(\w+)\s*\?*\.?\(/.exec(match[2]!)?.[1];
    if (slot) found.set(match[1]!, slot);
  }
  return found;
}

/** Rewrites each `<component :is="Fn" />` whose `Fn` renders a slot into that `<slot>`. */
function inlineRenderedSlots(node: TemplateNode, rendered: Map<string, string>): void {
  for (const child of elements(node.children)) {
    const slot = child.tag === 'component' ? rendered.get(bound(child, 'is').trim()) : undefined;
    if (slot !== undefined) {
      child.tagType = TAG_SLOT;
      child.tag = 'slot';
      child.props = [{ type: ATTRIBUTE, name: 'name', value: { content: slot } }];
    }
    inlineRenderedSlots(child, rendered);
  }
}

export function parseSfc(file: string, source: string): File | undefined {
  const ast = parse(source).descriptor.template?.ast as TemplateNode | undefined;
  if (!ast) return undefined;
  inlineRenderedSlots(ast, renderedSlots(source));
  return { file, component: basename(file, '.vue'), ast, local: functionalWrappers(source) };
}

const templates: File[] = files.flatMap((file) => {
  const parsed = parseSfc(relative(src, file), readFileSync(file, 'utf8'));
  return parsed ? [parsed] : [];
});

/** Whether a node renders no element of its own: a plain `<template>`, Vue's wrappers, a local
 *  functional component, or (`throughSlots`) a `<slot>` whose fallback renders in its place. */
const transparent = (node: TemplateNode, local: Set<string>, throughSlots = false) =>
  (node.tagType === TAG_TEMPLATE && !isSlotTemplate(node)) ||
  WRAPPERS.has(node.tag ?? '') ||
  local.has(node.tag ?? '') ||
  (throughSlots && node.tagType === TAG_SLOT);

/** Elements as the DOM sees them, through every transparent node. */
function flat(
  nodes: TemplateNode[] = [],
  local: Set<string>,
  throughSlots = false,
  skip?: TemplateNode
): TemplateNode[] {
  return elements(nodes).flatMap((node) => {
    if (node === skip) return [];
    // A disabled `<Teleport>` renders its content in place, beside whatever else is there.
    if (!transparent(node, local, throughSlots) && node.tag !== 'Teleport') return [node];
    return flat(node.children, local, throughSlots, skip);
  });
}

const kitOwned = (node: TemplateNode, components: Set<string>) =>
  !(node.tagType === TAG_COMPONENT && components.has(node.tag ?? '')) && node.tagType !== TAG_SLOT;

function walk(node: TemplateNode, visit: (node: TemplateNode, parent: TemplateNode) => void): void {
  for (const child of elements(node.children)) {
    visit(child, node);
    walk(child, visit);
  }
}

/** The slot of `parent` a node sits in: `<template #name>`'s name, the component's default, or
 *  `undefined` for `#[name]`, which forwards each slot to its own name in the target, checked there. */
const targetSlot = (parent: TemplateNode) => {
  const directive = (parent.props ?? []).find(
    (prop) => prop.type === DIRECTIVE && prop.name === 'slot'
  );
  if (directive?.arg && directive.arg.isStatic === false) return undefined;
  return directive?.arg?.content ?? 'default';
};

interface Forward {
  slot: string;
  component: string;
  into: string;
}

/** Checks the given templates against each other: a forwarded slot resolves in its target's. */
export function checkAll(all: File[]): string[] {
  const byComponent = new Map(all.map((file) => [file.component, file]));
  const components = new Set(byComponent.keys());
  const isComponent = (node: TemplateNode) =>
    node.tagType === TAG_COMPONENT && components.has(node.tag ?? '');
  const forwards = new Map<string, Forward[]>();
  const rendered = new Map<string, Set<string>>();

  const check = ({ file, component, ast, local }: File): string[] => {
    const problems: string[] = [];
    const parents = new Map<TemplateNode, TemplateNode>();
    walk(ast, (child, parent) => parents.set(child, parent));
    const host = (node: TemplateNode): TemplateNode | undefined => {
      let parent = parents.get(node);
      while (parent && transparent(parent, local, true)) parent = parents.get(parent);
      return parent;
    };
    const needsScope = (nodes: TemplateNode[] | undefined, where: string) => {
      for (const node of flat(nodes, local).filter((n) => kitOwned(n, components)))
        if (!binds(node, 'data-eldra-scope')) problems.push(`${file}: <${node.tag}> ${where}`);
    };
    const own = rendered.get(component) ?? rendered.set(component, new Set()).get(component)!;
    const forwarded = forwards.get(component) ?? forwards.set(component, []).get(component)!;

    walk(ast, (node) => {
      if (hasAttribute(node, 'data-eldra-ui') && !binds(node, 'data-eldra-scope'))
        problems.push(`${file}: <${node.tag} data-eldra-ui> has no :data-eldra-scope`);

      if (isComponent(node)) {
        const slotted = elements(node.children);
        needsScope(
          slotted.filter((child) => !isSlotTemplate(child)),
          `passed into <${node.tag}>`
        );
        for (const template of slotted.filter(isSlotTemplate))
          needsScope(template.children, `passed into <${node.tag}>`);
      }

      if (node.tagType !== TAG_SLOT) return;
      const name = slotName(node);
      own.add(name);
      const parent = host(node);
      if (!parent || parent.type !== ELEMENT || parent.tag === 'Teleport') {
        problems.push(`${file}: <slot name="${name}"> has no host element`);
        return;
      }
      if (isSlotTemplate(parent) || isComponent(parent)) {
        const target = isComponent(parent) ? parent : parents.get(parent)!;
        const into = targetSlot(parent);
        if (into !== undefined) forwarded.push({ slot: name, component: target.tag!, into });
        needsScope(node.children, `in the fallback of a forwarded <slot name="${name}">`);
        return;
      }
      if (!bound(parent, 'data-eldra-slot').includes(`'${name}'`))
        problems.push(
          `${file}: <${parent.tag}> hosts <slot name="${name}"> without it in :data-eldra-slot`
        );
      needsScope(flat(parent.children, local, true, node), `beside <slot name="${name}">`);
    });
    return problems;
  };

  const problems = all.flatMap(check);
  /** Follows a forward to the slot that finally hosts it, failing on one its target never renders. */
  const resolve = (from: string, hop: Forward, seen: Set<string>): string | undefined => {
    const key = `${hop.component}#${hop.into}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    if (!rendered.get(hop.component)?.has(hop.into))
      return `${byComponent.get(from)!.file}: <slot name="${hop.slot}"> is forwarded into <${hop.component}>'s "${hop.into}" slot, which it never renders`;
    for (const next of forwards.get(hop.component) ?? [])
      if (next.slot === hop.into) {
        const problem = resolve(hop.component, next, seen);
        if (problem) return problem;
      }
    return undefined;
  };
  for (const [component, hops] of forwards)
    for (const hop of hops) {
      const problem = resolve(component, hop, new Set());
      if (problem) problems.push(problem);
    }
  return problems;
}

describe('the markers scoped.css styles by', () => {
  it('finds the templates to check', () => {
    expect(templates.length).toBeGreaterThan(70);
  });

  it('are on every root, slot host and kit element beside or inside a slot', () => {
    expect(checkAll(templates)).toEqual([]);
  });

  it('counts a slot a render function renders where its <component :is> stands', () => {
    const slotsOf = (component: string) => {
      const names: string[] = [];
      walk(templates.find((t) => t.component === component)!.ast, (node) => {
        if (node.tagType === TAG_SLOT) names.push(slotName(node));
      });
      return names;
    };
    expect(slotsOf('Popover')).toContain('trigger');
    expect(slotsOf('Tooltip')).toContain('default');
    const fixture = parseSfc(
      'Fixture.vue',
      `<script setup lang="ts">
const slots = useSlots();
function Trigger() {
  return slots.trigger?.({});
}
</script>
<template><div data-eldra-ui :data-eldra-scope="s"><component :is="Trigger" /></div></template>`
    )!;
    expect(checkAll([fixture])).toEqual([
      'Fixture.vue: <div> hosts <slot name="trigger"> without it in :data-eldra-slot',
    ]);
  });

  it('fails a slot at the template root', () => {
    const fixture = parseSfc('Root.vue', '<template><Transition><slot /></Transition></template>')!;
    expect(checkAll([fixture])).toEqual(['Root.vue: <slot name="default"> has no host element']);
  });

  it('follows a forwarded slot into the component it is forwarded to', () => {
    const outer = parseSfc(
      'Outer.vue',
      '<template><div><Inner><template #error><slot name="error" /></template></Inner></div></template>'
    )!;
    const unhosted = parseSfc('Inner.vue', '<template><p><slot name="error" /></p></template>')!;
    const missing = parseSfc(
      'Inner.vue',
      '<template><p :data-eldra-slot="x(\'default\')"><slot /></p></template>'
    )!;
    const hosted = parseSfc(
      'Inner.vue',
      '<template><p :data-eldra-slot="x(\'error\')"><slot name="error" /></p></template>'
    )!;
    expect(checkAll([outer, unhosted])).toEqual([
      'Inner.vue: <p> hosts <slot name="error"> without it in :data-eldra-slot',
    ]);
    expect(checkAll([outer, missing])).toEqual([
      'Outer.vue: <slot name="error"> is forwarded into <Inner>\'s "error" slot, which it never renders',
    ]);
    expect(checkAll([outer, hosted])).toEqual([]);
  });
});
