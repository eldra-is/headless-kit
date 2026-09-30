import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { EldraClient } from '@eldrajs/theme-core';
import type { ResolvedLink } from '@eldrajs/theme-core/links';
import { provideEldra, type EldraContext } from '../context';
import { useEldraLink } from '../useEldraLink';

const COLLECTION_ID = '22222222-2222-4222-8222-222222222222';

const collectionTemplate = {
  id: 't-collection',
  data: {
    schemaApiId: 'catalog:collection',
    routePattern: '/collections/:slug',
    slugField: 'slug',
  },
};

function mountWithContext(
  use: (link: (value: unknown) => ResolvedLink | null) => void,
  fill?: (context: EldraContext) => void
): void {
  const Child = defineComponent({
    setup() {
      use(useEldraLink());
      return () => h('div');
    },
  });
  mount(
    defineComponent({
      setup() {
        const context = provideEldra({ client: {} as EldraClient });
        fill?.(context);
        return () => h(Child);
      },
    })
  );
}

describe('useEldraLink', () => {
  it('resolves through the provided context', () => {
    let link!: (value: unknown) => ResolvedLink | null;
    mountWithContext(
      (resolve) => {
        link = resolve;
      },
      (context) => {
        context.links.templates = [collectionTemplate];
        context.links.targets = new Map([
          [`collection:${COLLECTION_ID}`, { slug: 'knitwear', title: 'Knitwear' }],
        ]);
      }
    );
    expect(
      link({ kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } })
    ).toEqual({
      href: '/collections/knitwear',
      label: 'Knitwear',
      newTab: false,
      group: null,
      children: [],
    });
  });

  it('re-resolves once the targets arrive, because it closes over the reactive state', async () => {
    let link!: (value: unknown) => ResolvedLink | null;
    let context!: EldraContext;
    mountWithContext(
      (resolve) => {
        link = resolve;
      },
      (ctx) => {
        context = ctx;
        context.links.templates = [collectionTemplate];
      }
    );
    const value = { kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } };
    expect(link(value)?.href).toBeNull();

    context.links.targets = new Map([[`collection:${COLLECTION_ID}`, { slug: 'knitwear' }]]);
    await nextTick();
    expect(link(value)?.href).toBe('/collections/knitwear');
  });

  it('resolves nothing outside a themed app, rather than throwing', () => {
    let link!: (value: unknown) => ResolvedLink | null;
    mount(
      defineComponent({
        setup() {
          link = useEldraLink();
          return () => h('div');
        },
      })
    );
    expect(link({ kind: 'url', url: '/journal' })).toBeNull();
  });

  it('starts every context with an empty, reactive link state', () => {
    let context!: EldraContext;
    mountWithContext(
      () => undefined,
      (ctx) => {
        context = ctx;
      }
    );
    expect(context.links).toEqual({ pages: [], templates: [], targets: new Map() });
  });
});
