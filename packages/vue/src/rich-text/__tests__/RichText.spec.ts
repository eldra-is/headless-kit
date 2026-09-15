import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { defineComponent, markRaw } from 'vue';
import RichText from '../RichText.vue';
import type { RichTextDocument } from '../types';

const defaultContent: RichTextDocument = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Renderer heading' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'world' },
        { type: 'text', text: ' and ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'friends' },
        { type: 'text', text: '.' },
      ],
    },
  ],
};

const tableContent: RichTextDocument = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }],
            },
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Role' }] }],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ada' }] }],
            },
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Engineer' }] }],
            },
          ],
        },
      ],
    },
  ],
};

const imageAndEmbedContent: RichTextDocument = {
  type: 'doc',
  content: [
    {
      type: 'image',
      attrs: { src: 'https://example.com/image.jpg', alt: 'Example image', assetId: 'asset-123' },
    },
    {
      type: 'embed',
      attrs: {
        provider: 'vimeo',
        render: 'iframe',
        src: 'https://player.vimeo.com/video/76979871',
        width: 640,
        height: 360,
        title: 'Vimeo video',
        allow: 'autoplay; fullscreen; picture-in-picture',
      },
    },
  ],
};

const embed = (attrs: Record<string, unknown>): RichTextDocument => ({
  type: 'doc',
  content: [{ type: 'embed', attrs }],
});

const scriptEmbedContent: RichTextDocument = {
  type: 'doc',
  content: [
    {
      type: 'embed',
      attrs: {
        provider: 'x',
        render: 'script',
        src: 'https://x.com/Interior/status/463440424141459456',
        width: 550,
        height: 400,
        title: 'X post',
        variant: 'post',
      },
    },
    {
      type: 'embed',
      attrs: {
        provider: 'pinterest',
        render: 'script',
        src: 'https://www.pinterest.com/pin/99360735500167749/',
        width: 400,
        height: 480,
        title: 'Pinterest embed',
        variant: 'pin',
      },
    },
  ],
};

const unknownNodeContent: RichTextDocument = {
  type: 'doc',
  content: [
    {
      type: 'productEmbed',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Unknown node child content' }] },
      ],
    },
  ],
};

function mountRichText(
  props: Partial<InstanceType<typeof RichText>['$props']> = {},
  options: Omit<NonNullable<Parameters<typeof mount>[1]>, 'props'> = {}
) {
  return mount(RichText, {
    props: { as: 'article', content: defaultContent, ...props },
    ...options,
  });
}

describe('RichText', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders default nodes and nested marks', () => {
      const wrapper = mountRichText();

      expect(wrapper.find('article.rich-text').exists()).toBe(true);
      expect(wrapper.find('h2').text()).toBe('Renderer heading');
      expect(wrapper.find('p').text()).toContain('Hello world and friends.');
      expect(wrapper.find('strong').text()).toBe('world');
      expect(wrapper.find('em').text()).toBe('friends');

      wrapper.unmount();
    });

    it('renders explicit class overrides for nodes and marks', () => {
      const wrapper = mountRichText({
        nodes: { paragraph: { class: 'story-paragraph' } },
        marks: { bold: { class: 'story-bold' } },
      });

      expect(wrapper.find('p.story-paragraph').exists()).toBe(true);
      expect(wrapper.find('strong.story-bold').exists()).toBe(true);

      wrapper.unmount();
    });

    it('renders explicit style overrides for nodes and marks', () => {
      const wrapper = mountRichText({
        nodes: { paragraph: { style: { color: 'rgb(71, 85, 105)' } } },
        marks: { bold: { style: { color: 'rgb(180, 83, 9)' } } },
      });

      expect(wrapper.find('p').attributes('style')).toContain('color: rgb(71, 85, 105);');
      expect(wrapper.find('strong').attributes('style')).toContain('color: rgb(180, 83, 9);');

      wrapper.unmount();
    });

    it('renders string tag overrides', () => {
      const wrapper = mountRichText({ nodes: { paragraph: 'div' }, marks: { bold: 'b' } });

      expect(wrapper.find('div').text()).toContain('Hello world and friends.');
      expect(wrapper.find('b').text()).toBe('world');

      wrapper.unmount();
    });

    it('renders component overrides and passes node props', () => {
      const HeadingOverride = markRaw(
        defineComponent({
          props: {
            node: { type: Object, required: true },
            attrs: { type: Object, required: true },
          },
          template:
            '<h3 :data-level="attrs.level" :data-text="node.content?.[0]?.text"><slot /></h3>',
        })
      );

      const wrapper = mountRichText({ nodes: { heading: HeadingOverride } });

      const heading = wrapper.find('h3');
      expect(heading.attributes('data-level')).toBe('2');
      expect(heading.attributes('data-text')).toBe('Renderer heading');
      expect(heading.text()).toBe('Renderer heading');

      wrapper.unmount();
    });

    it('renders children only when node or mark override is null', () => {
      const wrapper = mountRichText({ nodes: { paragraph: null }, marks: { bold: null } });

      expect(wrapper.find('p').exists()).toBe(false);
      expect(wrapper.find('strong').exists()).toBe(false);
      expect(wrapper.text()).toContain('Hello world and friends.');

      wrapper.unmount();
    });

    it('does not call the host reveal directive by default', () => {
      const revealBeforeMount = vi.fn();

      const wrapper = mountRichText(
        {},
        { global: { directives: { reveal: { beforeMount: revealBeforeMount } } } }
      );

      expect(revealBeforeMount).not.toHaveBeenCalled();

      wrapper.unmount();
    });

    it('passes scrollTransitions to the host reveal directive for rendered blocks', () => {
      const revealBeforeMount = vi.fn();
      const revealMounted = vi.fn();
      const scrollTransitions = { preset: 'text', stagger: 0.04 };

      const wrapper = mountRichText(
        { scrollTransitions },
        {
          global: {
            directives: { reveal: { beforeMount: revealBeforeMount, mounted: revealMounted } },
          },
        }
      );

      expect(revealBeforeMount).toHaveBeenCalledTimes(2);
      expect(revealMounted).toHaveBeenCalledTimes(2);
      expect(revealBeforeMount.mock.calls.map(([element]) => element.tagName)).toEqual(['H2', 'P']);
      expect(revealBeforeMount.mock.calls.map(([, binding]) => binding.value)).toEqual([
        scrollTransitions,
        scrollTransitions,
      ]);

      wrapper.unmount();
    });

    it('renders without a reveal directive registered at all', () => {
      const wrapper = mountRichText({ scrollTransitions: 'text' });

      expect(wrapper.find('h2').text()).toBe('Renderer heading');

      wrapper.unmount();
    });

    it('renders image and embed default nodes', () => {
      const wrapper = mountRichText({ content: imageAndEmbedContent });

      const image = wrapper.find('img');
      const iframe = wrapper.find('div[data-embed] iframe');

      expect(image.attributes('src')).toBe('https://example.com/image.jpg');
      expect(image.attributes('data-asset-id')).toBe('asset-123');
      expect(iframe.attributes('src')).toContain('player.vimeo.com/video/76979871');

      wrapper.unmount();
    });

    it('uses posted iframe height from a trusted origin when available', async () => {
      const wrapper = mountRichText({
        content: embed({
          provider: 'reddit',
          render: 'iframe',
          src: 'https://embed.reddit.com/r/vuejs/comments/16tqlth/updating_api_user_setting_fields/',
          width: 640,
          height: 420,
          title: 'Reddit embed',
          variant: 'thread',
        }),
      });

      const container = wrapper.find('div[data-embed]');
      const iframe = wrapper.find('div[data-embed] iframe');
      const sourceWindow = {};

      Object.defineProperty(iframe.element, 'contentWindow', {
        configurable: true,
        value: sourceWindow,
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://embed.reddit.com',
          source: sourceWindow as MessageEventSource,
          data: JSON.stringify({ data: 612 }),
        })
      );

      await wrapper.vm.$nextTick();

      expect(container.attributes('style')).toContain('height: 612px;');

      wrapper.unmount();
    });

    it('ignores a posted height from an untrusted origin', async () => {
      const wrapper = mountRichText({
        content: embed({
          provider: 'reddit',
          render: 'iframe',
          src: 'https://embed.reddit.com/r/x',
          width: 640,
          height: 420,
        }),
      });

      const iframe = wrapper.find('div[data-embed] iframe');
      const sourceWindow = {};
      Object.defineProperty(iframe.element, 'contentWindow', {
        configurable: true,
        value: sourceWindow,
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example',
          source: sourceWindow as MessageEventSource,
          data: JSON.stringify({ data: 9000 }),
        })
      );
      await wrapper.vm.$nextTick();

      expect(wrapper.find('div[data-embed]').attributes('style')).toContain('height: 420px;');

      wrapper.unmount();
    });

    it('respects custom spotify widths and fixed embed heights', () => {
      const wrapper = mountRichText({
        content: embed({
          provider: 'spotify',
          render: 'iframe',
          src: 'https://open.spotify.com/embed/track/7yNK27ZTpHew0c55VvIJgm?utm_source=generator',
          width: 250,
          height: 352,
          title: 'Spotify player',
          variant: 'track',
        }),
      });

      const container = wrapper.find('div[data-embed]');
      const iframe = wrapper.find('div[data-embed] iframe');

      expect(container.attributes('style')).toContain('width: 250px;');
      expect(container.attributes('style')).toContain('height: 352px;');
      expect(iframe.attributes('style')).toContain('height: 352px;');
      expect(iframe.attributes('width')).toBe('250');

      wrapper.unmount();
    });

    it('renders provider-owned script embeds', () => {
      const wrapper = mountRichText({ content: scriptEmbedContent });

      expect(wrapper.find('blockquote.twitter-tweet').exists()).toBe(true);
      expect(wrapper.find('a[data-pin-do="embedPin"]').exists()).toBe(true);

      wrapper.unmount();
    });

    it('falls back gracefully for unknown nodes and warns in dev', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const wrapper = mountRichText({ content: unknownNodeContent });

      expect(wrapper.text()).toContain('Unknown node child content');
      expect(warnSpy).toHaveBeenCalledWith(
        '[RichText] No renderer registered for "productEmbed". Children will be rendered without a wrapper.'
      );

      wrapper.unmount();
    });

    it('renders semantic table sections with header rows in thead', () => {
      const wrapper = mountRichText({ content: tableContent });

      const thead = wrapper.find('thead');
      const tbody = wrapper.find('tbody');

      expect(thead.exists()).toBe(true);
      expect(thead.findAll('th')).toHaveLength(2);
      expect(tbody.exists()).toBe(true);
      expect(tbody.findAll('td')).toHaveLength(2);

      wrapper.unmount();
    });
  });

  describe('safety', () => {
    const paragraphWithLink = (href: string): RichTextDocument => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }],
        },
      ],
    });

    it('drops a javascript: href from a stored link', () => {
      const wrapper = mountRichText({ content: paragraphWithLink('javascript:alert(1)') });

      const link = wrapper.find('a');
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toBeUndefined();

      wrapper.unmount();
    });

    it('keeps an https href and adds noopener', () => {
      const wrapper = mountRichText({ content: paragraphWithLink('https://tiptap.dev') });

      expect(wrapper.find('a').attributes('href')).toBe('https://tiptap.dev');
      expect(wrapper.find('a').attributes('rel')).toBe('noopener noreferrer');

      wrapper.unmount();
    });

    it('renders no image for a javascript: src', () => {
      const wrapper = mountRichText({
        content: {
          type: 'doc',
          content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }],
        },
      });

      expect(wrapper.find('img').exists()).toBe(false);

      wrapper.unmount();
    });

    it('renders nothing for an embed whose source is not a known host', () => {
      const wrapper = mountRichText({
        content: embed({
          provider: 'youtube',
          render: 'iframe',
          src: 'https://evil.example/embed',
          width: 640,
          height: 360,
        }),
      });

      expect(wrapper.find('[data-embed]').exists()).toBe(false);
      expect(wrapper.find('iframe').exists()).toBe(false);

      wrapper.unmount();
    });
  });

  describe('accessibility', () => {
    it('has no axe violations with default content (WCAG 2.2 AA)', async () => {
      const wrapper = mountRichText({}, { attachTo: document.body });

      expect(await axe(wrapper.element)).toHaveNoViolations();

      wrapper.unmount();
    });
  });
});
