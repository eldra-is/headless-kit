<script setup lang="ts">
/**
 * The shopper's cart, as a slide-in drawer or a full page (spec `02-blocks.md` "Cart", 3502–3607).
 * One component, two shells: the line items, the free-shipping note and the empty state are the
 * same in both, and only the frame around them changes.
 *
 * - `drawer` — a right-hand `Drawer` (the package's native modal `<dialog>`), bound to
 *   `useStorefront().cart.drawerOpen`. Mounting it is also what tells the header that a drawer
 *   exists: `cart.drawerAvailable` goes `true` on mount and `false` on unmount, which is what turns
 *   the header's bag from a link to `/cart` into a button that opens this drawer
 *   (`blocks/navigation/Block.vue`). The shipping bar spans the panel edge to edge, the body
 *   scrolls, and the footer holds the subtotal, the note, Check out and View cart. No discount
 *   field, no payment icons — those are the page's (spec Variants).
 * - `page` — a `Section spacing="none"` with 2rem of top padding and the `md` step below it, an `h1`
 *   at the h2 scale with the live item count beside it, a Continue shopping link, and from 64rem a
 *   `1fr | 22rem` layout: the shipping panel, the `aria-hidden` column headings and the items on the
 *   left, the sticky `Summary` aside on the right.
 *
 * **Container queries inside the drawer.** `Section` is the `@container` every block measures its
 * breakpoints against, and a `Drawer` renders no `Section` — so the drawer body is given
 * `@container` through `Drawer`'s own `classes.body`. The panel is at most 26rem wide (and full
 * screen below a 48rem viewport, which is narrower still), so every `@tablet:` rule inside resolves
 * to the compact shape at every viewport size, and `parts/CartLines.vue` needs one set of classes
 * for both shells rather than a "which shell am I in" prop.
 *
 * **Focus after a removal.** `CartLines` moves focus to the next line itself, but the empty state —
 * and therefore the heading focus lands on when the *last* line goes — belongs to this component
 * (spec Accessibility: "After removal, focus moves to the next item's title link, or to the
 * empty-state heading"). `CartLines` marks the intent with `removing` and this watches the cart
 * actually going empty; a heading is not focusable on its own, so the one `tabindex="-1"` it needs is
 * set on the element at that moment rather than baked into `EmptyState`'s markup.
 *
 * **The editor.** A closed drawer draws nothing at all, which in Studio's editor would look like a
 * block that failed to render, so the `drawer` variant shows one `EditorPlaceholder` naming where
 * the drawer opens from — editor-only, gated on `useEditing()` like every other block's hints.
 */
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Component,
} from 'vue';
import {
  Button,
  Container,
  Drawer,
  EditorPlaceholder,
  EmptyState,
  Link,
  Price,
  Section,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { iconComponent } from '../../app/composables/iconComponent';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import { useMoney } from '../../app/storefront/money';
import CartLines from './parts/CartLines.vue';
import ShippingBar from './parts/ShippingBar.vue';
import Summary from './parts/Summary.vue';

const props = defineProps<{ entry: EldraBlockEntry<'cart'> }>();
const { data } = useBlockData(props, 'cart');
const editing = useEditing();
const t = useT();
/** The cart subtotal is major units (`app/storefront/types.ts`); `<Price>` reads minor. */
const money = useMoney();
const cart = useStorefront().cart;

const uid = useUiId();
const headingId = `cart-title-${uid}`;
const summaryHeadingId = `cart-summary-${uid}`;

const variant = computed(() => data.value.variant ?? 'drawer');
const isDrawer = computed(() => variant.value === 'drawer');

/** Top-level consts so the template unwraps these refs (and `v-model` can write `drawerOpen`). */
const drawerOpen = cart.drawerOpen;
const lines = cart.lines;
const count = cart.count;

const isEmpty = computed(() => lines.value.length === 0);
const subtotal = computed(() => cart.totals.value?.subtotal ?? 0);
const countLabel = computed(() =>
  count.value === 1 ? t('cart.itemCountOne') : t('cart.itemCountMany', { count: count.value })
);

/**
 * Spec Variants: only the drawer makes the header's bag a button, and only while it is mounted.
 * A `page`-variant block never *clears* the flag either — a cart page can carry both a page cart and
 * a drawer mounted by the layout, and whichever mounted last must not silently turn the other one's
 * drawer off.
 */
onMounted(() => {
  if (isDrawer.value) cart.drawerAvailable.value = true;
});
watch(isDrawer, (drawer) => {
  cart.drawerAvailable.value = drawer;
});
onBeforeUnmount(() => {
  if (isDrawer.value) cart.drawerAvailable.value = false;
});

const note = computed(() => (data.value.note ?? '').trim());
const emptyTitle = computed(() => (data.value.emptyTitle ?? '').trim());
const emptyText = computed(() => (data.value.emptyText ?? '').trim());
const emptyLinkLabel = computed(() => (data.value.emptyLinkLabel ?? '').trim());
const emptyLinkHref = computed(() => safeHref(data.value.emptyLinkHref));
const hasEmptyLink = computed(() => emptyLinkLabel.value !== '' && emptyLinkHref.value !== null);
const emptyLinkAs = computed(() =>
  emptyLinkHref.value !== null && isInternalHref(emptyLinkHref.value) ? EldraRouterLink : undefined
);

/**
 * The page's own Continue shopping link reuses the empty state's destination — the block has one
 * "back to shopping" target, and the spec gives it no second field. Its visible text is the theme's
 * own `cart.continueShopping`, never `emptyLinkLabel`, so it needs only a usable `href`: a site that
 * filled in the destination but left the empty state's button label blank still gets the link.
 */
const continueAs = emptyLinkAs;
const hasContinueLink = computed(() => emptyLinkHref.value !== null);

const showDiscountField = computed(() => data.value.showDiscountField ?? true);
const showPaymentIcons = computed(() => data.value.showPaymentIcons ?? true);
const threshold = computed(() => (data.value.freeShippingThreshold ?? '').trim());

const checkoutHref = computed(() => safeHref(cart.checkoutUrl.value));
const checkoutAs = computed(() =>
  checkoutHref.value !== null && isInternalHref(checkoutHref.value) ? EldraRouterLink : undefined
);

/** The theme's own cart page path — the same one `blocks/navigation/Block.vue` sends the bag to
 *  when no drawer is mounted, so the drawer's View cart and that fallback agree. */
const CART_PATH = '/cart';

/** `EmptyState.icon` takes an already-bound icon component with no props of its own, so this goes
 *  through the theme's shared name→component adapter (`app/composables/iconComponent.ts`). */
const ShoppingBagIcon: Component = iconComponent('shopping-bag');

const emptyRoot = ref<HTMLElement | null>(null);

/**
 * Spec Accessibility: with the last line gone, focus lands on the empty state's heading. The signal
 * is `CartLines`' `removing` (emitted before the store is touched, see that component) rather than
 * an "it is empty now" event, so this only ever fires for a cart the shopper just emptied — never
 * for one that arrived empty. `nextTick` because the empty state does not exist yet when the store
 * flips, and a heading is not focusable until it is given the one `tabindex` it needs.
 */
let removalPending = false;

function onRemoving(): void {
  removalPending = true;
}

watch(isEmpty, async (empty) => {
  // Cleared either way: a removal that left items behind must not arm the focus move for some
  // later, unrelated emptying (an Undo of a different line, a cart cleared by the backend).
  const pending = removalPending;
  removalPending = false;
  if (!empty || !pending) return;
  await nextTick();
  const heading = emptyRoot.value?.querySelector<HTMLElement>('[data-part="title"]');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
});

function closeDrawer(): void {
  drawerOpen.value = false;
}

const DRAWER_CLASSES = {
  header: 'min-h-16 gap-3 px-4 py-3',
  body: '@container p-0',
  footer: 'grid gap-3 border-t px-4 py-4',
};
</script>

<template>
  <template v-if="isDrawer">
    <Section v-if="editing" spacing="sm">
      <Container width="content">
        <EditorPlaceholder :label="t('cart.drawerHintLabel')" :help="t('cart.drawerHintHelp')" />
      </Container>
    </Section>

    <Drawer
      v-model="drawerOpen"
      side="right"
      :title="t('cart.title')"
      :count="count"
      width="min(26rem, 100%)"
      :classes="DRAWER_CLASSES"
    >
      <template v-if="isEmpty">
        <div ref="emptyRoot" class="my-6 px-4">
          <EmptyState
            plain
            :icon="ShoppingBagIcon"
            :title="emptyTitle || t('cart.emptyFallbackTitle')"
            :text="emptyText || null"
          >
            <template v-if="hasEmptyLink" #actions>
              <Button
                variant="primary"
                :href="emptyLinkHref ?? undefined"
                :as="emptyLinkAs"
                :label="emptyLinkLabel"
                @click="closeDrawer"
              />
            </template>
          </EmptyState>
        </div>
      </template>
      <template v-else>
        <ShippingBar panel="edge" :threshold="threshold" :subtotal="subtotal" />
        <div class="px-4">
          <CartLines :lines="lines" @removing="onRemoving" />
        </div>
      </template>

      <template v-if="!isEmpty" #footer>
        <div class="flex items-baseline justify-between gap-4">
          <span class="text-text text-base font-semibold">{{ t('cart.subtotal') }}</span>
          <Price
            :amount="money.minor(subtotal)"
            :classes="{ root: 'text-text text-base font-semibold tabular-nums' }"
          />
        </div>
        <p v-if="note" class="text-muted text-body-sm text-center">{{ note }}</p>
        <Button
          v-if="checkoutHref"
          variant="primary"
          size="lg"
          block
          :href="checkoutHref"
          :as="checkoutAs"
        >
          <template #leadingIcon>
            <EldraIcon name="lock" size="sm" />
          </template>
          {{ t('cart.checkout') }}
        </Button>
        <Button
          variant="outline"
          block
          :href="CART_PATH"
          :as="EldraRouterLink"
          :label="t('cart.viewCart')"
        />
      </template>
    </Drawer>
  </template>

  <Section v-else spacing="none" :labelled-by="headingId" class="pt-8 pb-[var(--eldra-section-md)]">
    <Container width="content">
      <div class="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h1
          :id="headingId"
          class="font-heading text-text @tablet:text-h2 flex flex-wrap items-baseline gap-3 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]"
        >
          {{ t('cart.title') }}
          <span class="font-body text-muted text-base font-normal tracking-normal">
            {{ countLabel }}
          </span>
        </h1>
        <Link
          v-if="hasContinueLink"
          variant="standalone"
          :href="emptyLinkHref ?? undefined"
          :as="continueAs"
          :classes="{ label: 'inline-flex items-center gap-1' }"
        >
          <EldraIcon name="arrow-left" size="sm" />
          {{ t('cart.continueShopping') }}
        </Link>
      </div>

      <div v-if="isEmpty" ref="emptyRoot">
        <EmptyState
          :icon="ShoppingBagIcon"
          :heading-level="2"
          :title="emptyTitle || t('cart.emptyFallbackTitle')"
          :text="emptyText || null"
        >
          <template v-if="hasEmptyLink" #actions>
            <Button
              variant="primary"
              :href="emptyLinkHref ?? undefined"
              :as="emptyLinkAs"
              :label="emptyLinkLabel"
            />
          </template>
        </EmptyState>
      </div>

      <div
        v-else
        class="@content:grid-cols-[minmax(0,1fr)_22rem] @content:items-start @content:gap-12 grid gap-8"
      >
        <div class="grid min-w-0 gap-2">
          <ShippingBar panel="card" :threshold="threshold" :subtotal="subtotal" />
          <div
            aria-hidden="true"
            class="border-border text-body-sm text-muted @tablet:grid hidden grid-cols-[6rem_1fr_11rem_6rem] gap-x-4 border-b pt-4 pb-3"
          >
            <span class="col-start-2">{{ t('cart.columnProduct') }}</span>
            <span>{{ t('cart.columnQuantity') }}</span>
            <span class="text-end">{{ t('cart.columnTotal') }}</span>
          </div>
          <CartLines :lines="lines" @removing="onRemoving" />
        </div>

        <Summary
          :heading-id="summaryHeadingId"
          :show-discount="showDiscountField"
          :show-payment-icons="showPaymentIcons"
          :note="note"
        />
      </div>
    </Container>
  </Section>
</template>
