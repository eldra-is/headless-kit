// @vitest-environment jsdom
//
// Two things live in this file because they are one contract: spec 2's
// single shared rich-text typography definition (blocks spec lines
// 2449–2526) and the DOM surgery that fills the two gaps the renderer
// leaves in it (contract addition #6 — focusable table regions and
// focusable `<pre>`). `test/mainCss.spec.ts` already establishes the
// "compile the real stylesheet and assert on its output" technique for
// `app/assets/main.css`; the CSS half below reuses it. The DOM half mounts
// a small fragment with `@vue/test-utils`, the same as `test/useUiId.spec.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { compile } from '@tailwindcss/node';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, reactive, ref, type Ref } from 'vue';
import { ELDRA_KEY, createEldraPreviewState } from '@eldrajs/theme-vue';
import { useRichTextScrollRegions } from '../app/composables/useRichTextScrollRegions';

// `import.meta.dirname` rather than `fileURLToPath(new URL(..., import.meta.url))`:
// under `@vitest-environment jsdom` (needed below for the scroll-region
// mount tests) Vite's dev transform rewrites the `new URL(relative,
// import.meta.url)` idiom into a browser dev-server URL (its usual
// asset-import handling), which is not a `file://` path and breaks a plain
// Node read — `import.meta.dirname` is untouched by that transform.
const assetsDir = `${join(import.meta.dirname, '../app/assets')}/`;
const mainCss = readFileSync(`${assetsDir}main.css`, 'utf8');

async function build(): Promise<string> {
  const compiler = await compile(mainCss, { base: assetsDir, onDependency() {} });
  // `.prose-eldra`'s rules are all `@apply`/plain CSS inside `@layer
  // components` — resolved at compile time from the stylesheet's own text,
  // not from a scanned candidate list (see mainCss.spec.ts's comment on
  // this same API for the utilities that *do* need one). An empty
  // candidate list is enough to prove that.
  return compiler.build([]);
}

/**
 * Returns the declaration block for the first rule whose selector text is
 * `selector` (pass the selector followed by ` {` so a short selector never
 * matches as a prefix of a longer, unrelated one — `.prose-eldra
 * :where(blockquote) {` must not match `.prose-eldra :where(blockquote)
 * :where(footer, cite) {`). Brace-counts rather than stopping at the first
 * `}`, so nested at-rules (the focus ring's own `@supports`/`@media`
 * blocks) don't truncate the result early.
 */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found in compiled CSS: ${selector}`);
  const openBrace = css.indexOf('{', start);
  let depth = 0;
  let i = openBrace;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return css.slice(openBrace + 1, i);
}

describe('rich-text typography (main.css)', () => {
  let css: string;

  beforeAll(async () => {
    css = await build();
  });

  it('blockquote has no side bar and no italics, a hanging accent quote mark, and 2.25rem block margins', () => {
    const blockquote = ruleBody(css, '.prose-eldra :where(blockquote) {');
    expect(blockquote).not.toContain('border-left');
    expect(blockquote).not.toContain('italic');

    const openingMark = ruleBody(css, '.prose-eldra :where(blockquote)::before {');
    expect(openingMark).toContain("content: '\\201C'");
    expect(openingMark).toContain('var(--color-accent)');

    expect(ruleBody(css, '.prose-eldra > * + :where(blockquote) {')).toContain(
      'margin-top: 2.25rem'
    );
    expect(ruleBody(css, '.prose-eldra > :where(blockquote) {')).toContain(
      'margin-bottom: 2.25rem'
    );
  });

  it('pre does not wrap, scrolls horizontally, and draws a border outline', () => {
    const pre = ruleBody(css, '.prose-eldra :where(pre) {');
    expect(pre).toContain('white-space: pre');
    expect(pre).toContain('overflow-x: auto');
    expect(pre).toContain('border-width: 1px');
    expect(pre).toContain('var(--color-border)');
  });

  it('table collapses its borders, weights header cells 600, and rules them with border-strong', () => {
    const table = ruleBody(css, '.prose-eldra :where(table) {');
    expect(table).toContain('border-collapse: collapse');

    const th = ruleBody(css, '.prose-eldra :where(th) {');
    expect(th).toContain('font-weight: 600');
    expect(th).toContain('var(--color-border-strong)');
  });

  it('hr keeps a 2.75rem rhythm above and below', () => {
    expect(ruleBody(css, '.prose-eldra > :where(hr) {')).toContain('margin-bottom: 2.75rem');
    expect(ruleBody(css, '.prose-eldra > * + :where(hr) {')).toContain('margin-top: 2.75rem');
  });

  it('links are underlined 1px thick at a 0.2em offset', () => {
    const a = ruleBody(css, '.prose-eldra :where(a) {');
    expect(a).toContain('text-decoration-thickness: 1px');
    expect(a).toContain('text-underline-offset: 0.2em');
  });

  it('the centred variant uses inside list markers and keeps pre/table left-aligned', () => {
    expect(ruleBody(css, '.prose-eldra-center :where(ul, ol) {')).toContain(
      'list-style-position: inside'
    );
    const leftAligned = ruleBody(
      css,
      '.prose-eldra-center :where(pre), .prose-eldra-center :where(table) {'
    );
    expect(leftAligned).toContain('text-align: left');
  });
});

describe('useRichTextScrollRegions', () => {
  function mountFragment(root: Ref<HTMLElement | null>, provide?: Record<symbol, unknown>) {
    const Host = defineComponent({
      setup() {
        useRichTextScrollRegions(root, (caption) =>
          caption !== null ? `${caption} table` : 'Table'
        );
        return () =>
          h('div', { ref: root }, [
            h('table', {}, [
              h('caption', {}, 'Glaze recipes'),
              h('tbody', {}, [h('tr', {}, [h('td', {}, 'Cone 6, matte white')])]),
            ]),
            h('pre', {}, 'kiln.fire(2232)'),
          ]);
      },
    });
    return mount(Host, provide === undefined ? {} : { global: { provide } });
  }

  it('wraps a captioned table in a focusable, labelled scroll region', () => {
    const root: Ref<HTMLElement | null> = ref(null);
    const wrapper = mountFragment(root);

    const region = wrapper.find('div[role="region"]');
    expect(region.exists()).toBe(true);
    expect(region.attributes('tabindex')).toBe('0');
    expect(region.attributes('aria-label')).toBe('Glaze recipes table');
    expect(region.find('table').exists()).toBe(true);
  });

  it('makes the code block focusable', () => {
    const root: Ref<HTMLElement | null> = ref(null);
    const wrapper = mountFragment(root);
    expect(wrapper.find('pre').attributes('tabindex')).toBe('0');
  });

  it('is idempotent: a render-revision bump never wraps an already-wrapped table again', async () => {
    const context = {
      client: {},
      designTokens: reactive({ colors: {}, containers: {} }),
      preview: createEldraPreviewState(),
    };
    const root: Ref<HTMLElement | null> = ref(null);
    const wrapper = mountFragment(root, { [ELDRA_KEY]: context });

    expect(wrapper.findAll('div[role="region"]')).toHaveLength(1);

    context.preview.richTextRenderRevision += 1;
    await nextTick();

    expect(wrapper.findAll('div[role="region"]')).toHaveLength(1);
    expect(wrapper.find('div[role="region"]').attributes('aria-label')).toBe('Glaze recipes table');
  });
});
