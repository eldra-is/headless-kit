<script setup lang="ts">
import { computed } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import type { LogoItemProps } from './types';

const props = withDefaults(defineProps<LogoItemProps>(), {
  logo: null,
  href: null,
  linkContext: null,
  as: undefined,
  classes: undefined,
});

const messages = useMessages();

/**
 * Spec "Logo item" → Anatomy: "Cell: a centred grid cell (`<li>`, or an `<a>` inside the `<li>`
 * when linked)." `<ul role="list">` only reads as a list to assistive tech when its children are
 * real `<li>` elements (or carry `role="listitem"`, which a bare `<a>` does not get for free) —
 * `<a>` is not valid direct content of `<ul>` at all — so this component always renders a real
 * `<li>`, unlike `Link`'s span/`a` tag swap. What moves is which element is the *cell*, i.e. which
 * one carries `data-part="root"` and the cell's own box (spec "Sizes": min-height 4rem, padding
 * 0.75rem block / 1rem inline, centred): unlinked, the `<li>` itself is the cell, so this content
 * renders straight inside it; linked, the cell has to be the interactive element itself (2.5.8:
 * "linked cells are at least 4rem tall" is about the *target*, not just the gutter around it, and
 * the focus ring has to hug what's actually focusable) — so the `<a>`/`as` gets the cell's box and
 * the `eldra-focus` ring, and the outer `<li>` is bare, sized to fit it exactly. Either way `root`
 * is one element with one class list (`rootClass` below); the bare wrapping `<li>` in the linked
 * case has no data-part of its own — it carries no styling and nothing in `classes` describes it.
 */
const hasHref = computed(
  () => props.href !== null && props.href !== undefined && props.href !== ''
);

/** Same contract as `Link`'s `as` (see `Link.vue`): a string tag still takes `href`; a component
 * takes the destination as `to`, matching Vue Router / NuxtLink. */
const isComponentAs = computed(() => props.as !== undefined && typeof props.as !== 'string');
const cellTag = computed(() => props.as ?? 'a');
const cellAttrs = computed(() => {
  if (!hasHref.value) return {};
  return isComponentAs.value ? { to: props.href } : { href: props.href };
});

/**
 * `LogoItemProps` has no `external` prop the way `Link` does — the spec's default `linkContext`
 * ("` (stockist site)`") is keyed to the href itself ("when `href` is external"), so with no
 * caller-supplied flag the component has to judge this from the string. An absolute URL (a scheme
 * like `https:`, or a protocol-relative `//`) leaves the store; anything else — a root-relative
 * path, a hash, a query — stays on it. Good enough for the spec's own examples and conservative:
 * it never *adds* the hidden context to a same-site link, which would be the more visible mistake.
 */
function isExternalHref(href: string): boolean {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(href);
}

const isExternal = computed(() => hasHref.value && isExternalHref(props.href as string));

/**
 * Spec "Logo item" → Properties, `linkContext`: default `" (stockist site)"` when `href` is
 * external, otherwise nothing. `null`/omitted (the default) means "decide automatically"; any
 * given string — including `''`, a deliberate opt-out on an otherwise-external href — always wins
 * and is rendered verbatim, the same convention as `Badge`'s `hiddenSuffix`, so the caller
 * supplies their own leading space.
 */
const hasExplicitContext = computed(
  () => props.linkContext !== null && props.linkContext !== undefined
);
const resolvedContext = computed(() => {
  if (hasExplicitContext.value) return props.linkContext as string;
  return isExternal.value ? messages.value.stockistSite : '';
});
const showContext = computed(() => hasHref.value && resolvedContext.value !== '');

const hasLogo = computed(() => Boolean(props.logo));

/**
 * The cell (spec "Logo item" → Sizes, "Behaviour & motion"): centred, at least 4rem tall,
 * `space-3`/`space-4` padding. Linked only: the `group` hover scope the image/wordmark read,
 * `radius-md` for the focus ring's corners, and `eldra-focus` itself — which owns this element's
 * transition list (see `src/styles/tailwind.css` and `src/__tests__/focus-transition.spec.ts`), so
 * no `transition-*` utility joins it here. The image and wordmark below are separate elements and
 * carry their own opacity/colour transitions.
 */
const rootClass = computed(() =>
  partClass(
    cx(
      'flex flex-col items-center justify-center min-h-16 py-3 px-4 text-center',
      hasHref.value && 'group rounded-md eldra-focus'
    ),
    props.classes,
    'root'
  )
);

/**
 * The monochrome treatment (spec "Logo item" → Anatomy, States): greyscale + 110% contrast at 75%
 * opacity, contained within 2.5rem × 9rem (never cropped or stretched — `object-contain`, no fixed
 * frame the way `Image` has one). Neither dimension matches a shared spacing step (`space-8` is
 * 2rem, `space-16` is 4rem; nothing sits at 2.5rem or 9rem), so each is its own component variable
 * with the spec's literal default, the same shape as `Button`'s `--eldra-button-font-size-lg`.
 * Hover only raises the opacity (spec: "hover on a linked item raises them to 100%") — the
 * grey/contrast treatment itself never changes, linked or not.
 */
const imageClass = computed(() =>
  partClass(
    cx(
      'block h-auto w-auto object-contain grayscale contrast-[1.1] opacity-75',
      'max-h-[var(--eldra-logo-image-max-height,2.5rem)]',
      'max-w-[var(--eldra-logo-image-max-width,9rem)]',
      'transition-opacity duration-fast ease-out motion-reduce:transition-none',
      hasHref.value && 'group-hover:opacity-100'
    ),
    props.classes,
    'image'
  )
);

/**
 * The wordmark fallback (spec "Logo item" → Sizes, "Wordmark" row): heading family, 1.25rem,
 * weight 700, line-height 1.15, letter-spacing −0.01em, balanced wrapping. No shared type-scale
 * token gives that exact combination, but three of its four dimensions individually match ones
 * that do — `h1`/`h2`'s weight (700), `h2`'s line-height (1.15), `h3`'s tracking (−0.01em) — so
 * `text-logo-wordmark` (`tailwind.css`) reuses those three tokens directly and only the 1.25rem
 * size is a new, literal-default component variable, the same "reuse what matches, one new
 * variable for what doesn't" shape as `text-card-title`/`text-stepper-value`. `muted` turning
 * `text` on hover is the same colour rule `Link`'s `muted` tone uses.
 */
const wordmarkClass = computed(() =>
  partClass(
    cx(
      'text-logo-wordmark text-balance text-muted',
      'transition-colors duration-fast ease-out motion-reduce:transition-none',
      hasHref.value && 'group-hover:text-text'
    ),
    props.classes,
    'wordmark'
  )
);

const srTextClass = computed(() => partClass('sr-only', props.classes, 'srText'));
</script>

<template>
  <li :data-part="hasHref ? undefined : 'root'" :class="hasHref ? undefined : rootClass">
    <component :is="cellTag" v-if="hasHref" data-part="root" :class="rootClass" v-bind="cellAttrs">
      <img
        v-if="hasLogo"
        data-part="image"
        :class="imageClass"
        :src="logo!.src"
        :srcset="logo!.srcset"
        :sizes="logo!.sizes"
        :width="logo!.width"
        :height="logo!.height"
        :alt="name"
        loading="lazy"
        decoding="async"
      />
      <span v-else data-part="wordmark" :class="wordmarkClass">{{ name }}</span>
      <span v-if="showContext" data-part="srText" :class="srTextClass">{{ resolvedContext }}</span>
    </component>
    <template v-else>
      <img
        v-if="hasLogo"
        data-part="image"
        :class="imageClass"
        :src="logo!.src"
        :srcset="logo!.srcset"
        :sizes="logo!.sizes"
        :width="logo!.width"
        :height="logo!.height"
        :alt="name"
        loading="lazy"
        decoding="async"
      />
      <span v-else data-part="wordmark" :class="wordmarkClass">{{ name }}</span>
    </template>
  </li>
</template>
