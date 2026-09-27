<script setup lang="ts">
/**
 * The cart's line items: one `<ul>` labelled "Items in your cart", each row a thumbnail, the title
 * as a routed link, the variant, the unit price ("$28.00 each" above quantity 1), the line total, a
 * quantity stepper and a remove button (spec `02-blocks.md` "Cart" → Layout, "Line item").
 *
 * **One grid, two shapes, no viewport query.** Below 48rem of *container* width the row is the
 * spec's `5rem | 1fr | auto` two-row grid (the thumbnail spanning both rows, info and line total on
 * the first, the controls on the second); from 48rem it becomes the page's single `6rem | 1fr |
 * 11rem | 6rem` row. The drawer never reaches that edge: `Block.vue` makes the drawer body itself
 * the `@container` and the panel is at most 26rem wide, so the same classes resolve to the compact
 * shape there at every viewport size — which is why this component needs no "which shell am I in"
 * prop for its layout. The stepper and the remove button follow the same edge: the package's `sm`
 * metrics (2rem) from 48rem, 2.75rem below it (`size-11`, the same utility the package's own
 * `Drawer` close button uses for that edge — spec Acceptance: "Remove
 * buttons and steppers are 2.75rem below 48rem; the sm stepper and remove button are 2rem from
 * 48rem").
 *
 * **The stepper's group name.** `QuantityStepper` names its own buttons ("Decrease quantity,
 * Speckled latte mug" — its `itemName` prop) and its input ("Quantity"), but its root is a plain
 * `<div>`: the package draws no `role="group"` of its own. The spec asks for one named "Quantity,
 * Speckled latte mug", so the theme wraps the stepper in that group rather than reaching into the
 * package; the wrapper also carries the `aria-busy` the spec puts on the stepper while the backend
 * recalculates, alongside the one on the line total.
 *
 * **Removal.** `cart.remove()`, then — once the list has re-rendered — focus moves to the title link
 * of whatever line now sits at the removed row's index (the next item), or the previous one when the
 * last row went; with nothing left, the `removing` event this emits first is what lets `Block.vue`
 * move focus into the empty state's heading instead (spec Accessibility: "After removal, focus moves
 * to the next item's title link, or to the empty-state heading"). Focus is looked up by the surviving line's own id rather
 * than by row position, because the removed row is still in the DOM while its leave transition
 * plays. The Undo toast carries a fixed id, so removing two lines in quick succession replaces the
 * toast in place instead of stacking two — the store keeps a single `lastRemoved` slot, so only the
 * newest removal could be undone anyway. Nothing here focuses the toast: `useToast` only queues it,
 * and the mounted `Toaster` renders it without moving focus.
 *
 * A line whose product has no photo passes an empty `src`, which `UiImage` turns into `Image`'s own
 * "No image" placeholder (spec States, "No image") rather than an `<img>` pointing at nothing; the
 * empty `alt` keeps it decorative, since the title beside it already names the row.
 *
 * The leave transition is a fade rather than a height collapse: a grid row's height is `auto`, and
 * `auto → 0` is not interpolable without inventing a literal max-height, so this animates what can
 * be animated honestly and stays instant under reduced motion (`motion-safe:` only).
 */
import { computed, nextTick, ref } from 'vue';
import { Button, Link, Price, QuantityStepper, VisuallyHidden, useToast } from '@eldrajs/ui';
import type { StorefrontCartLine } from '../../../app/storefront/types';
import { useStorefront } from '../../../app/composables/useStorefront';
import { useT } from '../../../app/composables/useT';
import EldraIcon from '../../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../../app/components/EldraRouterLink.vue';
import UiImage from '../../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../../app/utils/links';

const props = defineProps<{ lines: StorefrontCartLine[] }>();

const emit = defineEmits<{
  /**
   * A line is on its way out of the cart, emitted before the store is asked to remove it. The host
   * uses it to tell an empty state caused by a removal — whose heading is then where focus belongs
   * (spec Accessibility) — from an empty cart that simply arrived that way. It cannot be an
   * "emptied" event after the fact: removing the last line unmounts this component with it, and
   * Vue drops an `emit` from an unmounted instance.
   */
  removing: [];
}>();

const t = useT();
const cart = useStorefront().cart;
const toast = useToast();

const rootEl = ref<HTMLElement | null>(null);

/** One shared flag: the store reports a single `pending` for the whole cart rather than one per
 *  line, so every stepper and line total reads busy while any update is in flight. */
const busy = computed(() => (cart.pending.value ? 'true' : undefined));

function hrefFor(line: StorefrontCartLine): string | null {
  return safeHref(line.url);
}

function linkAs(line: StorefrontCartLine): typeof EldraRouterLink | undefined {
  const href = hrefFor(line);
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
}

function removeLabel(line: StorefrontCartLine): string {
  const variant = line.variantLabel.trim();
  return variant === ''
    ? t('cart.removeItem', { title: line.title })
    : t('cart.removeItemVariant', { title: line.title, variant });
}

function onQuantity(line: StorefrontCartLine, quantity: number): void {
  if (quantity === line.quantity) return;
  void cart.setQuantity(line.id, quantity);
}

/** The first control of the row belonging to `lineId` — its title link, or whatever else that row
 *  offers should a line ever arrive without a usable URL (`Link` renders plain text without one). */
function focusLine(lineId: string | undefined): boolean {
  if (lineId === undefined) return false;
  const row = rootEl.value?.querySelector(`[data-line-id="${lineId}"]`);
  const target = row?.querySelector<HTMLElement>('a[href], button, input');
  if (!target) return false;
  target.focus();
  return true;
}

async function onRemove(line: StorefrontCartLine, index: number): Promise<void> {
  emit('removing');
  await cart.remove(line.id);
  if (cart.error.value !== null) return;
  toast.show({
    id: 'cart-line-removed',
    title: t('cart.removed', { title: line.title }),
    action: { label: t('cart.undo'), onActivate: () => void cart.undoRemove() },
  });
  // What is left is read from the store, not from `lines`: that prop only catches up with the
  // store on the host's next render, which is the render being waited for below. With nothing left
  // there is no row to move focus to — the host's own empty state took over, and `removing` (above)
  // is what told it to put focus in its heading.
  const remaining = cart.lines.value;
  await nextTick();
  if (!focusLine(remaining[index]?.id)) focusLine(remaining[index - 1]?.id);
}

/** Spec Layout, "Line item": the two-row compact grid, one row from 48rem of container width. */
const ROW_CLASS =
  'border-border grid grid-cols-[5rem_1fr_auto] items-start gap-x-3 gap-y-4 border-b py-5 ' +
  'last:border-b-0 @tablet:grid-cols-[6rem_1fr_11rem_6rem] @tablet:items-center @tablet:gap-x-4';

/** The compact/`sm` pair the spec's target sizes ask for, per stepper part. */
const STEPPER_CLASSES = {
  decrease: '@max-tablet:size-11',
  increase: '@max-tablet:size-11',
  input: '@max-tablet:w-11 @max-tablet:text-stepper-value',
};
</script>

<template>
  <ul ref="rootEl" :aria-label="t('cart.items')" class="min-w-0">
    <TransitionGroup
      leave-active-class="motion-safe:transition-opacity motion-safe:duration-base motion-safe:ease-out"
      leave-to-class="motion-safe:opacity-0"
    >
      <li
        v-for="(line, index) in props.lines"
        :key="line.id"
        :data-line-id="line.id"
        :class="ROW_CLASS"
      >
        <div class="@tablet:row-span-1 col-start-1 row-span-2 row-start-1">
          <UiImage
            :src="line.image?.src ?? ''"
            :alt="line.image?.alt ?? ''"
            aspect="4/5"
            sizes="6rem"
            :classes="{ frame: 'rounded-md' }"
          />
        </div>

        <div class="col-start-2 row-start-1 grid min-w-0 gap-0.5">
          <Link
            v-if="hrefFor(line)"
            :href="hrefFor(line) ?? undefined"
            :as="linkAs(line)"
            :underline="false"
            class="text-text text-base font-semibold hover:underline"
          >
            {{ line.title }}
          </Link>
          <p v-else class="text-text text-base font-semibold">{{ line.title }}</p>
          <p v-if="line.variantLabel" class="text-muted text-body-sm">{{ line.variantLabel }}</p>
          <div v-if="line.quantity > 1" class="text-body-sm flex flex-wrap gap-x-1">
            <Price
              :amount="line.unitPrice"
              size="sm"
              :classes="{ root: 'inline', current: 'text-muted' }"
            />
            <span class="text-muted">{{ t('cart.each') }}</span>
          </div>
        </div>

        <div
          class="text-text @tablet:col-start-4 col-start-3 row-start-1 justify-self-end text-base font-semibold tabular-nums"
          :aria-busy="busy"
        >
          <VisuallyHidden>{{ t('cart.lineTotal') }}</VisuallyHidden>
          <Price :amount="line.lineTotal" :classes="{ root: 'inline' }" />
        </div>

        <div
          class="@tablet:col-span-1 @tablet:col-start-3 @tablet:row-start-1 @tablet:justify-self-start col-span-2 col-start-2 row-start-2 flex items-center gap-2"
        >
          <div
            role="group"
            :aria-label="t('cart.quantityFor', { title: line.title })"
            :aria-busy="busy"
          >
            <QuantityStepper
              size="sm"
              :model-value="line.quantity"
              :max="line.max ?? undefined"
              :item-name="line.title"
              :classes="STEPPER_CLASSES"
              @change="(value: number) => onQuantity(line, value)"
            />
          </div>
          <Button
            icon-only
            variant="ghost"
            size="sm"
            class="@max-tablet:size-11"
            :label="removeLabel(line)"
            @click="onRemove(line, index)"
          >
            <template #leadingIcon>
              <EldraIcon name="trash" size="sm" />
            </template>
          </Button>
        </div>
      </li>
    </TransitionGroup>
  </ul>
</template>
