import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { EldraClient } from '@eldrajs/theme-core';
import type { ResolvedLink } from '@eldrajs/theme-core/links';
import {
  createEldraLocaleState,
  provideEldra,
  type EldraContext,
  type EldraLocaleState,
} from '../context';
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

  it('spells every resolved href in the active locale, children included', () => {
    // A navigation resolved on `/is-IS/...` must point into `/is-IS/...`: a row that kept the
    // default-locale href would drop a visitor out of their language mid-site, and the rows a
    // mega-menu nests are the same decision one level down.
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
        context.locales = icelandic();
      }
    );

    const resolved = link({
      kind: 'collection',
      target: { _type: 'collection', id: COLLECTION_ID },
      children: [{ kind: 'url', url: '/journal', label: 'Journal' }],
    });

    expect(resolved?.href).toBe('/is-IS/collections/knitwear');
    expect(resolved?.children[0]?.href).toBe('/is-IS/journal');
  });

  it('leaves an external destination, and a page in the default locale, exactly as they are', () => {
    let link!: (value: unknown) => ResolvedLink | null;
    let context!: EldraContext;
    mountWithContext(
      (resolve) => {
        link = resolve;
      },
      (ctx) => {
        context = ctx;
        context.locales = icelandic();
      }
    );

    expect(link({ kind: 'url', url: 'https://example.com/x', label: 'x' })?.href).toBe(
      'https://example.com/x'
    );
    // Back on the locale served at `/`, nothing is rewritten at all — which is nearly every page
    // of nearly every site, and this resolver runs once per navigation row per render.
    context.locales = createEldraLocaleState();
    expect(link({ kind: 'url', url: '/journal', label: 'Journal' })?.href).toBe('/journal');
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

/** A context whose active locale is one the site serves under a prefix. */
function icelandic(): EldraLocaleState {
  const state = createEldraLocaleState();
  state.active = 'is-IS';
  state.defaultLocale = 'en-US';
  state.supported = ['en-US', 'is-IS'];
  state.path = (href) =>
    href.startsWith('/') && !href.startsWith('/is-IS') ? `/is-IS${href === '/' ? '' : href}` : href;
  return state;
}
