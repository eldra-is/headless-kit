<script setup lang="ts">
/**
 * Top-of-page banner. `variant`:
 *  - `image-right`: two-column layout, copy left, framed image right.
 *  - `image-background`: the image fills the section; a gradient scrim over
 *    it (`bg-gradient-to-t from-text/…`) keeps `text-primary-contrast` copy
 *    readable — `text`/`primary-contrast` are both design tokens chosen for
 *    WCAG AA contrast against their pair (spec §1), so this combination
 *    stays readable across a customer's own token values, not just the
 *    starter's defaults.
 *  - `centered`: single centered copy column, image (if any) below as a
 *    wide banner.
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
import { DEFAULT_IMAGE_FRAMING } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { safeHref } from '../../app/utils/links';
import { focusRing } from '../../app/utils/classes';
import UiButton from '../../app/components/ui/UiButton.vue';
import UiContainer from '../../app/components/ui/UiContainer.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import UiLink from '../../app/components/ui/UiLink.vue';

const props = defineProps<{ entry: EldraBlockEntry<'hero'> }>();
const { data, entryId } = useBlockData(props, 'hero');

const variant = computed(() => data.value.variant ?? 'image-right');
const isBackground = computed(() => variant.value === 'image-background');
const framing = computed(() => data.value.image?.framing ?? DEFAULT_IMAGE_FRAMING);
const ctaHref = computed(() => safeHref(data.value.ctaHref));
const secondaryCtaHref = computed(() => safeHref(data.value.secondaryCtaHref));

const secondaryLinkClass = computed(() => [
  focusRing,
  'rounded-theme-sm text-base font-semibold underline underline-offset-4',
  isBackground.value ? 'text-primary-contrast' : 'text-text',
]);
</script>

<template>
  <section class="relative overflow-hidden" :class="isBackground ? 'text-primary-contrast' : ''">
    <template v-if="isBackground && data.image">
      <UiImage
        :src="data.image.url"
        :alt="data.image.altText ?? ''"
        :framing="framing"
        :entry-id="entryId"
        field-path="image"
        class="absolute inset-0 h-full w-full object-cover"
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
          :class="isBackground ? 'text-primary-contrast/80' : ''"
        >
          {{ data.eyebrow }}
        </p>
        <h1 class="mt-2 text-4xl font-semibold md:text-5xl">{{ data.heading }}</h1>
        <p
          v-if="data.subheading"
          class="mt-4 text-lg"
          :class="isBackground ? 'text-primary-contrast/90' : 'text-muted'"
        >
          {{ data.subheading }}
        </p>
        <div
          class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4"
          :class="variant === 'centered' || isBackground ? 'justify-center' : ''"
        >
          <slot name="actions">
            <UiButton v-if="data.ctaLabel && ctaHref" :href="ctaHref" size="lg">{{
              data.ctaLabel
            }}</UiButton>
            <UiLink
              v-if="data.secondaryCtaLabel && secondaryCtaHref"
              :href="secondaryCtaHref"
              :class="secondaryLinkClass"
            >
              {{ data.secondaryCtaLabel }}
            </UiLink>
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
        :class="[
          'rounded-theme-xl shadow-theme-md w-full object-cover',
          variant === 'image-right' ? 'md:order-2' : 'mx-auto mt-10 max-w-3xl',
        ]"
      />
    </UiContainer>
  </section>
</template>
