<script setup lang="ts">
/**
 * Top-of-page banner. `variant`:
 *  - `image-right`: two-column layout, copy left, framed image right.
 *  - `image-background`: the image fills the section; a gradient scrim over
 *    it (`bg-gradient-to-t from-text/…`) keeps `text-primary-contrast` copy
 *    readable — `text`/`primary-contrast` are both design tokens chosen for
 *    WCAG AA contrast against their pair (spec §1), so this combination
 *    stays readable across a customer's own token values, not just the
 *    starter's defaults. Without an image (the freshly-inserted state —
 *    `mock.json` never seeds media, see `docs/starter-kit.md`), there is no
 *    scrim to sit on, so the section falls back to `bg-surface-strong` with
 *    ordinary `text-text` copy instead of `text-primary-contrast`.
 *  - `centered`: single centered copy column, image (if any) below as a
 *    wide banner.
 *
 * The scrimmed variant also marks itself `class="group/section"
 * data-section="primary"`: that is `@eldrajs/ui`'s own signal for "the ground
 * here is the primary colour", and it is what turns the `Button` into a
 * `primary-contrast` fill with `primary` text and the `Link` into
 * `primary-contrast` — the same pairing the scrim is built for, with no
 * per-variant colour written into this block.
 *
 * The image always gets a `framing` value (falling back to
 * `DEFAULT_IMAGE_FRAMING`, not `undefined`) so `UiImage` always emits the
 * `data-eldra-framing*` marker attributes and the default cover style, even
 * before an editor has framed anything — matching the pre-primitives
 * behaviour this replaces (see `test/framing.spec.ts`).
 *
 * The `actions` slot is filled by `EldraLayout` (`packages/theme-vue/src/EldraLayout.ts`)
 * when a `cta` block is placed in this hero's declared `actions` zone; the
 * built-in buttons below are the fallback shown when the slot is empty.
 */
import { computed } from 'vue';
import { Button, Link } from '@eldrajs/ui';
import { DEFAULT_IMAGE_FRAMING } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import UiContainer from '../../app/components/ui/UiContainer.vue';
import UiImage from '../../app/components/ui/UiImage.vue';

const props = defineProps<{ entry: EldraBlockEntry<'hero'> }>();
const { data, entryId } = useBlockData(props, 'hero');

const variant = computed(() => data.value.variant ?? 'image-right');
const isBackground = computed(() => variant.value === 'image-background');
// `image-background` only gets the scrim + light-on-dark copy once there is
// an actual image to scrim over; a freshly-inserted block (mock.json never
// seeds media) falls back to a plain surface with ordinary body text.
const hasBackgroundImage = computed(() => isBackground.value && Boolean(data.value.image));
const framing = computed(() => data.value.image?.framing ?? DEFAULT_IMAGE_FRAMING);
const ctaHref = computed(() => safeHref(data.value.ctaHref));
const secondaryCtaHref = computed(() => safeHref(data.value.secondaryCtaHref));
/**
 * Only a same-site destination routes through the router — see `EldraRouterLink`. `Button` takes
 * the same `as` as `Link` does, so the primary CTA routes instead of reloading the document; both
 * actions in this block are gated the same way.
 */
const routerLinkAs = (href: string | null) =>
  href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
const ctaLinkAs = computed(() => routerLinkAs(ctaHref.value));
const secondaryLinkAs = computed(() => routerLinkAs(secondaryCtaHref.value));
</script>

<template>
  <section
    class="relative overflow-hidden"
    :class="
      hasBackgroundImage
        ? 'group/section text-primary-contrast'
        : isBackground
          ? 'bg-surface-strong'
          : ''
    "
    :data-section="hasBackgroundImage ? 'primary' : undefined"
  >
    <template v-if="hasBackgroundImage">
      <UiImage
        :src="data.image.url"
        :alt="data.image.altText ?? ''"
        :framing="framing"
        :entry-id="entryId"
        field-path="image"
        fill
      />
      <div
        class="from-text/85 via-text/55 to-text/35 absolute inset-0 bg-gradient-to-t"
        aria-hidden="true"
      />
    </template>

    <UiContainer
      size="wide"
      :class="[
        'py-section relative',
        variant === 'image-right' ? 'grid items-center gap-10 md:grid-cols-2' : '',
        variant === 'centered' || isBackground ? 'text-center' : '',
      ]"
    >
      <div :class="variant === 'image-right' ? 'md:order-1' : 'mx-auto max-w-2xl'">
        <p
          v-if="data.eyebrow"
          class="text-primary text-sm font-semibold tracking-wide uppercase"
          :class="hasBackgroundImage ? 'text-primary-contrast/80' : ''"
        >
          {{ data.eyebrow }}
        </p>
        <h1 class="mt-2 text-4xl font-semibold md:text-5xl">{{ data.heading }}</h1>
        <p
          v-if="data.subheading"
          class="mt-4 text-lg"
          :class="hasBackgroundImage ? 'text-primary-contrast/90' : 'text-muted'"
        >
          {{ data.subheading }}
        </p>
        <div
          class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4"
          :class="variant === 'centered' || isBackground ? 'justify-center' : ''"
        >
          <slot name="actions">
            <Button
              v-if="data.ctaLabel && ctaHref"
              :href="ctaHref"
              :as="ctaLinkAs"
              size="lg"
              variant="primary"
              >{{ data.ctaLabel }}</Button
            >
            <Link
              v-if="data.secondaryCtaLabel && secondaryCtaHref"
              :href="secondaryCtaHref"
              :as="secondaryLinkAs"
              variant="standalone"
            >
              {{ data.secondaryCtaLabel }}
            </Link>
          </slot>
        </div>
      </div>

      <UiImage
        v-if="!isBackground && data.image"
        :src="data.image.url"
        :alt="data.image.altText ?? ''"
        :framing="framing"
        :entry-id="entryId"
        field-path="image"
        :aspect="variant === 'image-right' ? '4/3' : '16/9'"
        rounded="xl"
        :class="[
          'w-full shadow-md',
          variant === 'image-right' ? 'md:order-2' : 'mx-auto mt-10 max-w-3xl',
        ]"
      />
    </UiContainer>
  </section>
</template>
