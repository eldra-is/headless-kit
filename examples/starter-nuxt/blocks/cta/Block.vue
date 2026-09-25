<script setup lang="ts">
/**
 * Banner with heading, supporting copy and one or two buttons. `variant`:
 *  - `primary`: solid `bg-primary` card, centered copy.
 *  - `subtle`: `bg-surface` card, centered copy.
 *  - `split`: bordered card, copy left and buttons right on `md`+ (stacked
 *    on mobile).
 *
 * The actions are `@eldrajs/ui`'s `Button` and `Link`, so neither carries a
 * hand-written colour: the `primary` card marks itself
 * `class="group/section" data-section="primary"`, which is the package's own
 * signal for "this ground is the primary colour" — the button inverts to a
 * `primary-contrast` fill with `primary` text and the link takes
 * `primary-contrast`, both WCAG AA against that ground by the token pairing
 * (spec §1). On the other two variants the same markup is the ordinary
 * primary button and `text` link.
 */
import { computed } from 'vue';
import { Button, Link } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import UiSection from '../../app/components/ui/UiSection.vue';

const props = defineProps<{ entry: EldraBlockEntry<'cta'> }>();
const { data } = useBlockData(props, 'cta');

const variant = computed(() => data.value.variant ?? 'primary');
const isPrimary = computed(() => variant.value === 'primary');
const isSplit = computed(() => variant.value === 'split');
const buttonHref = computed(() => safeHref(data.value.buttonHref));
const secondaryButtonHref = computed(() => safeHref(data.value.secondaryButtonHref));
/**
 * Only a same-site destination routes through the router — see `EldraRouterLink`. `Button` takes
 * the same `as` as `Link` does, so the primary action routes instead of reloading the document;
 * both actions in this block are gated the same way.
 */
const routerLinkAs = (href: string | null) =>
  href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
const buttonLinkAs = computed(() => routerLinkAs(buttonHref.value));
const secondaryLinkAs = computed(() => routerLinkAs(secondaryButtonHref.value));
</script>

<template>
  <UiSection spacing="md" container-size="wide">
    <div
      class="rounded-xl px-8 py-12 md:px-12"
      :class="[
        isPrimary ? 'group/section bg-primary text-primary-contrast' : '',
        variant === 'subtle' ? 'bg-surface text-text' : '',
        isSplit
          ? 'border-border bg-background text-text border md:flex md:items-center md:justify-between md:gap-10'
          : '',
      ]"
      :data-section="isPrimary ? 'primary' : undefined"
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
        <Button
          v-if="data.buttonLabel && buttonHref"
          :href="buttonHref"
          :as="buttonLinkAs"
          size="lg"
          variant="primary"
        >
          {{ data.buttonLabel }}
        </Button>
        <Link
          v-if="data.secondaryButtonLabel && secondaryButtonHref"
          :href="secondaryButtonHref"
          :as="secondaryLinkAs"
          variant="standalone"
        >
          {{ data.secondaryButtonLabel }}
        </Link>
      </div>
    </div>
  </UiSection>
</template>
