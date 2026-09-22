<script setup lang="ts">
/**
 * Banner with heading, supporting copy and one or two buttons. `variant`:
 *  - `primary`: solid `bg-primary` card, centered copy.
 *  - `subtle`: `bg-surface` card, centered copy.
 *  - `split`: bordered card, copy left and buttons right on `md`+ (stacked
 *    on mobile).
 * The primary button always uses a self-contained `UiButton` variant (never
 * hand-overridden colours — see `UiDialog`'s note on why stacking
 * conflicting utility classes is unsafe); the secondary action is a plain
 * underlined link so its colour only ever needs one token pairing
 * (`text-primary-contrast` on `primary`, both chosen for WCAG AA contrast —
 * spec §1 — or `text-text` elsewhere).
 */
import { computed } from 'vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { safeHref } from '../../app/utils/links';
import { focusRing } from '../../app/utils/classes';
import UiButton from '../../app/components/ui/UiButton.vue';
import UiLink from '../../app/components/ui/UiLink.vue';
import UiSection from '../../app/components/ui/UiSection.vue';

const props = defineProps<{ entry: EldraBlockEntry<'cta'> }>();
const { data } = useBlockData(props, 'cta');

const variant = computed(() => data.value.variant ?? 'primary');
const isPrimary = computed(() => variant.value === 'primary');
const isSplit = computed(() => variant.value === 'split');
const buttonHref = computed(() => safeHref(data.value.buttonHref));
const secondaryButtonHref = computed(() => safeHref(data.value.secondaryButtonHref));

const secondaryLinkClass = computed(() => [
  focusRing,
  'rounded-theme-sm text-base font-semibold underline underline-offset-4',
  isPrimary.value ? 'text-primary-contrast' : 'text-text',
]);
</script>

<template>
  <UiSection spacing="md" container-size="wide">
    <div
      class="rounded-theme-xl px-8 py-12 md:px-12"
      :class="[
        isPrimary ? 'bg-primary text-primary-contrast' : '',
        variant === 'subtle' ? 'bg-surface text-text' : '',
        isSplit
          ? 'border-border bg-background text-text border md:flex md:items-center md:justify-between md:gap-10'
          : '',
      ]"
    >
      <div :class="isSplit ? '' : 'mx-auto max-w-2xl text-center'">
        <h2 class="text-3xl font-semibold md:text-4xl">{{ data.heading }}</h2>
        <p
          v-if="data.body"
          class="mt-3 text-lg"
          :class="isPrimary ? 'text-primary-contrast/90' : 'text-muted'"
        >
          {{ data.body }}
        </p>
      </div>
      <div
        class="flex flex-wrap items-center gap-x-6 gap-y-4"
        :class="isSplit ? 'mt-6 shrink-0 md:mt-0' : 'mt-8 justify-center'"
      >
        <UiButton
          v-if="data.buttonLabel && buttonHref"
          :href="buttonHref"
          size="lg"
          :variant="isPrimary ? 'secondary' : 'primary'"
        >
          {{ data.buttonLabel }}
        </UiButton>
        <UiLink
          v-if="data.secondaryButtonLabel && secondaryButtonHref"
          :href="secondaryButtonHref"
          :class="secondaryLinkClass"
        >
          {{ data.secondaryButtonLabel }}
        </UiLink>
      </div>
    </div>
  </UiSection>
</template>
