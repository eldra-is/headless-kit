import { flushPromises, mount } from '@vue/test-utils';
import { createOverlayRuntime } from '@eldrajs/theme-core/overlay';
import {
  encodeStega,
  layoutNodeClass,
  type ReusableComponentProjection,
} from '@eldrajs/theme-core';
import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY, type EldraContext } from '../context';
import { EldraLayout } from '../EldraLayout';

const heroId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

const hero = { id: heroId, schemaApiId: 'hero', data: { heading: 'First' } };
const second = { id: secondId, schema: { apiId: 'hero' }, data: { heading: 'Second' } };

function responsiveLayout() {
  return {
    version: 1,
    root: {
      id: 'RootGrid',
      type: 'grid',
      layout: {
        columns: { normal: 2, mobile: 1 },
        columnGap: { normal: '2rem', tablet: '1rem' },
        rowGap: { normal: '16px' },
        alignItems: { normal: 'stretch' },
      },
      style: {
        padding: {
          normal: { top: '2rem', right: '2rem', bottom: '2rem', left: '2rem' },
          tablet: { top: '1rem' },
        },
      },
      children: [
        {
          id: 'NestedFlex',
          type: 'flex',
          layout: {
            direction: { normal: 'row', mobile: 'column' },
            wrap: { normal: 'wrap' },
            gap: { normal: '8px' },
            justify: { normal: 'space-between' },
            align: { normal: 'center' },
          },
          children: [
            { id: 'HeroPlacementA', type: 'block', entryId: heroId },
            {
              id: 'SecondPlacement',
              type: 'block',
              entryId: secondId,
              style: { visible: { normal: true, tablet: false, mobile: true } },
            },
          ],
        },
        { id: 'HeroPlacementB', type: 'block', entryId: heroId },
      ],
    },
  };
}

describe('EldraLayout', () => {
  it('renders reactive entry-backed templates across sample changes without changing shared data', async () => {
    const shared = reactive({
      ...hero,
      data: { heading: 'Shared heading', byline: 'Shared byline' },
    });
    const wrapper = mount(EldraLayout, {
      props: {
        layout: {
          version: 1,
          root: {
            id: 'TemplateRoot',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [
              {
                id: 'TemplateHero',
                type: 'template-block',
                apiId: 'hero',
                entryId: heroId,
                templates: { heading: 'Explore {{ title }}' },
              },
            ],
          },
        },
        blocks: [shared],
        templateEntry: reactive({ id: 'guide-1', data: { title: 'Northern Lights' } }),
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    expect(wrapper.get('h1').text()).toBe('Explore Northern Lights');

    await wrapper.setProps({
      templateEntry: reactive({ id: 'guide-2', data: { title: 'Volcanic Coast' } }),
    });
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Explore Volcanic Coast');
    expect(shared.data).toEqual({ heading: 'Shared heading', byline: 'Shared byline' });
    wrapper.unmount();
  });

  it('renders template placements with resolved-entry stega identity and stable placement identity', async () => {
    const heading = encodeStega('Dynamic heading', {
      entryId: 'article-1',
      fieldPath: 'title',
      locale: 'en-US',
    });
    const wrapper = mount(EldraLayout, {
      props: {
        layout: {
          version: 1,
          root: {
            id: 'TemplateRoot',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [
              {
                id: 'TemplateHero',
                type: 'template-block',
                apiId: 'hero',
                bindings: { heading: 'title', byline: 'author.name' },
              },
            ],
          },
        },
        blocks: [],
        templateEntry: {
          id: 'article-1',
          data: { title: heading, author: { data: { name: 'Ada' } } },
        },
      },
    });
    await flushPromises();

    const block = wrapper.get('[data-eldra-template-block="TemplateHero"]');
    expect(block.attributes('data-eldra-block')).toBe('article-1');
    expect(block.attributes('data-eldra-schema')).toBe('hero');
    expect(block.get('h1').element.textContent).toBe(heading);
  });

  it('fails an invalid template layout closed before mounting any block', async () => {
    const wrapper = mount(EldraLayout, {
      props: {
        layout: {
          version: 1,
          root: {
            id: 'TemplateRoot',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [{ id: 'Bad', type: 'template-block', apiId: 'missing' }],
          },
        },
        blocks: [],
        templateEntry: { id: 'article-1', data: { title: 'Title' } },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(true);
    expect(wrapper.find('[data-eldra-template-block]').exists()).toBe(false);
  });

  it('resolves a template-block binding keyed by a renamed field through the manifest catalog', async () => {
    // The mock manifest's `hero` block declares `migrations: [{ version: 2,
    // renames: [{ from: 'title', to: 'heading' }] }]`. This route template
    // node is still keyed by the pre-migration `title` name, the way an
    // un-migrated stored template would be — buildTemplateBlockCatalog must
    // carry that rename into the catalog it hands theme-core so the block
    // keeps rendering instead of failing closed.
    const wrapper = mount(EldraLayout, {
      props: {
        layout: {
          version: 1,
          root: {
            id: 'TemplateRoot',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [
              {
                id: 'TemplateHero',
                type: 'template-block',
                apiId: 'hero',
                bindings: { title: 'title' },
              },
            ],
          },
        },
        blocks: [],
        templateEntry: { id: 'article-1', data: { title: 'Renamed-field heading' } },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    expect(wrapper.get('h1').text()).toBe('Renamed-field heading');
  });

  it('renders repeated reusable placements with distinct DOM identity and shared selection identity', async () => {
    const siteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const componentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const layout = {
      version: 2,
      root: {
        id: 'PageRoot',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'SharedA', type: 'reusable', componentId },
          { id: 'SharedB', type: 'reusable', componentId },
        ],
      },
    };
    const reusableComponentProjection: ReusableComponentProjection = {
      bindings: ['SharedA', 'SharedB'].map((placementId) => ({
        placementId,
        componentId,
        siteId,
        revision: 3,
      })),
      revisions: [
        {
          componentId,
          siteId,
          revision: 3,
          document: {
            version: 1,
            root: {
              id: 'SharedRoot',
              type: 'flex',
              layout: { direction: { normal: 'column' } },
              children: [{ id: 'SharedHero', type: 'block', entryId: heroId }],
            },
          },
        },
      ],
    };
    const wrapper = mount(EldraLayout, {
      props: { layout, blocks: [hero], reusableComponentProjection },
    });
    await flushPromises();

    const shared = wrapper.findAll('[data-eldra-layout-node="SharedHero"]');
    expect(shared).toHaveLength(2);
    expect(shared.map((node) => node.attributes('data-eldra-reusable-placement'))).toEqual([
      'SharedA',
      'SharedB',
    ]);
    expect(shared[0]!.classes()).not.toEqual(shared[1]!.classes());
    expect(shared.map((node) => node.get('h1').text())).toEqual(['First', 'First']);
    expect(wrapper.html()).not.toContain(componentId);

    await wrapper.setProps({
      blocks: [{ ...hero, data: { heading: 'Updated shared draft' } }],
    });
    await flushPromises();
    expect(
      wrapper.findAll('[data-eldra-layout-node="SharedHero"] h1').map((node) => node.text())
    ).toEqual(['Updated shared draft', 'Updated shared draft']);
  });

  it('fails a foreign reusable projection closed before mounting blocks', async () => {
    const componentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const wrapper = mount(EldraLayout, {
      props: {
        layout: {
          version: 2,
          root: {
            id: 'PageRoot',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [{ id: 'SharedA', type: 'reusable', componentId }],
          },
        },
        blocks: [hero],
        reusableComponentProjection: {
          bindings: [
            {
              placementId: 'SharedA',
              componentId,
              siteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              revision: 1,
            },
          ],
          revisions: [
            {
              componentId,
              siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              revision: 1,
              document: {
                version: 1,
                root: {
                  id: 'SharedRoot',
                  type: 'flex',
                  layout: { direction: { normal: 'column' } },
                  children: [{ id: 'SharedHero', type: 'block', entryId: heroId }],
                },
              },
            },
          ],
        },
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(true);
    expect(wrapper.find('[data-eldra-block]').exists()).toBe(false);
  });

  it('renders a version 2 page after every reusable placement is detached', async () => {
    const wrapper = mount(EldraLayout, {
      props: {
        layout: {
          version: 2,
          root: {
            id: 'PageRoot',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [{ id: 'DetachedHero', type: 'block', entryId: heroId }],
          },
        },
        blocks: [hero],
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    expect(wrapper.get('[data-eldra-layout-node="DetachedHero"] h1').text()).toBe('First');
  });

  it('renders nested containers and repeated block placements in tree order', async () => {
    const wrapper = mount(EldraLayout, {
      props: { layout: responsiveLayout(), blocks: [hero, second] },
    });
    await flushPromises();

    const root = wrapper.get('[data-eldra-layout-node="RootGrid"]');
    expect(root.attributes('data-eldra-layout-container')).toBe('grid');
    expect(root.classes()).toContain(layoutNodeClass('RootGrid'));
    expect(
      root.get('[data-eldra-layout-node="NestedFlex"]').attributes('data-eldra-layout-container')
    ).toBe('flex');

    const blocks = wrapper.findAll('[data-eldra-block]');
    expect(blocks.map((block) => block.attributes('data-eldra-layout-node'))).toEqual([
      'HeroPlacementA',
      'SecondPlacement',
      'HeroPlacementB',
    ]);
    expect(blocks.map((block) => block.attributes('data-eldra-block'))).toEqual([
      heroId,
      secondId,
      heroId,
    ]);
    expect(blocks.map((block) => block.attributes('data-eldra-schema'))).toEqual([
      'hero',
      'hero',
      'hero',
    ]);
    expect(blocks.map((block) => block.get('h1').text())).toEqual(['First', 'Second', 'First']);
  });

  it('delivers only shared scoped CSS and supports a CSP nonce', async () => {
    const wrapper = mount(EldraLayout, {
      props: { layout: responsiveLayout(), blocks: [hero, second], nonce: 'request-nonce' },
    });
    await flushPromises();

    const stylesheet = wrapper.get('style[data-eldra-layout-styles]');
    expect(stylesheet.attributes('nonce')).toBe('request-nonce');
    expect(stylesheet.text()).toContain(`.${layoutNodeClass('RootGrid')}`);
    expect(stylesheet.text()).toContain('@media');
    expect(stylesheet.text()).toContain('display:none');
    expect(wrapper.findAll('[style]')).toHaveLength(0);
  });

  it('keeps breakpoint-hidden nodes in deterministic DOM order', async () => {
    const wrapper = mount(EldraLayout, {
      props: { layout: responsiveLayout(), blocks: [hero, second] },
    });
    await flushPromises();

    wrapper.get('[data-eldra-layout-node="SecondPlacement"]');
    expect(wrapper.get('style[data-eldra-layout-styles]').text()).toContain(
      `.${layoutNodeClass('SecondPlacement')}`
    );
  });

  it('preserves placement identity through content replacement and tree reordering', async () => {
    const layout = responsiveLayout();
    const wrapper = mount(EldraLayout, { props: { layout, blocks: [hero, second] } });
    await flushPromises();
    const originalPlacement = wrapper.get('[data-eldra-layout-node="HeroPlacementA"]').element;

    await wrapper.setProps({
      blocks: [{ ...hero, data: { heading: 'Updated' } }, second],
    });
    await flushPromises();
    expect(wrapper.get('[data-eldra-layout-node="HeroPlacementA"] h1').text()).toBe('Updated');
    expect(wrapper.get('[data-eldra-layout-node="HeroPlacementA"]').element).toBe(
      originalPlacement
    );

    const reordered = structuredClone(layout);
    reordered.root.children.reverse();
    await wrapper.setProps({ layout: reordered });
    await flushPromises();
    expect(
      wrapper
        .findAll('[data-eldra-block]')
        .map((block) => block.attributes('data-eldra-layout-node'))
    ).toEqual(['HeroPlacementB', 'HeroPlacementA', 'SecondPlacement']);
    expect(wrapper.get('[data-eldra-layout-node="HeroPlacementA"]').element).toBe(
      originalPlacement
    );
  });

  it('passes stega-owned entry data through without decoding or re-encoding it', async () => {
    const heading = encodeStega('Editable', {
      entryId: heroId,
      fieldPath: 'heading',
      locale: 'en-US',
    });
    const wrapper = mount(EldraLayout, {
      props: {
        layout: responsiveLayout(),
        blocks: [{ ...hero, data: { heading } }, second],
      },
    });
    await flushPromises();

    expect(wrapper.get('[data-eldra-layout-node="HeroPlacementA"] h1').element.textContent).toBe(
      heading
    );
    expect(wrapper.get('[data-eldra-layout-node="HeroPlacementB"] h1').element.textContent).toBe(
      heading
    );
  });

  it('keeps an already decorated mounted block reactive to a draft replacement', async () => {
    const initial = encodeStega('Editable', {
      entryId: heroId,
      fieldPath: 'heading',
      locale: 'en-US',
    });
    const updated = encodeStega('Updated draft', {
      entryId: heroId,
      fieldPath: 'heading',
      locale: 'en-US',
    });
    const wrapper = mount(EldraLayout, {
      attachTo: document.body,
      props: {
        layout: responsiveLayout(),
        blocks: [{ ...hero, data: { heading: initial } }, second],
      },
    });
    await flushPromises();
    const runtime = createOverlayRuntime({ root: wrapper.element, post: () => undefined });
    runtime.setMode('edit');
    runtime.start();

    const heading = wrapper.get<HTMLElement>('[data-eldra-layout-node="HeroPlacementA"] h1');
    expect(heading.text()).toBe('Editable');
    heading.element.focus();
    heading.element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    runtime.acceptExternalUpdate([heroId]);
    await wrapper.setProps({
      blocks: [{ ...hero, data: { heading: updated } }, second],
    });
    await flushPromises();
    await Promise.resolve();

    expect(heading.text()).toBe('Updated draft');
    expect(heading.attributes('data-eldra-field')).toBe('heading');
    runtime.stop();
    wrapper.unmount();
  });

  it('renders an accepted context draft when an already mounted block prop is stale', async () => {
    const context = {
      designTokens: reactive({ colors: {}, containers: {} }),
      preview: reactive({
        active: true,
        mode: 'edit',
        locale: 'en-US',
        sourceDrafts: {},
        drafts: {} as Record<string, Record<string, unknown>>,
        draftSchemaApiIds: {},
        refreshRevision: 0,
        revision: 0,
        designTokensRevision: 0,
      }),
    } as unknown as EldraContext;
    const wrapper = mount(EldraLayout, {
      props: { layout: responsiveLayout(), blocks: [hero, second] },
      global: { provide: { [ELDRA_KEY as symbol]: context } },
    });
    await flushPromises();
    expect(wrapper.get('[data-eldra-layout-node="HeroPlacementA"] h1').text()).toBe('First');

    context.preview.drafts[heroId] = { heading: 'Accepted context draft' };
    context.preview.revision += 1;
    await flushPromises();

    expect(
      wrapper
        .findAll('[data-eldra-block="11111111-1111-4111-8111-111111111111"] h1')
        .map((node) => node.text())
    ).toEqual(['Accepted context draft', 'Accepted context draft']);
  });

  it('keeps a reusable block reactive when it is attached after the overlay starts', async () => {
    const componentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const siteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const initial = encodeStega('Shared baseline', {
      entryId: secondId,
      fieldPath: 'heading',
      locale: 'en-US',
    });
    const updated = encodeStega('Shared accepted draft', {
      entryId: secondId,
      fieldPath: 'heading',
      locale: 'en-US',
    });
    const reusableLayout = {
      version: 2,
      root: {
        id: 'PageRoot',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'SharedA', type: 'reusable', componentId },
          { id: 'SharedB', type: 'reusable', componentId },
        ],
      },
    };
    const reusableComponentProjection: ReusableComponentProjection = {
      bindings: ['SharedA', 'SharedB'].map((placementId) => ({
        placementId,
        componentId,
        siteId,
        revision: 1,
      })),
      revisions: [
        {
          componentId,
          siteId,
          revision: 1,
          document: {
            version: 1,
            root: {
              id: 'SharedRoot',
              type: 'flex',
              layout: { direction: { normal: 'column' } },
              children: [{ id: 'SharedHero', type: 'block', entryId: secondId }],
            },
          },
        },
      ],
    };
    const wrapper = mount(EldraLayout, {
      attachTo: document.body,
      props: { layout: responsiveLayout(), blocks: [hero, second] },
    });
    await flushPromises();
    const runtime = createOverlayRuntime({ root: wrapper.element, post: () => undefined });
    runtime.setMode('edit');
    runtime.start();

    await wrapper.setProps({
      layout: reusableLayout,
      blocks: [{ ...second, data: { heading: initial } }],
      reusableComponentProjection,
    });
    await flushPromises();
    await Promise.resolve();
    expect(
      wrapper.findAll('[data-eldra-layout-node="SharedHero"] h1').map((node) => node.text())
    ).toEqual(['Shared baseline', 'Shared baseline']);

    await wrapper.setProps({
      blocks: [{ ...second, data: { heading: updated } }],
    });
    await flushPromises();
    await Promise.resolve();
    expect(
      wrapper.findAll('[data-eldra-layout-node="SharedHero"] h1').map((node) => node.text())
    ).toEqual(['Shared accepted draft', 'Shared accepted draft']);
    runtime.stop();
    wrapper.unmount();
  });

  it('fails the whole document closed when a block reference cannot be resolved', async () => {
    const wrapper = mount(EldraLayout, {
      props: { layout: responsiveLayout(), blocks: [hero] },
    });
    await flushPromises();

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(true);
    expect(wrapper.find('[data-eldra-layout-node]').exists()).toBe(false);
    expect(wrapper.find('style').exists()).toBe(false);
  });

  it('fails unsafe values closed without emitting attacker-controlled CSS or HTML', () => {
    const layout = responsiveLayout();
    layout.root.style.padding.normal.top =
      '1px;background:url(https://bad.invalid)' as `${number}px`;
    const wrapper = mount(EldraLayout, { props: { layout, blocks: [hero, second] } });

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(true);
    expect(wrapper.html()).not.toContain('bad.invalid');
    expect(wrapper.find('style').exists()).toBe(false);
  });

  it('fails a valid reference with no matching theme component closed at that leaf', async () => {
    const unknown = { ...second, schemaApiId: 'missing-component', schema: undefined };
    const wrapper = mount(EldraLayout, {
      props: { layout: responsiveLayout(), blocks: [hero, unknown] },
    });
    await flushPromises();

    const marker = wrapper.get('[data-eldra-layout-node="SecondPlacement"]');
    expect(marker.attributes('hidden')).toBe('');
    expect(marker.attributes('data-eldra-missing-block')).toBe('missing-component');
    expect(marker.attributes('style')).toBeUndefined();
    expect(marker.find('[data-eldra-block]').exists()).toBe(false);
    expect(wrapper.findAll('[data-eldra-block]')).toHaveLength(2);
  });
});
