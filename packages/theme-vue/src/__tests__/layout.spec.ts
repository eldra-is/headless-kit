import { flushPromises, mount } from '@vue/test-utils';
import { createOverlayRuntime } from '@eldrajs/theme-core/overlay';
import {
  encodeStega,
  layoutNodeClass,
  layoutRenderNodeId,
  type ReusableComponentProjection,
  type ReusableComponentRevision,
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

  // A route template places reusable components exactly the way a page does:
  // Studio addresses the expanded nodes by the same placement id, so the
  // render must be byte-for-byte the page behaviour. Two things have to reach
  // theme-core for that — the projection itself, and the real block entry map
  // (the component's content is ordinary `block` nodes, which resolve through
  // it; an empty map renders every one of them as `data-eldra-missing-block`).
  it('renders a reusable placement inside a route template between its template blocks', async () => {
    const siteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const componentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const reusableComponentProjection: ReusableComponentProjection = {
      bindings: [{ placementId: 'SharedHeader', componentId, siteId, revision: 2 }],
      revisions: [
        {
          componentId,
          siteId,
          revision: 2,
          document: {
            version: 1,
            root: {
              id: 'ComponentRoot',
              type: 'flex',
              layout: { direction: { normal: 'column' } },
              children: [{ id: 'ComponentHero', type: 'block', entryId: heroId }],
            },
          },
        },
      ],
    };
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
                id: 'TemplateLead',
                type: 'template-block',
                apiId: 'hero',
                templates: { heading: 'Lead for {{ title }}' },
              },
              { id: 'SharedHeader', type: 'reusable', componentId },
              {
                id: 'TemplateBody',
                type: 'template-block',
                apiId: 'hero',
                bindings: { heading: 'title' },
              },
            ],
          },
        },
        blocks: [hero],
        templateEntry: { id: 'guide-1', data: { title: 'Northern Lights' } },
        reusableComponentProjection,
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    expect(wrapper.find('[data-eldra-missing-block]').exists()).toBe(false);
    const placed = wrapper.get('[data-eldra-layout-node="ComponentHero"]');
    expect(placed.attributes('data-eldra-reusable-placement')).toBe('SharedHeader');
    expect(placed.attributes('data-eldra-block')).toBe(heroId);
    expect(wrapper.html()).not.toContain(componentId);
    expect([...wrapper.element.querySelectorAll('h1')].map((node) => node.textContent)).toEqual([
      'Lead for Northern Lights',
      'First',
      'Northern Lights',
    ]);
  });

  it('fails a route-template reusable placement closed when no projection is passed', async () => {
    const componentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
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
                id: 'TemplateLead',
                type: 'template-block',
                apiId: 'hero',
                bindings: { heading: 'title' },
              },
              { id: 'SharedHeader', type: 'reusable', componentId },
            ],
          },
        },
        blocks: [hero],
        templateEntry: { id: 'guide-1', data: { title: 'Northern Lights' } },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(true);
    expect(wrapper.find('[data-eldra-template-block]').exists()).toBe(false);
  });

  // The public, non-preview route-template read is already expanded: Core has
  // replaced the placement with the component's own container of `block` nodes
  // (ids namespaced by the placement id) and stripped the projection entirely,
  // exactly as it does for a page. That shape has no projection to pass and no
  // placement identity to emit — it just has to render, through the same entry
  // map the preview shape's expanded blocks resolve through.
  it('renders a route template that arrived pre-expanded, with no projection', async () => {
    const expandedBlockId = layoutRenderNodeId('SharedHeader\u0000ComponentHero');
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
                id: 'SharedHeader',
                type: 'flex',
                layout: { direction: { normal: 'column' } },
                children: [{ id: expandedBlockId, type: 'block', entryId: heroId }],
              },
              {
                id: 'TemplateBody',
                type: 'template-block',
                apiId: 'hero',
                bindings: { heading: 'title' },
              },
            ],
          },
        },
        blocks: [hero],
        templateEntry: { id: 'guide-1', data: { title: 'Northern Lights' } },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    expect(wrapper.find('[data-eldra-missing-block]').exists()).toBe(false);
    const placed = wrapper.get(`[data-eldra-layout-node="${expandedBlockId}"]`);
    expect(placed.attributes('data-eldra-block')).toBe(heroId);
    // A public read carries no placement identity — same as a public page.
    expect(placed.attributes('data-eldra-reusable-placement')).toBeUndefined();
    expect(placed.get('h1').text()).toBe('First');
    expect([...wrapper.element.querySelectorAll('h1')].map((node) => node.textContent)).toEqual([
      'First',
      'Northern Lights',
    ]);
  });

  // The expansion refuses a projection carrying a binding the document does not
  // consume (COMPONENT_STALE), and a template runs it unconditionally — so the
  // route-template branch must be handed the *template read's own* projection.
  // A page's, or a merged one, takes this branch down.
  it('fails a route template closed when its projection carries a binding it does not place', async () => {
    const siteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const componentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const revision: ReusableComponentRevision = {
      componentId,
      siteId,
      revision: 2,
      document: {
        version: 1,
        root: {
          id: 'ComponentRoot',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          children: [{ id: 'ComponentHero', type: 'block', entryId: heroId }],
        },
      },
    };
    const props = {
      layout: {
        version: 1,
        root: {
          id: 'TemplateRoot',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          children: [{ id: 'SharedHeader', type: 'reusable', componentId }],
        },
      },
      blocks: [hero],
      templateEntry: { id: 'guide-1', data: { title: 'Northern Lights' } },
    };
    const own: ReusableComponentProjection = {
      bindings: [{ placementId: 'SharedHeader', componentId, siteId, revision: 2 }],
      revisions: [revision],
    };
    const foreign: ReusableComponentProjection = {
      bindings: [
        ...own.bindings,
        // A placement that lives on some *page*, not in this template.
        { placementId: 'PageOnlyFooter', componentId, siteId, revision: 2 },
      ],
      revisions: [revision],
    };

    const stale = mount(EldraLayout, { props: { ...props, reusableComponentProjection: foreign } });
    await flushPromises();
    expect(stale.find('[data-eldra-invalid-layout]').exists()).toBe(true);
    expect(stale.find('[data-eldra-block]').exists()).toBe(false);

    const good = mount(EldraLayout, { props: { ...props, reusableComponentProjection: own } });
    await flushPromises();
    expect(good.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    expect(good.get('[data-eldra-layout-node="ComponentHero"]').get('h1').text()).toBe('First');
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

  it('marks a breakpoint-hidden node for the overlay and gates its display:none', async () => {
    const wrapper = mount(EldraLayout, {
      props: { layout: responsiveLayout(), blocks: [hero, second] },
    });
    await flushPromises();

    const hidden = wrapper.get('[data-eldra-layout-node="SecondPlacement"]');
    // `visible: { normal: true, tablet: false, mobile: true }` — tablet only:
    // mobile restates `true`, so it does not inherit the tablet hide.
    expect(hidden.attributes('data-eldra-hidden')).toBe('tablet');
    // Rendered, not omitted: a static render hides it with CSS, never by
    // dropping it, so the overlay has something to dim in edit mode.
    expect(hidden.attributes('data-eldra-edit-mode')).toBeUndefined();
    expect(
      wrapper.get('[data-eldra-layout-node="HeroPlacementA"]').attributes('data-eldra-hidden')
    ).toBeUndefined();

    const css = wrapper.get('style[data-eldra-layout-styles]').text();
    const cls = layoutNodeClass('SecondPlacement');
    expect(css).toContain(`.${cls}:not([data-eldra-edit-mode]){display:none;}`);
    expect(css).toContain(
      `.${cls}[data-eldra-edit-mode]:not([data-eldra-edit-mode] *){opacity:0.35;}`
    );
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
    // Let the field's own theme:text-edited debounce flush, then acknowledge
    // that post by echoing its value back, before the editor says anything
    // else: a draft is only authoritative for text the editor has been told
    // about *and has answered*, and keystrokes still waiting on that answer
    // outrank it on purpose (theme-core's "keeps every keystroke and the caret
    // when the editor echoes a draft one key behind").
    await new Promise((resolve) => setTimeout(resolve, 350));
    runtime.acceptExternalUpdate([heroId]);
    runtime.reconcileExternalDrafts({ [heroId]: { heading: initial } }, [heroId]);
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

  /**
   * The renderer's text patch for a field whose content is one text run is
   * `element.textContent = value`, which replaces the text node — and the
   * browser's undo stack for the contenteditable is bound to that node, so
   * replacing it is what cost the operator ⌘Z on every autosave. This drives
   * the whole real path: a mounted block, the overlay's decoration, a
   * keystroke, and three echoes of the draft that keystroke produced.
   */
  it('replaces no text node in the edited field across three echoes of the same text', async () => {
    const field = (value: string): string =>
      encodeStega(value, { entryId: heroId, fieldPath: 'heading', locale: 'en-US' });
    const wrapper = mount(EldraLayout, {
      attachTo: document.body,
      props: {
        layout: responsiveLayout(),
        blocks: [{ ...hero, data: { heading: field('Editable') } }, second],
      },
    });
    await flushPromises();
    const runtime = createOverlayRuntime({ root: wrapper.element, post: () => undefined });
    runtime.setMode('edit');
    runtime.start();

    const heading = wrapper.get<HTMLElement>(
      '[data-eldra-layout-node="HeroPlacementA"] h1'
    ).element;
    // Decorated: the payload is out of the DOM, so the renderer's own string
    // never equals the live text again.
    expect(heading.textContent).toBe('Editable');

    heading.focus();
    heading.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    (heading.firstChild as Text).appendData('!');
    heading.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 350)); // the post flushes
    runtime.acceptExternalUpdate([heroId]);
    runtime.reconcileExternalDrafts({ [heroId]: { heading: field('Editable!') } }, [heroId]);
    const typedNode = heading.firstChild;

    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(heading, { childList: true, characterData: true, subtree: true });
    for (let pass = 0; pass < 3; pass += 1) {
      runtime.acceptExternalUpdate([heroId]);
      await wrapper.setProps({
        blocks: [{ ...hero, data: { heading: field('Editable!') } }, second],
      });
      await flushPromises();
      runtime.rescan();
      runtime.reconcileExternalDrafts({ [heroId]: { heading: field('Editable!') } }, [heroId]);
      await Promise.resolve();
    }
    observer.disconnect();

    expect(records).toEqual([]);
    expect(heading.firstChild).toBe(typedNode);
    expect(heading.textContent).toBe('Editable!');
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
        tokenRevision: 0,
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
