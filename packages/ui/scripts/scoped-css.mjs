/**
 * `dist/scoped.css` is `dist/components.css` rewritten so it can share a page with another
 * Tailwind build (the consumer's) and with the plain kit stylesheet (a host page's own kit
 * components) without either side restyling the other. It is generated, never hand-written; each
 * rule below is enforced by `scripts/__tests__/scoped-css.spec.ts`.
 *
 * 1. Names. Every custom property outside `--eldra-*` and `--tw-*` (Tailwind's theme: `--color-*`,
 *    `--spacing`, `--radius-*`, `--text-*`, `--font-*`, `--ease-*`, `--animate-*`, …) becomes
 *    `--eldra-tw-*`, in declarations, `@property` and every dashed ident in a value (`var()` reads
 *    with their fallbacks, inside `calc()`/`color-mix()`, `transition-property`). Every
 *    `@keyframes` outside `eldra-*` becomes `eldra-tw-*`, with its `animation`/`animation-name`
 *    and `--animate-*` references.
 * 2. Roots. `:root`/`:host`/`html` rules move onto the scope marker: the private theme
 *    (`--eldra-tw-*`) onto every `[data-eldra-scope]`, so a per-scope `--eldra-*` override reaches
 *    the theme aliases that read it; everything else (the `--eldra-*` token defaults) onto the
 *    outermost one only, so a kit element's own override (Carousel's `--eldra-focus-offset`)
 *    still reaches a nested scope.
 * 3. Scope. Every other style rule sits inside one
 *    `@scope ([data-eldra-scope]) to (:scope[data-eldra-slot] > *, [data-eldra-slot] > *)`, its
 *    subject narrowed with `:where(:scope, :scope *)` so the scope root itself matches (a scoped
 *    rule is otherwise relative to the root, matching only its descendants). Consumer content in a
 *    slot host is below the limit and never matched.
 * 4. Layers. The output is unlayered, so it beats a consumer's layered preflight; a consumer whose
 *    own classes must win imports it `layer(components)` instead, which the prefix in 5 makes safe.
 *    Layers are
 *    flattened in their declared order (properties, theme, base, components, utilities, then
 *    unlayered rules) and every layer below the last has its selectors wrapped in `:where()`, so
 *    a later layer still wins whatever the specificity. What that cannot reproduce fails the
 *    build: an `!important` in a lower layer on a property a higher layer also sets `!important`
 *    (layers reverse for important), an unlayered rule less specific than a top-layer rule on the
 *    same property, a nested or anonymous layer, a layer inside a conditional rule.
 * 5. Class names. Every class selector is renamed `eldra:<name>`, the name each component renders
 *    below `provideEldraScope()` (`src/utils/scopedClass.ts`), so a consumer Tailwind build's own
 *    utilities can never match a kit element and the sheet can sit in a layer below them
 *    (`@import '@eldrajs/ui/scoped.css' layer(components)`). `group`/`peer` markers keep their
 *    names: they carry no style, and a consumer's own `group/section` drives the section variants.
 * 6. Hoisting. `@property`, `@keyframes` and `@font-face` move to the top level ahead of the
 *    scope; one inside a conditional rule fails the build, as does any at-rule this does not know.
 *
 * @param {string} css the compiled `dist/components.css`
 * @returns {string}
 */
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';

export const SCOPE_PRELUDE =
  '([data-eldra-scope]) to (:scope[data-eldra-slot] > *, [data-eldra-slot] > *)';
const HEADER =
  '@eldrajs/ui/scoped.css: generated from components.css by scripts/scoped-css.mjs. Styles only under provideEldraScope() (README, "Embedding in another Tailwind app").';
const IN_SCOPE = ':where(:scope, :scope *)';
const EVERY_ROOT = ':where([data-eldra-scope])';
const OUTERMOST_ROOT = ':where([data-eldra-scope]:not([data-eldra-scope] *))';
const ROOTS = new Set([':root', ':host', 'html']);
const HOISTED = new Set(['property', 'keyframes', 'font-face']);
const CONDITIONAL = new Set(['media', 'supports', 'container', 'starting-style']);
const LEGACY_PSEUDO_ELEMENTS = new Set([':before', ':after', ':first-line', ':first-letter']);

const fail = (message) => {
  throw new Error(`scoped.css: ${message}`);
};

export const KIT_CLASS_PREFIX = 'eldra:';
const isMarker = (name) => /^(group|peer)(\/|$)/.test(name);

/** Renames every class in a selector, `:where()`/`:is()`/`:not()`/`:has()` arguments included. */
export function prefixClasses(selector) {
  return selectorParser((root) =>
    root.walkClasses((node) => {
      if (!isMarker(node.value)) node.value = `${KIT_CLASS_PREFIX}${node.value}`;
    })
  ).processSync(selector);
}

export const privateProperty = (name) =>
  name.startsWith('--eldra-') || name.startsWith('--tw-') ? name : `--eldra-tw-${name.slice(2)}`;
export const privateKeyframes = (name) => (name.startsWith('eldra-') ? name : `eldra-tw-${name}`);

function renameValue(value, keyframes, isAnimation) {
  const parsed = valueParser(value);
  parsed.walk((node) => {
    if (node.type !== 'word') return;
    if (node.value.startsWith('--')) node.value = privateProperty(node.value);
    else if (isAnimation && keyframes.has(node.value)) node.value = privateKeyframes(node.value);
  });
  return parsed.toString();
}

const isPseudoElement = (node) =>
  node.type === 'pseudo' &&
  (node.value.startsWith('::') || LEGACY_PSEUDO_ELEMENTS.has(node.value.toLowerCase()));

const mentionsRoot = (selector) => {
  let found = false;
  selectorParser((root) =>
    root.walk((node) => {
      if (
        (node.type === 'pseudo' && ROOTS.has(node.value)) ||
        (node.type === 'tag' && node.value === 'html')
      )
        found = true;
    })
  ).processSync(selector);
  return found;
};

/** Puts `:where(:scope, :scope *)` on the subject, before its pseudo-element; `lower` also zeroes the specificity. */
function scopeSelector(selector, lower) {
  const [complex, ...more] = selectorParser().astSync(selector).nodes;
  if (more.length) fail(`expected one selector, got \`${selector}\``);
  const nodes = complex.nodes;
  const subject = nodes.findLastIndex((node) => node.type === 'combinator') + 1;
  let split = nodes.findIndex((node, index) => index >= subject && isPseudoElement(node));
  if (split === -1) split = nodes.length;
  const head = nodes.slice(0, split).join('').trim();
  const tail = nodes.slice(split).join('');
  return `${lower && head ? `:where(${head})` : head}${IN_SCOPE}${tail}`;
}

/** Specificity as one comparable number: ids, classes, types in base 1000. */
function specificity(selector) {
  const of = (container) =>
    container.nodes.reduce((sum, node) => {
      if (node.type === 'id') return sum + 1e6;
      if (node.type === 'class' || node.type === 'attribute') return sum + 1e3;
      if (node.type === 'tag') return sum + 1;
      if (node.type !== 'pseudo') return sum;
      if (isPseudoElement(node)) return sum + 1;
      if (node.value === ':where') return sum;
      if ([':is', ':not', ':has'].includes(node.value))
        return sum + Math.max(0, ...node.nodes.map(of));
      return sum + 1e3;
    }, 0);
  let result = 0;
  selectorParser((root) => {
    result = Math.max(...root.nodes.map(of));
  }).processSync(selector);
  return result;
}

const styleRules = (nodes) =>
  nodes.flatMap((node) =>
    node.type === 'rule' ? [node] : node.nodes ? styleRules(node.nodes) : []
  );

/** Splits a node into its root rules and everything else, each wrapped in its conditional rules. */
function partition(node) {
  if (node.type === 'rule') {
    const roots = node.selectors.map((s) => s.trim()).filter((s) => ROOTS.has(s));
    if (roots.length === node.selectors.length) return { root: node, scoped: null };
    if (roots.length || node.selectors.some(mentionsRoot))
      fail(`\`${node.selector}\` mixes a root with other selectors`);
    return { root: null, scoped: node };
  }
  const parts = node.nodes.map(partition);
  const wrap = (kids) => (kids.length ? node.clone().removeAll().append(kids) : null);
  return {
    root: wrap(parts.map((part) => part.root).filter(Boolean)),
    scoped: wrap(parts.map((part) => part.scoped).filter(Boolean)),
  };
}

export function scopeCss(css) {
  const sheet = postcss.parse(css);

  const keyframes = new Set();
  sheet.walkAtRules('keyframes', (rule) => void keyframes.add(rule.params.trim()));
  sheet.walkDecls((decl) => {
    const isAnimation =
      ['animation', 'animation-name'].includes(decl.prop) || decl.prop.startsWith('--animate-');
    decl.value = renameValue(decl.value, keyframes, isAnimation);
    if (decl.prop.startsWith('--')) decl.prop = privateProperty(decl.prop);
  });
  sheet.walkAtRules((rule) => {
    if (rule.name === 'property') rule.params = privateProperty(rule.params.trim());
    if (rule.name === 'keyframes') rule.params = privateKeyframes(rule.params.trim());
  });

  const license = [];
  const hoisted = [];
  const layers = new Map();
  const layer = (name) => layers.get(name) ?? layers.set(name, []).get(name);
  const unlayered = [];
  for (const node of sheet.nodes) {
    if (node.type === 'comment') {
      if (node.text.startsWith('!')) license.push(node);
    } else if (node.type === 'atrule' && node.name === 'layer') {
      const names = node.params.split(',').map((name) => name.trim());
      if (names.some((name) => !name || name.includes('.')))
        fail(`unsupported layer \`@layer ${node.params}\``);
      if (!node.nodes) names.forEach(layer);
      else if (names.length > 1)
        fail(`\`@layer ${node.params}\` names more than one layer for a block`);
      else
        for (const child of node.nodes) {
          if (child.type === 'atrule' && HOISTED.has(child.name)) hoisted.push(child);
          else if (child.type !== 'comment') layer(names[0]).push(child);
        }
    } else if (node.type === 'atrule' && HOISTED.has(node.name)) hoisted.push(node);
    else unlayered.push(node);
  }

  const groups = [...layers.values(), unlayered];
  for (const node of groups.flat()) {
    node.walk((inner) => void (inner.type === 'comment' && inner.remove()));
    for (const inner of [node, ...styleRules(node.nodes ?? [])])
      if (inner.type === 'rule' && inner.nodes.some((child) => child.type === 'rule'))
        fail(`nested rule in \`${inner.selector}\``);
    const atRules = [node];
    node.walkAtRules((inner) => void atRules.push(inner));
    for (const inner of atRules.filter((n) => n.type === 'atrule'))
      if (!CONDITIONAL.has(inner.name))
        fail(`\`@${inner.name}\` inside a conditional rule or layer is not supported`);
  }

  const rootRules = [];
  const scoped = groups.map((group) =>
    group.flatMap((node) => {
      const { root, scoped: rest } = partition(node);
      if (root) rootRules.push(root);
      return rest ? [rest] : [];
    })
  );

  const top = scoped.length - 2;
  const importantIn = (nodes) =>
    new Set(
      styleRules(nodes).flatMap((rule) => rule.nodes.filter((d) => d.important).map((d) => d.prop))
    );
  scoped.slice(0, -1).forEach((nodes, index) => {
    const later = importantIn(scoped.slice(index + 1).flat());
    for (const prop of importantIn(nodes))
      if (later.has(prop))
        fail(`\`${prop} !important\` is set in two layers; flattening would reverse them`);
  });
  const topSpecificity = new Map();
  for (const rule of styleRules(scoped[top] ?? []))
    for (const decl of rule.nodes.filter((d) => d.type === 'decl'))
      topSpecificity.set(
        decl.prop,
        Math.max(topSpecificity.get(decl.prop) ?? 0, ...rule.selectors.map(specificity))
      );
  for (const rule of styleRules(scoped.at(-1)))
    for (const decl of rule.nodes.filter((d) => d.type === 'decl'))
      if (Math.min(...rule.selectors.map(specificity)) < (topSpecificity.get(decl.prop) ?? 0))
        fail(
          `unlayered \`${rule.selector}\` would lose \`${decl.prop}\` to a more specific layered rule`
        );

  scoped.forEach((nodes, index) => {
    const lower = index < top;
    for (const rule of styleRules(nodes))
      rule.selectors = rule.selectors.map((s) => scopeSelector(prefixClasses(s), lower));
  });
  const roots = rootRules.flatMap((node) => {
    const split = (rule) => {
      const every = rule.nodes.filter((d) => d.prop.startsWith('--eldra-tw-'));
      const pair = [postcss.rule({ selector: EVERY_ROOT }).append(every), rule];
      rule.selector = OUTERMOST_ROOT;
      return pair.filter((r) => r.nodes.length);
    };
    if (node.type === 'rule') return split(node);
    for (const rule of styleRules([node])) rule.replaceWith(...split(rule));
    return styleRules([node]).length ? [node] : [];
  });

  const out = postcss.root();
  out.append(license, postcss.comment({ text: HEADER }), hoisted, roots);
  out.append(postcss.atRule({ name: 'scope', params: SCOPE_PRELUDE }).append(scoped.flat()));
  out.walk((node) => node.cleanRaws(true));
  return `${out.toString().trim()}\n`;
}
