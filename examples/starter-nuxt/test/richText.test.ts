// @vitest-environment jsdom
//
// `blocks/article/Block.vue` imports `EldraRichText` from `@eldra/theme-vue`,
// whose single index entry also re-exports `EldraBlockZone`, which pulls in
// a `virtual:eldra/blocks` module supplied only by the Nuxt build's vite
// plugin (see test/framing.test.ts and test/slugPage.test.ts for the same
// underlying issue). Mounting the block directly outside that build needs
// the package mocked; re-export the real `EldraRichText` component straight
// from its source file (its own dependency chain never touches the virtual
// module) so the assertions below still exercise the genuine read-mode
// renderer, not a stub.
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ELDRA_KEY, createEldraPreviewState } from '../../../packages/theme-vue/src/context';
import { registerBlockFields } from '@eldra/theme-core';
import blockManifest from '../blocks/article/block.json';

vi.mock('@eldra/theme-vue', async () => {
  const { EldraRichText } = await import('../../../packages/theme-vue/src/EldraRichText');
  return { EldraRichText };
});

const { default: Article } = await import('../blocks/article/Block.vue');

const body = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Plain, ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' copy.' },
      ],
    },
  ],
};

/**
 * The block's own `block.json`, exactly as `virtual:eldra/block-fields` would
 * project it at build time — so `body`'s `localized: true` is the manifest's,
 * not the test's invention.
 */
function registerArticleFields(): void {
  registerBlockFields({
    article: blockManifest.fields.map((field) => ({
      fieldId: field.fieldId,
      type: field.type,
      ...(field.localized === true ? { localized: true } : {}),
      ...(field.metadata === undefined ? {} : { metadata: field.metadata }),
    })),
  });
}

/** A preview bridge attached with an active content locale. */
function previewContext(locale: string | null): unknown {
  return {
    client: {},
    designTokens: reactive({ colors: {}, containers: {} }),
    preview: Object.assign(createEldraPreviewState(), { active: true, locale }),
  };
}

function mountArticle(context?: unknown) {
  return mount(Article, {
    props: {
      entry: {
        id: 'article-1',
        data: { title: 'Announcing our new platform', author: 'Jane Doe', body },
      },
    },
    ...(context === undefined ? {} : { global: { provide: { [ELDRA_KEY as symbol]: context } } }),
  });
}

afterEach(() => {
  registerBlockFields({});
});

describe('article body renders through EldraRichText', () => {
  it('renders the doc as real markup and marks the read-mode root', () => {
    const wrapper = mountArticle();

    const root = wrapper.get('[data-eldra-rich-text]');
    expect(root.attributes('data-eldra-field')).toBe('body');
    expect(root.attributes('data-eldra-entry')).toBe('article-1');

    const paragraph = wrapper.get('p');
    expect(paragraph.text()).toBe('Plain, bold copy.');
    expect(wrapper.get('strong').text()).toBe('bold');
  });

  it("stamps the body's node elements with their document positions", () => {
    // §18 v3: the operator edits this render natively, so every node element
    // carries the ProseMirror position the theme reports selections and text
    // ops in. Mark elements are not nodes and carry nothing.
    const wrapper = mountArticle();

    const paragraph = wrapper.get('p');
    expect(paragraph.attributes('data-eldra-node')).toBe('paragraph');
    expect(paragraph.attributes('data-eldra-pos')).toBe('0');
    expect(wrapper.get('strong').attributes('data-eldra-pos')).toBeUndefined();
  });

  it('marks the root with the active content locale for the localized body field', () => {
    registerArticleFields();
    const wrapper = mountArticle(previewContext('is-IS'));

    expect(wrapper.get('[data-eldra-rich-text]').attributes('data-eldra-locale')).toBe('is-IS');
  });

  it('stays locale-less in static output, where no preview context is provided', () => {
    registerArticleFields();
    const wrapper = mountArticle();

    expect(wrapper.get('[data-eldra-rich-text]').attributes('data-eldra-locale')).toBeUndefined();
  });
});
