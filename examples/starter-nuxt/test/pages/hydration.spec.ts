// @vitest-environment jsdom
//
// The prerendered page's other half. `test/pages/ssr.spec.ts` proves the server writes real prices
// and stock lines; this file proves the **browser's first render is that same markup**, which is the
// half a commerce block can break on its own.
//
// It can, because the storefront result is not in the same state on both sides. On a hydrating
// client `createGatewayResult` (`app/storefront/gateway.ts`) raises `loading` synchronously, fills
// `data` from the hydration payload in the same turn, and only clears `loading` after
// `await handle.settled` — so `loading && data !== null` is *true* during the first client render
// and was false during the render it has to match. A block that draws its refresh treatment
// straight off that (dimmed values, spinners, `aria-busy`, "Updating…") paints a busy page over a
// calm one: Vue patches the difference, logs a hydration warning, and the visitor sees the block
// repaint on arrival. `app/composables/useRevalidating.ts` is the fix — every flag it returns is
// false until `onMounted`, which never runs on the server and runs after the first client render.
import { describe, expect, it, afterEach } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import type { Component } from 'vue';
import ProductDetail from '../../blocks/product-detail/Block.vue';
import productDetailMock from '../../blocks/product-detail/mock.json';
import ProductCarousel from '../../blocks/product-carousel/Block.vue';
import productCarouselMock from '../../blocks/product-carousel/mock.json';
import CollectionGrid from '../../blocks/collection-grid/Block.vue';
import collectionGridMock from '../../blocks/collection-grid/mock.json';
import { createDemoStorefront } from '../../app/storefront/demo';
import { STOREFRONT_KEY } from '../../app/storefront/types';
import type { StorefrontResult, StorefrontSource, VolatileKey } from '../../app/storefront/types';
import { enUS } from '../../app/i18n/en-US';
import {
  hydrateBlock,
  hydrationWarnings,
  renderBlockHtml,
  type BlockEntry,
  type HydrationRun,
} from '../support/hydrate';

const runs: HydrationRun[] = [];
afterEach(() => {
  for (const run of runs.splice(0)) run.unmount();
});

/**
 * A result in the shape `createGatewayResult` hands a block, with the two states that differ
 * between the two renders under the caller's control: `loading` (true while hydrating, until the
 * prerendered read settles) and `revalidating` (raised by the volatile refresh a moment after
 * mount).
 */
function gatewayShaped<T>(
  value: T,
  options: { loading?: boolean } = {}
): {
  result: StorefrontResult<T>;
  loading: Ref<boolean>;
  revalidating: Ref<ReadonlySet<VolatileKey>>;
} {
  const loading = ref(options.loading ?? false);
  const revalidating = ref<ReadonlySet<VolatileKey>>(new Set());
  const result = {
    data: ref(value),
    pending: ref(false),
    loading,
    error: ref(null),
    revalidating,
    refresh: async () => {},
  } as unknown as StorefrontResult<T>;
  return { result, loading, revalidating };
}

/** The demo catalogue's own answer for one read, settled — the "payload" both renders share. */
async function demoValue<T>(pick: (source: StorefrontSource) => StorefrontResult<T>): Promise<T> {
  const result = pick(createDemoStorefront());
  await nextTick();
  await nextTick();
  return result.data.value as T;
}

interface Subject {
  name: string;
  component: Component;
  entry: BlockEntry;
  /** The settled value, read once from the demo catalogue. */
  value: () => Promise<unknown>;
  /** A storefront whose one relevant read answers with `result`. */
  storefront: (result: StorefrontResult<never>) => StorefrontSource;
}

const SUBJECTS: Subject[] = [
  {
    name: 'product-detail',
    component: ProductDetail,
    entry: { id: 'h-detail', data: productDetailMock as unknown as Record<string, unknown> },
    value: () => demoValue((source) => source.catalog.product(ref('merino-crew-sweater'))),
    storefront: (result) => {
      const base = createDemoStorefront();
      return { ...base, catalog: { ...base.catalog, product: () => result } };
    },
  },
  {
    name: 'product-carousel',
    component: ProductCarousel,
    entry: { id: 'h-carousel', data: productCarouselMock as unknown as Record<string, unknown> },
    value: () => demoValue((source) => source.catalog.related(ref('merino-crew-sweater'), 8)),
    storefront: (result) => {
      const base = createDemoStorefront();
      return { ...base, catalog: { ...base.catalog, related: () => result } };
    },
  },
  {
    name: 'collection-grid',
    component: CollectionGrid,
    entry: { id: 'h-grid', data: collectionGridMock as unknown as Record<string, unknown> },
    value: () =>
      demoValue((source) =>
        source.catalog.collectionProducts(
          ref({ slug: 'winter-knitwear' }),
          ref({ page: 1, pageSize: 24 })
        )
      ),
    storefront: (result) => {
      const base = createDemoStorefront();
      return { ...base, catalog: { ...base.catalog, collectionProducts: () => result } };
    },
  },
];

/**
 * `@eldrajs/ui`'s `Carousel` decorates its slides **imperatively after mount** — `useCarousel.ts`
 * `setAttribute`s `data-part="slide"`, `role="group"`, `aria-roledescription="slide"` and an
 * "n of total" label onto whatever children the consumer passed, and adds the `eldra-carousel-slide`
 * sizing class — precisely so a block can hand it plain elements. That is a deliberate progressive
 * enhancement of the package's, not a render the server disagreed with (Vue reports no mismatch for
 * it), and `product-detail`'s gallery and `product-carousel`'s row both go through it. Removing it
 * from both sides is what lets the comparison below stay an exact string equality and still be
 * about the *block's* own markup. Nothing in `blocks/**` writes any of these.
 */
const CAROUSEL_ENHANCEMENT =
  /\s(?:data-part="slide"|role="group"|aria-roledescription="slide"|aria-label="\d+ of \d+")|\seldra-carousel-slide|eldra-carousel-slide\s/g;

function withoutPackageEnhancement(html: string): string {
  return html.replace(CAROUSEL_ENHANCEMENT, '');
}

describe('hydrating a prerendered commerce block', () => {
  /**
   * The general rule, and the regression guard the review asked for: server render and first client
   * render of the same block over the same prerendered data must be the same markup — with the
   * client's result in the state a hydrating page actually puts it in, `loading` still true.
   *
   * "First client render" is the DOM straight after `app.mount()` on a `createSSRApp` over the
   * server's own HTML: a real hydration, not a re-render. `onMounted` runs inside that mount but the
   * render it schedules is queued, so this is genuinely the paint a visitor sees first.
   *
   * Two assertions, and the first is the load-bearing one: Vue's own hydration warnings. An
   * attribute mismatch is patched in place during hydration, so the two strings would agree
   * *afterwards* — only the warning says it happened. The string equality then catches anything Vue
   * accepts silently.
   */
  it.each(SUBJECTS.map((subject) => [subject.name, subject] as const))(
    '%s renders the same markup on the server and on the browser’s first paint',
    async (_name, subject) => {
      const value = await subject.value();

      const server = gatewayShaped(value);
      const html = await renderBlockHtml(subject.component, subject.entry, {
        [STOREFRONT_KEY]: subject.storefront(server.result as StorefrontResult<never>),
      });

      // The hydrating client: same data, `loading` still true — exactly what `gateway.ts` leaves
      // behind between the payload assignment and `await handle.settled`.
      const client = gatewayShaped(value, { loading: true });
      const run = hydrateBlock(subject.component, subject.entry, html, {
        [STOREFRONT_KEY]: subject.storefront(client.result as StorefrontResult<never>),
      });
      runs.push(run);

      expect(hydrationWarnings(run)).toEqual([]);
      expect(withoutPackageEnhancement(run.firstPaint)).toBe(
        withoutPackageEnhancement(run.expected)
      );
    }
  );

  /**
   * The same run, read as behaviour rather than as equality: nothing of the refresh treatment is in
   * the first paint, and all of it arrives on the tick after mount while the read is still in
   * flight. Both halves matter — the first is the hydration contract, the second is that gating the
   * flag did not simply turn the treatment off.
   */
  it('shows no refresh treatment until after mount, then shows it while the read is in flight', async () => {
    const subject = SUBJECTS[2]!; // collection-grid: cards, a busy grid and a count line in one
    const value = await subject.value();

    const server = gatewayShaped(value);
    const html = await renderBlockHtml(subject.component, subject.entry, {
      [STOREFRONT_KEY]: subject.storefront(server.result as StorefrontResult<never>),
    });
    expect(html).not.toContain('aria-busy');
    expect(html).not.toContain('eldra-revalidating');
    expect(html).not.toContain(enUS.grid.updating);

    const client = gatewayShaped(value, { loading: true });
    const run = hydrateBlock(subject.component, subject.entry, html, {
      [STOREFRONT_KEY]: subject.storefront(client.result as StorefrontResult<never>),
    });
    runs.push(run);

    expect(run.firstPaint).not.toContain('aria-busy');
    expect(run.firstPaint).not.toContain('eldra-revalidating');
    expect(run.firstPaint).not.toContain('data-part="spinner"');
    expect(run.firstPaint).not.toContain(enUS.grid.updating);
    expect(run.firstPaint).not.toContain(enUS.storefront.updatingValues);

    await nextTick();

    // `loading` has not changed — only `onMounted` has run. The treatment is the block's, not the
    // storefront's.
    expect(client.loading.value).toBe(true);
    expect(run.container.innerHTML).toContain('aria-busy="true"');
    expect(run.container.innerHTML).toContain('eldra-revalidating');
    expect(run.container.innerHTML).toContain(enUS.grid.updating);
    expect(run.container.innerHTML).toContain(enUS.storefront.updatingValues);

    // And it clears when the prerendered read finally settles.
    client.loading.value = false;
    await nextTick();
    expect(run.container.innerHTML).not.toContain('aria-busy="true"');
    expect(run.container.innerHTML).not.toContain('eldra-revalidating');
  });

  /** The volatile refresh itself is gated by the same flag, on the same first paint. */
  it('keeps a revalidating volatile set out of the first paint too', async () => {
    const subject = SUBJECTS[0]!; // product-detail: one price, one stock line
    const value = await subject.value();

    const server = gatewayShaped(value);
    const html = await renderBlockHtml(subject.component, subject.entry, {
      [STOREFRONT_KEY]: subject.storefront(server.result as StorefrontResult<never>),
    });

    const client = gatewayShaped(value);
    client.revalidating.value = new Set<VolatileKey>(['price', 'stock']);
    const run = hydrateBlock(subject.component, subject.entry, html, {
      [STOREFRONT_KEY]: subject.storefront(client.result as StorefrontResult<never>),
    });
    runs.push(run);

    expect(hydrationWarnings(run)).toEqual([]);
    expect(run.firstPaint).not.toContain('eldra-revalidating');

    await nextTick();
    expect(run.container.innerHTML).toContain('eldra-revalidating');
  });
});
