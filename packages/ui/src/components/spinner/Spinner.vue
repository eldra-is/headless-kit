<!--
  The one spinner shape in this package: a 1.125rem-per-`size` circle with a quarter-turn arc in
  the current text colour, turning once every 700ms (spec "Button" → Behaviour & motion). With
  reduced motion it pulses at 60–100% opacity instead of turning — the `animate-eldra-spin` /
  `motion-reduce:animate-eldra-pulse` pair from `tailwind.css`, whose two timings are the only
  durations in the package that do not read a `--eldra-duration-*` token (the reduced-motion rule
  in `tokens.css` zeroes those, which would stop the pulse as well).

  `Button`, `LoadMore`, `Price`, `StockBadge` and the search and select panels each size and colour
  it with a plain `class`, which replaces the default 1.125rem size below (`mergeClass`, so the two
  sizes never sit on the element together). It exists because those drew the identical SVG by hand.
  The `viewBox` is 18 units wide so `stroke-width="2"` renders as exactly 2px at the 1.125rem size
  `Button` draws it at; every other size scales with it.

  Inside those components it is decorative: the state it belongs to is announced by the component's
  own `aria-busy` and live region, never by this shape, so it is `aria-hidden` unless a `label`
  names it — the same rule `Icon` follows. Named, it is `role="img"`, not a live region: whatever
  says "this is now loading" to a screen reader is the busy region around it.
-->
<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { useEldraScope } from '../../composables/useEldraScope';
import { mergeClass } from '../../utils/mergeClass';
import type { SpinnerProps } from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<SpinnerProps>(), { label: undefined });

const eldra = useEldraScope();

const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

const rootClass = computed(() =>
  mergeClass(
    'eldra:size-4.5 eldra:animate-eldra-spin eldra:motion-reduce:animate-eldra-pulse',
    attrs.class
  )
);

/** `""` names nothing, so it is decorative too. */
const named = computed(() => props.label !== undefined && props.label !== '');
</script>

<template>
  <svg
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    :class="rootClass"
    viewBox="0 0 18 18"
    fill="none"
    :role="named ? 'img' : undefined"
    :aria-label="named ? label : undefined"
    :aria-hidden="named ? undefined : 'true'"
    focusable="false"
    v-bind="forwardedAttrs"
  >
    <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="2" stroke-opacity="0.3" />
    <path d="M17 9a8 8 0 0 0-8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>
