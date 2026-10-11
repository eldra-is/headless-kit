<script setup lang="ts">
/**
 * The quick-add bar (spec `02-blocks.md` "Product detail" → Layout, "Sticky buy bar (below
 * 48rem)"): pinned to the bottom once the main Add to cart button has scrolled out of view, so the
 * price and the action stay reachable while the shopper reads the tabs.
 *
 * **Not rendered, not merely hidden.** Spec Keyboard & accessibility: "While the main Add to cart
 * button is on screen the bar is hidden (not rendered), so it is absent from the accessibility tree
 * and tab order and never duplicates the control." So visibility is `v-if`, not a `hidden` class,
 * and `visible` starts `true` (the main button is on screen when the page loads) — which also makes
 * "no `IntersectionObserver` in this environment" degrade to the right answer: no bar at all,
 * rather than a permanently pinned duplicate of a control that is already on screen.
 *
 * `IntersectionObserver` is guarded and created in `onMounted`, so this renders identically under
 * SSR/prerender and in jsdom, where the constructor does not exist. Below 48rem of *block* width is
 * a container query (`@tablet:hidden`), the block's own width like every other breakpoint in this
 * theme — never a viewport media query.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Button } from '@eldrajs/ui';
import UiImage from '../../../app/components/ui/UiImage.vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  /** The main Add to cart button. The bar shows only while this is off screen. */
  target: HTMLElement | null;
  title: string;
  /** "Oat / M · $96.00", already assembled and formatted by the block. */
  meta: string;
  /** The main button's own label, so the bar never offers a different action. */
  actionLabel: string;
  image?: { src: string; alt: string } | null;
  pending: boolean;
}>();

const emit = defineEmits<{ add: [] }>();

const { t } = useI18n();

/** Whether the main button is on screen. Starts `true`: see the module comment. */
const targetVisible = ref(true);

let observer: IntersectionObserver | null = null;

function observe(): void {
  observer?.disconnect();
  observer = null;
  if (typeof IntersectionObserver === 'undefined') return;
  const target = props.target;
  if (target === null) return;
  observer = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (entry !== undefined) targetVisible.value = entry.isIntersecting;
  });
  observer.observe(target);
}

onMounted(observe);
// The main button is re-created whenever the action changes (Add to cart ⇄ Notify me), so the
// observer has to follow the new element rather than hold a reference to a detached one.
watch(() => props.target, observe);
onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div
    v-if="!targetVisible"
    role="region"
    :aria-label="t('product.quickAdd')"
    class="border-border bg-background @tablet:hidden z-sticky fixed inset-x-0 bottom-0 flex items-center gap-3 border-t px-4 py-3 shadow-md"
  >
    <UiImage
      v-if="image"
      :src="image.src"
      :alt="image.alt"
      aspect="1/1"
      class="w-11 shrink-0"
      :classes="{ frame: 'rounded-sm' }"
    />
    <div class="min-w-0 flex-1 text-[0.875rem] leading-[1.35]">
      <p class="truncate font-semibold">{{ title }}</p>
      <p class="text-muted">{{ meta }}</p>
    </div>
    <Button
      type="button"
      variant="primary"
      size="lg"
      :loading="pending"
      :label="actionLabel"
      class="shrink-0"
      @click="emit('add')"
    >
      {{ actionLabel }}
    </Button>
  </div>
</template>
