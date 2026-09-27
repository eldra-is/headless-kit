<script setup lang="ts">
/**
 * Order status: the order confirmation and tracking page (spec `02-blocks.md` 3719–3835, "Order
 * status"). Order number and placed date, a status badge, a status panel with a delivery tracker
 * and tracking number, the items and totals, and a details `<aside>` (delivery address, payment,
 * help links). Editors fill in only the copy fields (`processingTitle` and its siblings, the
 * return/shop-again links, `helpLinks`); everything else is bound to the order at runtime through
 * `useStorefront().orders.current()` (`app/storefront/types.ts#StorefrontOrder`) — the page URL
 * holds a signed order token (`route.orderToken`), never a field this block owns.
 *
 * **No `variant`.** The field exists only because Core always wants at least one `select` field to
 * key Studio's insert grid off of (see block.json's own helpText: "Reserved. The state comes from
 * the order, not from a field."); the five visual states below are driven entirely by
 * `order.status`.
 *
 * **The five states.** `order.status` (`processing` | `shipped` | `delivered` | `delayed` |
 * `cancelled`) drives the badge's icon/tone/word (`STATUS_ICON`/`STATUS_TONE`, the word itself
 * `storefront.orderStatus.*` — shared vocabulary every commerce block reads, not this block's
 * own), the panel's title/text/call-to-action, and which of the tracker/tracking-number row show
 * at all (cancelled renders neither, spec → States: "Don't show a tracker for cancelled orders").
 * `order.steps[]` is the tracker's own source of truth for done/current/upcoming/warning — this
 * block never re-derives a step's state from `order.status` itself, only reads what
 * `app/storefront/demo.ts#buildOrder`/the gateway mapping already computed.
 *
 * **Freshly inserted in the editor (spec → States, "no empty layout").** With no order bound yet
 * (`orders.current()` resolves `null` — a real page with no `?token=` in its URL, most often the
 * empty entry Studio just inserted), `useEditing()` true falls back to the same sample order the
 * demo storefront itself serves everywhere else (`app/storefront/demo.ts#buildOrder('shipped')`,
 * exported for exactly this — see that file's own doc comment on the export) rather than showing
 * a bare `EditorPlaceholder`: the whole page is order data, so there is no smaller "empty part" to
 * hint at. On the live site the same `null` renders nothing (a block with no required content
 * renders nothing, same rule every other block follows).
 *
 * **Icons.** `Badge.icon`/`Button.iconLeft`/`iconRight` each take an already-bound `IconComponent`
 * (see `feature-grid`'s/`pricing-table`'s own doc comments for the same constraint) — `EldraIcon`
 * itself cannot be handed straight through, it still needs a `name` bound. `resolveIconComponent`
 * below is the same name→component adapter those two blocks each build locally, generalised to
 * runtime-determined names (badge/step icons change with `order.status`) rather than one name
 * fixed at compile time. Payment and help-link icons go through `EldraIcon` directly instead —
 * `Link` has no icon prop of its own, so those sit beside it as a plain decorative icon.
 *
 * **Dates.** `formatDate` (`@eldrajs/ui`, the package's one frozen formatter — see `article`'s own
 * doc comment for why this is never hand-rolled) renders `placedAt` and every step's own date.
 * `deliveredTitle`'s `{date}` is plain string interpolation (`interpolate` below, the same small
 * per-block helper `contact`'s `successText` uses) — CMS content, not a `useT()` key.
 *
 * **Delayed step wording.** A `warning` step (`order.steps[].state`) is the tracker's active
 * position, the same as `current` (both get the ring and `aria-current="step"`), but its date text
 * reads the literal word "Delayed" (`storefront.orderStatus.delayed`, reused rather than a new
 * key) instead of a formatted date — spec → Variants, delayed row. A `current` step with no date
 * yet (`processing`'s `packed` step) reads `order.inProgress` instead.
 *
 * **Deviations resolved while implementing (visual detail the spec describes but the order data
 * contract does not carry, or that conflicts with the package's own frozen recipe):**
 *  - The badge's "1px border in the badge's own colour" is `Badge`'s own `outline` look (a
 *    `border-strong` boundary on `background`) rather than a hand-tinted border color the
 *    component has no prop for.
 *  - `deliveredText`'s "follows the carrier's delivery note ('Left at the front door.') when there
 *    is one" has no field on `StorefrontOrder` to read that note from — only `delayNote`/
 *    `cancelNote` exist — so `deliveredText` renders verbatim, with no such note prepended.
 *  - The demo `delivered` order marks every step `done` (`app/storefront/demo.ts`), not `current`
 *    on the last one as the spec's own narrative describes — `step.state` is the single source of
 *    truth this block renders, so a delivered order's last step shows the done check, not the
 *    ring.
 */
import { computed, defineComponent, h, ref, type Component } from 'vue';
import {
  Badge,
  Button,
  Container,
  Image,
  Link,
  Price,
  Section,
  VisuallyHidden,
  formatDate,
  type BadgeTone,
} from '@eldrajs/ui';
import { useEldra } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useEldraIcon } from '../../app/composables/useEldraIcon';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import { buildOrder } from '../../app/storefront/demo';
import type { MessageKey } from '../../app/i18n/messages';
import type {
  StorefrontCartLine,
  StorefrontOrder,
  StorefrontOrderStatus,
} from '../../app/storefront/types';

type StepKey = StorefrontOrder['steps'][number]['key'];

const props = defineProps<{ entry: EldraBlockEntry<'order-status'> }>();
const { data } = useBlockData(props, 'order-status');
const t = useT();
const editing = useEditing();
const storefront = useStorefront();
const titleId = `order-status-title-${useUiId()}`;

function tryUseEldra(): ReturnType<typeof useEldra> | undefined {
  try {
    return useEldra();
  } catch {
    return undefined;
  }
}
/** See `article`'s identical helper: `formatDate` needs the raw locale string, not a translation. */
const locale = computed(() => tryUseEldra()?.preview.locale ?? 'en-US');

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? params[key]! : match
  );
}

/* ------------------------------------------------------------------------------------------- */
/* The order itself                                                                              */
/* ------------------------------------------------------------------------------------------- */

const orderTokenRef = computed(() => storefront.route.orderToken);
const orderResult = storefront.orders.current(orderTokenRef);

/** See the module doc comment's "Freshly inserted in the editor" section. */
const order = computed<StorefrontOrder | null>(() => {
  if (orderResult.data.value) return orderResult.data.value;
  return editing.value ? buildOrder('shipped') : null;
});

/* ------------------------------------------------------------------------------------------- */
/* Icon name → bound component adapter (see the module doc comment's "Icons" section)             */
/* ------------------------------------------------------------------------------------------- */

const iconCache = new Map<string, Component>();
function resolveIconComponent(name: string): Component {
  const cached = iconCache.get(name);
  if (cached) return cached;
  const component = defineComponent({
    name: 'OrderStatusIcon',
    setup() {
      const svg = useEldraIcon(computed(() => name));
      return () => {
        const markup = svg.value;
        if (markup === null) return h('svg', { viewBox: '0 0 24 24' });
        const body = markup.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
        return h('svg', {
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          innerHTML: body,
        });
      };
    },
  });
  iconCache.set(name, component);
  return component;
}

const TrackIcon = resolveIconComponent('external-link');
const ReturnIcon = resolveIconComponent('arrow-back-up');
const ShopAgainIcon = resolveIconComponent('arrow-right');
const CheckIcon = resolveIconComponent('check');

/* ------------------------------------------------------------------------------------------- */
/* Head: order number, placed line, status badge                                                 */
/* ------------------------------------------------------------------------------------------- */

const placedDate = computed(() =>
  order.value ? formatDate(order.value.placedAt, locale.value) : null
);
const placedLine = computed(() => {
  if (!order.value || placedDate.value === null) return '';
  return order.value.itemCount === 1
    ? t('order.placedOne', { date: placedDate.value })
    : t('order.placedMany', { date: placedDate.value, count: order.value.itemCount });
});

const STATUS_ICON_NAME: Record<StorefrontOrderStatus, string> = {
  processing: 'package',
  shipped: 'truck',
  delivered: 'circle-check',
  delayed: 'alert-triangle',
  cancelled: 'circle-x',
};
const STATUS_TONE: Record<StorefrontOrderStatus, BadgeTone> = {
  processing: 'neutral',
  shipped: 'neutral',
  delivered: 'success',
  delayed: 'warning',
  cancelled: 'danger',
};
const STATUS_WORD_KEY: Record<StorefrontOrderStatus, MessageKey> = {
  processing: 'storefront.orderStatus.processing',
  shipped: 'storefront.orderStatus.shipped',
  delivered: 'storefront.orderStatus.delivered',
  delayed: 'storefront.orderStatus.delayed',
  cancelled: 'storefront.orderStatus.cancelled',
};

const statusIcon = computed(() =>
  order.value ? resolveIconComponent(STATUS_ICON_NAME[order.value.status]) : null
);
const statusTone = computed<BadgeTone>(() =>
  order.value ? STATUS_TONE[order.value.status] : 'neutral'
);
const statusWord = computed(() => (order.value ? t(STATUS_WORD_KEY[order.value.status]) : ''));

/* ------------------------------------------------------------------------------------------- */
/* Status panel: title, text, carrier/ETA, alert, call to action                                 */
/* ------------------------------------------------------------------------------------------- */

const panelTitle = computed(() => {
  const o = order.value;
  if (!o) return '';
  if (o.status === 'processing') return data.value.processingTitle;
  if (o.status === 'shipped') return data.value.shippedTitle;
  if (o.status === 'delayed') return data.value.delayedTitle;
  if (o.status === 'cancelled') return data.value.cancelledTitle;
  const deliveredDate = o.steps.find((step) => step.key === 'delivered')?.date;
  const formatted = deliveredDate ? formatDate(deliveredDate, locale.value) : null;
  return interpolate(data.value.deliveredTitle, { date: formatted ?? '' });
});

const panelText = computed(() => {
  const o = order.value;
  if (!o) return '';
  if (o.status === 'processing') return (data.value.processingText ?? '').trim();
  if (o.status === 'delivered') return (data.value.deliveredText ?? '').trim();
  return '';
});
const hasPanelText = computed(() => panelText.value !== '');

const carrierEtaLine = computed(() => {
  const o = order.value;
  if (!o || !o.carrier || !o.eta) return '';
  return t('order.carrierEta', { eta: o.eta, carrier: o.carrier });
});
const hasCarrierEta = computed(() => carrierEtaLine.value !== '');

const alertText = computed(() => order.value?.delayNote || order.value?.cancelNote || '');
const hasAlert = computed(() => alertText.value !== '');
const alertIsDanger = computed(() => order.value?.status === 'cancelled');
const alertIcon = computed(() =>
  resolveIconComponent(alertIsDanger.value ? 'circle-x' : 'alert-triangle')
);

type CtaKind = 'track' | 'return' | 'shopAgain' | null;

const trackingHref = computed(() => safeHref(order.value?.trackingUrl));
const returnLabel = computed(() => (data.value.returnLinkLabel ?? '').trim());
const returnHref = computed(() => safeHref(data.value.returnLinkHref));
const returnLinkAs = computed(() =>
  returnHref.value !== null && isInternalHref(returnHref.value) ? EldraRouterLink : undefined
);
const shopAgainLabel = computed(() => (data.value.shopAgainLinkLabel ?? '').trim());
const shopAgainHref = computed(() => safeHref(data.value.shopAgainLinkHref));
const shopAgainLinkAs = computed(() =>
  shopAgainHref.value !== null && isInternalHref(shopAgainHref.value) ? EldraRouterLink : undefined
);

const ctaKind = computed<CtaKind>(() => {
  const o = order.value;
  if (!o) return null;
  if (o.status === 'cancelled') {
    return shopAgainLabel.value !== '' && shopAgainHref.value !== null ? 'shopAgain' : null;
  }
  if (o.status === 'delivered') {
    return returnLabel.value !== '' && returnHref.value !== null ? 'return' : null;
  }
  return trackingHref.value !== null ? 'track' : null;
});

/* ------------------------------------------------------------------------------------------- */
/* Tracker                                                                                        */
/* ------------------------------------------------------------------------------------------- */

const STEP_ICON_NAME: Record<StepKey, string> = {
  ordered: 'shopping-bag',
  packed: 'package',
  shipped: 'truck',
  delivered: 'circle-check',
};
const STEP_LABEL_KEY: Record<StepKey, MessageKey> = {
  ordered: 'storefront.orderSteps.ordered',
  packed: 'storefront.orderSteps.packed',
  shipped: 'storefront.orderSteps.shipped',
  delivered: 'storefront.orderSteps.delivered',
};

interface StepView {
  key: StepKey;
  label: string;
  dateText: string;
  isDone: boolean;
  isActive: boolean;
  isWarning: boolean;
  icon: Component;
}

const showTracker = computed(() => order.value !== null && order.value.status !== 'cancelled');

const steps = computed<StepView[]>(() => {
  const o = order.value;
  if (!o) return [];
  return o.steps.map((step) => {
    const isWarning = step.state === 'warning';
    const isDone = step.state === 'done';
    const isCurrent = step.state === 'current';
    let dateText = '';
    if (isWarning) dateText = t('storefront.orderStatus.delayed');
    else if (step.date) dateText = formatDate(step.date, locale.value) ?? '';
    else if (isCurrent) dateText = t('order.inProgress');
    return {
      key: step.key,
      label: t(STEP_LABEL_KEY[step.key]),
      dateText,
      isDone,
      isActive: isCurrent || isWarning,
      isWarning,
      icon: isDone
        ? CheckIcon
        : resolveIconComponent(isWarning ? 'alert-triangle' : STEP_ICON_NAME[step.key]),
    };
  });
});

function discClass(step: StepView): string {
  if (step.isDone) return 'bg-primary text-primary-contrast';
  if (step.isWarning) {
    return 'bg-warning text-background ring-2 ring-warning ring-offset-[3px] ring-offset-surface';
  }
  if (step.isActive) {
    return 'bg-primary text-primary-contrast ring-2 ring-primary ring-offset-[3px] ring-offset-surface';
  }
  return 'bg-background text-muted border-[1.5px] border-dashed border-border-strong';
}

function labelClass(step: StepView): string {
  if (step.isActive) return 'text-text font-bold';
  if (step.isDone) return 'text-text font-semibold';
  return 'text-muted font-medium';
}

function dateClass(step: StepView): string {
  if (step.isWarning) return 'text-warning font-semibold tabular-nums';
  return 'text-muted tabular-nums';
}

function isLastStep(index: number): boolean {
  return index === steps.value.length - 1;
}

const VERTICAL_CONNECTOR_BASE = 'absolute @two-col:hidden left-5 top-10 bottom-[-1.25rem]';
const HORIZONTAL_CONNECTOR_BASE =
  'hidden @two-col:block @two-col:absolute @two-col:top-5 @two-col:left-1/2 @two-col:w-full @two-col:-z-10';

function verticalConnectorClass(step: StepView): string {
  return [
    VERTICAL_CONNECTOR_BASE,
    step.isDone ? 'w-px bg-text' : 'w-0 border-l-[1.5px] border-dashed border-border-strong',
  ].join(' ');
}
function horizontalConnectorClass(step: StepView): string {
  return [
    HORIZONTAL_CONNECTOR_BASE,
    step.isDone ? 'h-px bg-text' : 'h-0 border-t-[1.5px] border-dashed border-border-strong',
  ].join(' ');
}

const hasTrackingRow = computed(() => Boolean(order.value?.trackingNumber));

/* ------------------------------------------------------------------------------------------- */
/* Items and totals                                                                               */
/* ------------------------------------------------------------------------------------------- */

const lines = computed(() => order.value?.lines ?? []);
const showAllLines = ref(false);
const visibleLines = computed(() => (showAllLines.value ? lines.value : lines.value.slice(0, 10)));
const hasMoreLines = computed(() => lines.value.length > 10);

function revealAllLines(): void {
  showAllLines.value = true;
}

function lineHref(line: StorefrontCartLine): string | null {
  return safeHref(line.url);
}
function lineLinkAs(line: StorefrontCartLine): typeof EldraRouterLink | undefined {
  const href = lineHref(line);
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
}
function lineMedia(line: StorefrontCartLine): { src: string; alt: string } | null {
  return line.image ? { src: line.image.src, alt: line.image.alt } : null;
}
function lineMeta(line: StorefrontCartLine): string {
  const qty = t('order.qty', { count: line.quantity });
  return line.variantLabel ? `${line.variantLabel} · ${qty}` : qty;
}

const totals = computed(() => order.value?.totals ?? null);
const hasTax = computed(() => totals.value?.tax != null);
const isShippingFree = computed(() => totals.value?.shipping === 0);

/* ------------------------------------------------------------------------------------------- */
/* Details: delivery address, payment, help links                                                */
/* ------------------------------------------------------------------------------------------- */

const shippingAddress = computed(() => order.value?.shippingAddress ?? []);
const payment = computed(() => order.value?.payment ?? null);

function paymentIconName(brand: string): string {
  switch (brand.toLowerCase().replace(/\s+/g, '-')) {
    case 'visa':
      return 'brand-visa';
    case 'mastercard':
      return 'brand-mastercard';
    case 'paypal':
      return 'brand-paypal';
    case 'apple-pay':
      return 'brand-apple';
    default:
      return 'credit-card';
  }
}

interface HelpLinkView {
  label: string;
  href: string;
  icon?: string;
  as: typeof EldraRouterLink | undefined;
}

const helpLinks = computed<HelpLinkView[]>(() =>
  (data.value.helpLinks ?? [])
    .map((item) => {
      const label = (item.label ?? '').trim();
      const href = safeHref(item.href);
      return { label, href, icon: item.icon };
    })
    .filter(
      (item): item is { label: string; href: string; icon?: string } =>
        item.href !== null && item.label !== ''
    )
    .map((item) => ({ ...item, as: isInternalHref(item.href) ? EldraRouterLink : undefined }))
);
</script>

<template>
  <Section v-if="order" background="none" spacing="md" :labelled-by="titleId">
    <Container width="content">
      <div class="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1
            :id="titleId"
            class="font-heading @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]"
          >
            {{ t('order.number', { number: order.number }) }}
          </h1>
          <p v-if="placedLine" class="text-muted mt-2 text-base">{{ placedLine }}</p>
        </div>
        <Badge pill outline :tone="statusTone" :icon="statusIcon" class="shrink-0">
          <VisuallyHidden>{{ t('order.statusPrefix') }}</VisuallyHidden
          >{{ statusWord }}
        </Badge>
      </div>

      <div class="@content:flex-row @content:items-start @content:gap-12 flex flex-col gap-12">
        <div class="flex min-w-0 flex-1 flex-col gap-10">
          <!-- Status panel -->
          <div
            class="bg-surface @tablet:px-8 @tablet:pt-6 @tablet:pb-8 flex flex-col gap-6 rounded-lg p-5"
          >
            <div class="flex flex-col gap-2">
              <h2 class="text-h4">{{ panelTitle }}</h2>
              <p v-if="hasPanelText" class="text-muted text-base">{{ panelText }}</p>
              <p v-if="hasCarrierEta" class="text-muted text-base">{{ carrierEtaLine }}</p>
              <div
                v-if="hasAlert"
                role="status"
                class="bg-background mt-2 flex items-start gap-2 rounded-md p-3"
                :class="alertIsDanger ? 'text-danger' : 'text-warning'"
              >
                <component
                  :is="alertIcon"
                  class="mt-0.5 size-5 shrink-0"
                  aria-hidden="true"
                  focusable="false"
                />
                <p class="text-base">{{ alertText }}</p>
              </div>
            </div>

            <div v-if="ctaKind">
              <Button
                v-if="ctaKind === 'track'"
                variant="outline"
                :href="trackingHref!"
                target="_blank"
                rel="noopener noreferrer"
                :icon-right="TrackIcon"
              >
                {{ t('order.trackPackage')
                }}<VisuallyHidden>{{ t('order.trackOpens') }}</VisuallyHidden>
              </Button>
              <Button
                v-else-if="ctaKind === 'return'"
                variant="outline"
                :href="returnHref!"
                :as="returnLinkAs"
                :icon-left="ReturnIcon"
              >
                {{ returnLabel }}
              </Button>
              <Button
                v-else
                variant="outline"
                :href="shopAgainHref!"
                :as="shopAgainLinkAs"
                :icon-right="ShopAgainIcon"
              >
                {{ shopAgainLabel }}
              </Button>
            </div>

            <ol
              v-if="showTracker"
              :aria-label="t('order.progress')"
              class="@two-col:grid @two-col:grid-cols-4 @two-col:gap-4 flex flex-col gap-5"
            >
              <li
                v-for="(step, index) in steps"
                :key="step.key"
                :aria-current="step.isActive ? 'step' : undefined"
                class="@two-col:flex-col @two-col:items-center @two-col:gap-0 @two-col:text-center relative flex items-start gap-3"
              >
                <span
                  aria-hidden="true"
                  :class="discClass(step)"
                  class="@two-col:mb-3 flex size-10 shrink-0 items-center justify-center rounded-full"
                >
                  <component :is="step.icon" class="size-5" />
                </span>
                <span
                  v-if="!isLastStep(index)"
                  aria-hidden="true"
                  :class="verticalConnectorClass(step)"
                />
                <span
                  v-if="!isLastStep(index)"
                  aria-hidden="true"
                  :class="horizontalConnectorClass(step)"
                />
                <div class="@two-col:mt-0 @two-col:items-center mt-2 flex flex-col gap-1">
                  <p :class="labelClass(step)" class="text-base">
                    {{ step.label
                    }}<VisuallyHidden>{{
                      step.isDone ? t('order.completed') : t('order.notYet')
                    }}</VisuallyHidden>
                  </p>
                  <p v-if="step.dateText" :class="dateClass(step)" class="text-body-sm">
                    {{ step.dateText }}
                  </p>
                </div>
              </li>
            </ol>

            <div
              v-if="hasTrackingRow"
              class="border-border flex items-center justify-between border-t pt-5"
            >
              <span class="text-muted text-body-sm">{{ t('order.trackingNumber') }}</span>
              <span class="text-text font-mono text-base tracking-wide">{{
                order.trackingNumber
              }}</span>
            </div>
          </div>

          <!-- Items -->
          <div v-if="lines.length > 0">
            <h2 class="text-h4">{{ t('order.items') }}</h2>
            <div class="border-border mt-4 border-t" />
            <ul role="list">
              <li
                v-for="line in visibleLines"
                :key="line.id"
                class="border-border grid grid-cols-[4.5rem_1fr_auto] items-start gap-4 border-b py-4"
              >
                <Image
                  :media="lineMedia(line)"
                  :alt="line.image?.alt ?? ''"
                  ratio="1x1"
                  rounded="md"
                  class="w-18"
                />
                <div class="flex min-w-0 flex-col gap-1">
                  <Link
                    :href="lineHref(line) ?? undefined"
                    :as="lineLinkAs(line)"
                    :classes="{ root: 'font-semibold text-text' }"
                  >
                    {{ line.title }}
                  </Link>
                  <p class="text-muted text-body-sm">{{ lineMeta(line) }}</p>
                </div>
                <Price :amount="line.lineTotal" size="sm" class="justify-self-end" />
              </li>
            </ul>
            <Button
              v-if="hasMoreLines"
              variant="link"
              type="button"
              class="mt-4"
              @click="revealAllLines"
            >
              {{ t('order.showAllItems', { count: lines.length }) }}
            </Button>

            <dl
              v-if="totals"
              class="@content:ml-auto @content:max-w-[22rem] mt-6 flex flex-col gap-2"
            >
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-muted text-body-sm">{{ t('order.subtotal') }}</dt>
                <dd class="text-text text-base tabular-nums">
                  <Price :amount="totals.subtotal" size="sm" />
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-muted text-body-sm">{{ t('order.shipping') }}</dt>
                <dd class="text-text text-base tabular-nums">
                  <span v-if="isShippingFree">{{ t('order.shippingFree') }}</span>
                  <Price v-else-if="totals.shipping != null" :amount="totals.shipping" size="sm" />
                </dd>
              </div>
              <div v-if="hasTax" class="flex items-baseline justify-between gap-4">
                <dt class="text-muted text-body-sm">{{ t('order.tax') }}</dt>
                <dd class="text-text text-base tabular-nums">
                  <Price :amount="totals.tax!" size="sm" />
                </dd>
              </div>
              <div class="border-border flex items-baseline justify-between gap-4 border-t pt-3">
                <dt class="text-h4 font-bold">{{ t('order.total') }}</dt>
                <dd class="text-h4 font-bold tabular-nums">
                  <Price :amount="totals.total" size="md" />
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <aside :aria-label="t('order.detailsLabel')" class="@content:w-80 shrink-0">
          <div class="border-border divide-border divide-y rounded-lg border">
            <section class="flex flex-col gap-2 p-5">
              <h2 class="text-h4">{{ t('order.deliveryAddress') }}</h2>
              <address class="text-muted text-base not-italic">
                <p v-for="(line, index) in shippingAddress" :key="index">{{ line }}</p>
              </address>
            </section>
            <section v-if="payment" class="flex flex-col gap-2 p-5">
              <h2 class="text-h4">{{ t('order.payment') }}</h2>
              <p class="text-text flex items-center gap-2 text-base">
                <EldraIcon :name="paymentIconName(payment.brand)" size="md" />
                {{ t('order.cardEnding', { brand: payment.brand, last4: payment.last4 }) }}
              </p>
            </section>
            <section v-if="helpLinks.length > 0" class="flex flex-col gap-2 p-5">
              <h2 class="text-h4">{{ t('order.needHelp') }}</h2>
              <ul role="list" class="flex flex-col gap-1">
                <li v-for="(link, index) in helpLinks" :key="index">
                  <Link
                    :href="link.href"
                    :as="link.as"
                    variant="standalone"
                    :underline="false"
                    :classes="{ root: 'min-h-9', label: 'inline-flex items-center gap-2' }"
                  >
                    <EldraIcon v-if="link.icon" :name="link.icon" size="md" class="text-muted" />{{
                      link.label
                    }}
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </aside>
      </div>
    </Container>
  </Section>
</template>
