import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { ELDRA_KEY, createEldraPreviewState, type EldraContext } from '../context';
import { EldraRichText } from '../EldraRichText';
import { renderRichTextDoc, type RichTextNode } from '../richTextRender';
import { registerBlockFields, safeHref } from '@eldrajs/theme-core';

function doc(content: RichTextNode[]): { type: 'doc'; content: RichTextNode[] } {
  return { type: 'doc', content };
}

function textNode(text: string, marks?: RichTextNode['marks']): RichTextNode {
  return marks === undefined ? { type: 'text', text } : { type: 'text', text, marks };
}

function mountDoc(
  value: unknown,
  extraProps: Record<string, unknown> = {},
  context?: EldraContext
) {
  return mount(EldraRichText, {
    props: { entryId: 'entry-1', field: 'body', doc: value, ...extraProps },
    ...(context === undefined ? {} : { global: { provide: { [ELDRA_KEY as symbol]: context } } }),
  });
}

/** A read-only preview context carrying an active content locale. */
function previewContext(locale: string | null): EldraContext {
  return {
    client: {},
    designTokens: reactive({ colors: {}, containers: {} }),
    preview: Object.assign(createEldraPreviewState(), { active: true, locale }),
  } as unknown as EldraContext;
}

afterEach(() => {
  registerBlockFields({});
});

describe('EldraRichText root', () => {
  it('carries the marking attributes and omits locale when absent', () => {
    const wrapper = mountDoc(doc([]));
    const root = wrapper.find('[data-eldra-rich-text]');
    expect(root.exists()).toBe(true);
    expect(root.attributes('data-eldra-field')).toBe('body');
    expect(root.attributes('data-eldra-entry')).toBe('entry-1');
    expect(root.attributes('data-eldra-locale')).toBeUndefined();
  });

  it('sets data-eldra-locale when locale is provided', () => {
    const wrapper = mountDoc(doc([]), { locale: 'is-IS' });
    expect(wrapper.attributes('data-eldra-locale')).toBe('is-IS');
  });

  it('defaults an omitted locale to the preview locale for a localized field', () => {
    registerBlockFields({ article: [{ fieldId: 'body', type: 'rich-text', localized: true }] });
    const wrapper = mountDoc(doc([]), { apiId: 'article' }, previewContext('is-IS'));
    expect(wrapper.attributes('data-eldra-locale')).toBe('is-IS');
    expect((wrapper.vm as unknown as { locale: string | null }).locale).toBe('is-IS');
  });

  it('keeps a non-localized field locale-less even inside a localized preview', () => {
    registerBlockFields({ article: [{ fieldId: 'body', type: 'rich-text' }] });
    const wrapper = mountDoc(doc([]), { apiId: 'article' }, previewContext('is-IS'));
    expect(wrapper.attributes('data-eldra-locale')).toBeUndefined();
  });

  it('an explicit locale prop always wins over the preview locale', () => {
    registerBlockFields({ article: [{ fieldId: 'body', type: 'rich-text', localized: true }] });
    const wrapper = mountDoc(
      doc([]),
      { apiId: 'article', locale: 'fr-FR' },
      previewContext('is-IS')
    );
    expect(wrapper.attributes('data-eldra-locale')).toBe('fr-FR');
  });

  it('renders an empty root when doc is not a { type: "doc" } object', () => {
    for (const bad of [null, undefined, {}, { type: 'paragraph' }, 'not a doc', 42, []]) {
      const wrapper = mountDoc(bad);
      expect(wrapper.find('[data-eldra-rich-text]').element.children.length).toBe(0);
    }
  });
});

/**
 * The node/mark rules, `safeHref` gating and attribute whitelist are
 * theme-core's (`buildRichTextTree`, covered by its own suite). What is
 * Vue-specific is the mapper: tree -> h(), with keys. One representative
 * document exercising every construct is enough to catch a mapping mistake.
 */
describe('renderRichTextDoc maps the theme-core tree onto h()', () => {
  const representative = doc([
    { type: 'heading', attrs: { level: 2 }, content: [textNode('Title')] },
    {
      type: 'paragraph',
      content: [
        textNode('bold', [{ type: 'bold' }]),
        textNode(' plain '),
        textNode('link', [
          { type: 'link', attrs: { href: 'https://example.com', target: '_blank' } },
        ]),
        { type: 'hardBreak' },
        textNode('hi', [{ type: 'highlight', attrs: { color: 'yellow' } }]),
      ],
    },
    {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [textNode('One')] }] }],
    },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [textNode('const x = 1;')] },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [textNode('Cell')] }],
        },
      ],
    },
    { type: 'image', attrs: { src: '/media/a.png', alt: 'Alt', assetId: 'asset-1' } },
    { type: 'embed', attrs: { src: 'https://example.com/v', provider: 'vimeo' } },
    { type: 'horizontalRule' },
  ]);

  it('produces the expected markup for every construct', () => {
    const wrapper = mountDoc(representative);

    expect(wrapper.get('[data-eldra-rich-text]').element.innerHTML).toBe(
      // §18 v3: every node element carries its type and open position; mark
      // elements (strong, a, mark), the tbody and the codeBlock's code do not.
      '<h2 data-eldra-node="heading" data-eldra-pos="0">Title</h2>' +
        '<p data-eldra-node="paragraph" data-eldra-pos="7">' +
        '<strong>bold</strong> plain <a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>' +
        '<br data-eldra-node="hardBreak" data-eldra-pos="23">' +
        '<mark style="background-color: yellow;">hi</mark></p>' +
        '<ul data-eldra-node="bulletList" data-eldra-pos="27">' +
        '<li data-eldra-node="listItem" data-eldra-pos="28">' +
        '<p data-eldra-node="paragraph" data-eldra-pos="29">One</p></li></ul>' +
        '<pre data-eldra-node="codeBlock" data-eldra-pos="36">' +
        '<code class="language-ts">const x = 1;</code></pre>' +
        '<table data-eldra-node="table" data-eldra-pos="50"><tbody>' +
        '<tr data-eldra-node="tableRow" data-eldra-pos="51">' +
        '<td colspan="2" data-eldra-node="tableCell" data-eldra-pos="52">Cell</td></tr></tbody></table>' +
        '<img src="/media/a.png" alt="Alt" data-asset-id="asset-1" data-eldra-node="image" data-eldra-pos="60">' +
        '<div class="eldra-embed" data-src="https://example.com/v" data-provider="vimeo"' +
        ' data-eldra-node="embed" data-eldra-pos="61"></div>' +
        '<hr data-eldra-node="horizontalRule" data-eldra-pos="62">'
    );
  });

  it('keys every mapped element, so a re-render patches instead of recreating', () => {
    const nodes = renderRichTextDoc(representative, { safeHref });

    expect(nodes).toHaveLength(8);
    for (const node of nodes) {
      expect((node as { key?: unknown }).key).toEqual(expect.stringMatching(/^rt-\d+$/));
    }
  });

  it('renders an empty root for a document that is not a { type: "doc" } object', () => {
    expect(renderRichTextDoc({ type: 'paragraph' }, { safeHref })).toEqual([]);
    expect(mountDoc(null).get('[data-eldra-rich-text]').text()).toBe('');
  });
});

/**
 * §18 v3 deferred rendering. While the operator types natively in a rich-text
 * root, the browser owns its DOM and theme-core says so; the binding's whole
 * share is to ask, to re-stamp instead of re-rendering while the answer is
 * yes, and to rebuild once when the answer turns back to no.
 */
describe('EldraRichText deferred rendering (§18 v3)', () => {
  /** A preview context whose deferral answer the test controls, standing in
   * for the predicate startEldraPreview installs from the overlay runtime. */
  function deferrableContext(): EldraContext & { defer(value: boolean): void } {
    const preview = Object.assign(createEldraPreviewState(), { active: true, mode: 'edit' });
    let deferred = false;
    preview.isRichTextRenderDeferred = () => deferred;
    const context = {
      client: {},
      designTokens: reactive({ colors: {}, containers: {} }),
      preview,
    } as unknown as EldraContext & { defer(value: boolean): void };
    context.defer = (value: boolean) => {
      deferred = value;
      // What startEldraPreview does on every onRichTextRenderState change.
      preview.richTextRenderRevision += 1;
    };
    return context;
  }

  const before = doc([
    { type: 'paragraph', content: [textNode('Rich ')] },
    { type: 'heading', attrs: { level: 2 }, content: [textNode('After')] },
  ]);
  const after = doc([
    { type: 'paragraph', content: [textNode('Rich ab')] },
    { type: 'heading', attrs: { level: 2 }, content: [textNode('After')] },
  ]);

  it('leaves the DOM alone and re-stamps it when a content update arrives for a deferred field', async () => {
    const context = deferrableContext();
    const wrapper = mountDoc(before, {}, context);
    const root = wrapper.get('[data-eldra-rich-text]');
    // The browser has already put the two characters in; Vue knows nothing of it.
    root.get('p').element.firstChild!.textContent = 'Rich ab';
    context.defer(true);
    await wrapper.vm.$nextTick();

    await wrapper.setProps({ doc: after });

    // The DOM the operator is typing into is untouched...
    expect(root.get('p').text()).toBe('Rich ab');
    expect(root.get('h2').text()).toBe('After');
    // ...but the stamps followed the document, so the next selection report
    // does not name a position two characters out of date.
    expect(root.get('h2').attributes('data-eldra-pos')).toBe('9');
  });

  it('rebuilds the subtree from the latest document once the field is handed back', async () => {
    const context = deferrableContext();
    const wrapper = mountDoc(before, {}, context);
    const root = wrapper.get('[data-eldra-rich-text]');
    root.get('p').element.firstChild!.textContent = 'Rich ab';
    context.defer(true);
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ doc: after });
    expect(root.get('p').text()).toBe('Rich ab');

    // `applied { rerender: true }` (or a blur, or a command) releases the field.
    context.defer(false);
    await wrapper.vm.$nextTick();

    expect(root.get('p').text()).toBe('Rich ab');
    expect(root.get('h2').attributes('data-eldra-pos')).toBe('9');
  });

  it('rebuilds rather than patches, so a document that reverts still reaches the DOM', async () => {
    // The hazard the render key exists for: the browser edited the DOM behind
    // Vue's back, so Vue's own vnode tree still says "Rich ". If the document
    // then comes back to exactly that (an undo), an ordinary patch would see
    // no change and leave the operator's two characters on screen forever.
    const context = deferrableContext();
    const wrapper = mountDoc(before, {}, context);
    const root = wrapper.get('[data-eldra-rich-text]');
    root.get('p').element.firstChild!.textContent = 'Rich ab';
    context.defer(true);
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ doc: after });

    context.defer(false);
    await wrapper.setProps({ doc: before });

    // `.text()` trims, and the trailing space is the point of the revert.
    expect(root.get('p').element.textContent).toBe('Rich ');
  });

  it('falls back to a full re-render when the document no longer matches the tree', async () => {
    const context = deferrableContext();
    const wrapper = mountDoc(before, {}, context);
    const root = wrapper.get('[data-eldra-rich-text]');
    root.get('p').element.firstChild!.textContent = 'Rich ab';
    context.defer(true);
    await wrapper.vm.$nextTick();

    // A structural change arrived while deferred: the stamps cannot describe
    // it, so the only honest answer is to render it.
    await wrapper.setProps({
      doc: doc([
        { type: 'paragraph', content: [textNode('Rich ab')] },
        { type: 'heading', attrs: { level: 2 }, content: [textNode('After')] },
        { type: 'paragraph', content: [textNode('And more')] },
      ]),
    });

    expect(root.findAll('p')).toHaveLength(2);
    expect(root.get('p').text()).toBe('Rich ab');
  });

  it('renders straight through without a preview, where nothing is ever deferred', async () => {
    const wrapper = mountDoc(before);

    await wrapper.setProps({ doc: after });

    expect(wrapper.get('p').text()).toBe('Rich ab');
  });
});

/**
 * §18 v3 floating toolbar follow-up: `padEmptyBlocks` is passed to
 * `renderRichTextDoc` from inside the render function, not computed once in
 * setup — `preview.mode` is still its 'preview' default on the first render
 * and only becomes real once `editor:init` arrives, with no remount to
 * re-evaluate a one-shot check.
 */
describe('EldraRichText padEmptyBlocks (§18 v3 floating toolbar follow-up)', () => {
  const emptyParagraph = doc([{ type: 'paragraph' }]);

  it('pads an empty paragraph only while the preview is in edit mode, reactively', async () => {
    const context = previewContext(null);
    const wrapper = mountDoc(emptyParagraph, {}, context);
    expect(wrapper.get('p').element.innerHTML).toBe('');

    context.preview.mode = 'edit';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('p').element.innerHTML).toBe('<br data-eldra-pad="">');

    context.preview.mode = 'preview';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('p').element.innerHTML).toBe('');
  });

  it('never pads outside a preview context, so static/published output is unchanged', () => {
    const wrapper = mountDoc(emptyParagraph);
    expect(wrapper.get('p').element.innerHTML).toBe('');
  });

  it('never pads a preview context that is not in edit mode', () => {
    const context = previewContext(null);
    const wrapper = mountDoc(emptyParagraph, {}, context);
    expect(wrapper.get('p').element.innerHTML).toBe('');
  });
});

/**
 * `minHeadingLevel` (added 2026-09-27). The floor itself, with all its normalisation, is
 * theme-core's `clampHeadingLevel` (covered by that package's own suite); what is this component's
 * is the wiring: the prop's default, that it is read *inside* the render (so a block can bind it to
 * reactive state and see the tags follow with no remount), and that nothing else about the render —
 * the position stamps native editing depends on, the marking attributes — moves with it.
 *
 * The starter's `rich-text` block shipped a `floorRichTextHeadingLevels` transform over the TipTap
 * JSON instead, because there was no prop; that copied and rewrote the whole document to change a
 * tag name.
 */
describe('EldraRichText — minHeadingLevel', () => {
  const headings = doc([
    { type: 'heading', attrs: { level: 1 }, content: [textNode('One')] },
    { type: 'heading', attrs: { level: 2 }, content: [textNode('Two')] },
    { type: 'heading', attrs: { level: 3 }, content: [textNode('Three')] },
  ]);

  function tags(wrapper: ReturnType<typeof mountDoc>): string[] {
    return [...wrapper.get('[data-eldra-rich-text]').element.children].map((el) =>
      el.tagName.toLowerCase()
    );
  }

  it('renders the document own levels when the prop is omitted', () => {
    expect(tags(mountDoc(headings))).toEqual(['h1', 'h2', 'h3']);
  });

  it('floors every heading above it, leaving deeper ones alone', () => {
    expect(tags(mountDoc(headings, { minHeadingLevel: 3 }))).toEqual(['h3', 'h3', 'h3']);
    expect(tags(mountDoc(headings, { minHeadingLevel: 2 }))).toEqual(['h2', 'h2', 'h3']);
  });

  it('follows a reactive value with no remount', async () => {
    const wrapper = mountDoc(headings, { minHeadingLevel: 1 });
    expect(tags(wrapper)).toEqual(['h1', 'h2', 'h3']);
    await wrapper.setProps({ minHeadingLevel: 4 });
    expect(tags(wrapper)).toEqual(['h4', 'h4', 'h4']);
  });

  it('leaves the position stamps and the marking attributes untouched', () => {
    const plain = mountDoc(headings);
    const floored = mountDoc(headings, { minHeadingLevel: 3 });

    // Only the tag name moves: `data-eldra-pos`/`data-eldra-node` are the *document's* numbering,
    // which native editing, selection reporting and `restampRichTextPositions` all read.
    const stamps = (wrapper: ReturnType<typeof mountDoc>) =>
      [...wrapper.get('[data-eldra-rich-text]').element.children].map((el) => [
        el.getAttribute('data-eldra-node'),
        el.getAttribute('data-eldra-pos'),
      ]);
    expect(stamps(floored)).toEqual(stamps(plain));

    const root = floored.get('[data-eldra-rich-text]').element;
    expect(root.getAttribute('data-eldra-field')).toBe('body');
    expect(root.getAttribute('data-eldra-entry')).toBe('entry-1');
  });

  it('renders no h0/h7 for an out-of-range floor, and keeps the document text', () => {
    for (const minHeadingLevel of [0, -1, 9, 2.5]) {
      const rendered = tags(mountDoc(headings, { minHeadingLevel }));
      for (const tag of rendered) expect(tag).toMatch(/^h[1-6]$/);
      expect(mountDoc(headings, { minHeadingLevel }).text()).toContain('One');
    }
  });
});
