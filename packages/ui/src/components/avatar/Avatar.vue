<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { initialsFromName } from '../../utils/avatar';
import type { AvatarProps, AvatarSize } from './types';

const props = withDefaults(defineProps<AvatarProps>(), {
  src: null,
  name: null,
  size: 'md',
  decorative: true,
  classes: undefined,
});

/**
 * Diameters (spec "Avatar" → Sizes): 2rem/2.5rem/3.5rem/6rem — exact multiples of this package's
 * 0.25rem spacing unit (8/10/14/24), so, like `Icon.vue`'s own `SIZE_CLASS`, these are Tailwind's
 * stock `size-*` scale rather than a per-component variable: there is nothing here that is not
 * already a token-backed utility.
 */
const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-14',
  xl: 'size-24',
};

/** Initials type (spec "Avatar" → Sizes, "Initials (38% of diameter)" column) — see the
 * `text-avatar-initials-*` utilities in `tailwind.css` for why each size is a per-component
 * variable rather than a class-level arbitrary value. */
const INITIALS_TEXT_CLASS: Record<AvatarSize, string> = {
  sm: 'text-avatar-initials-sm',
  md: 'text-avatar-initials-md',
  lg: 'text-avatar-initials-lg',
  xl: 'text-avatar-initials-xl',
};

/** The user-icon fallback's size (spec "Avatar" → Sizes: "Icon: 1.5rem in lg (scale
 * proportionally)") — see the `eldra-avatar-icon-*` utilities in `tailwind.css`. */
const ICON_SIZE_CLASS: Record<AvatarSize, string> = {
  sm: 'eldra-avatar-icon-sm',
  md: 'eldra-avatar-icon-md',
  lg: 'eldra-avatar-icon-lg',
  xl: 'eldra-avatar-icon-xl',
};

/** `AvatarProps.src` accepts the same shorthand `ImageMedia['src']` is — a bare URL string — so a
 * caller with nothing but a photo URL does not have to wrap it in an object first. */
const resolvedSrc = computed<string | undefined>(() => {
  if (!props.src) return undefined;
  return typeof props.src === 'string' ? props.src : props.src.src;
});

/**
 * Image error fallback (API contract: "listen to the `<img>` `error` event and fall back to
 * initials/icon"). Reset whenever `src` itself changes, so a previously broken image does not
 * keep a freshly-set working one stuck on the fallback.
 */
const imageErrored = ref(false);
watch(resolvedSrc, () => {
  imageErrored.value = false;
});
function onImageError(): void {
  imageErrored.value = true;
}

/** Fallback order (spec "Avatar" → Acceptance criteria): image → initials → user icon. */
const showImage = computed(() => Boolean(resolvedSrc.value) && !imageErrored.value);
const initials = computed(() => (props.name ? initialsFromName(props.name) : ''));
const showInitials = computed(() => !showImage.value && initials.value.length > 0);

if (import.meta.env?.DEV) {
  /**
   * Spec "Avatar" → Properties, `decorative` row: `false` is "for a standalone avatar: it gets
   * `role="img"` and `aria-label` = name" — with no `name` there is nothing to put in that label,
   * and the avatar announces as an unlabelled image (WCAG 1.1.1/4.1.2), the same gap `Image.vue`
   * warns about for a missing `alt`.
   */
  watchEffect(() => {
    if (!props.decorative && !props.name) {
      console.warn(
        '[@eldrajs/ui] <Avatar :decorative="false"> has no `name`. A standalone avatar needs one ' +
          'to set `aria-label`, or it announces as an unlabelled image (WCAG 1.1.1, 4.1.2).'
      );
    }
  });
}

/**
 * Spec "Avatar" → Accessibility, 1.1.1: printed next to a name (the default, `decorative: true`)
 * → `aria-hidden="true"`, nothing else. Standalone (`decorative: false`) → `role="img"`,
 * `aria-label` set to the name. The initials/icon parts are always `aria-hidden` themselves (see
 * the template) — the accessible name, when there is one, lives on the root alone.
 */
const rootAria = computed(() =>
  props.decorative
    ? { role: undefined, 'aria-hidden': 'true' as const, 'aria-label': undefined }
    : { role: 'img' as const, 'aria-hidden': undefined, 'aria-label': props.name ?? undefined }
);

const rootClass = computed(() =>
  partClass(
    cx(
      'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-strong',
      SIZE_CLASS[props.size]
    ),
    props.classes,
    'root'
  )
);
const imageClass = computed(() =>
  partClass(cx('block h-full w-full object-cover'), props.classes, 'image')
);
const initialsClass = computed(() =>
  partClass(cx('text-text select-none', INITIALS_TEXT_CLASS[props.size]), props.classes, 'initials')
);
const iconClass = computed(() =>
  partClass(cx('text-text', ICON_SIZE_CLASS[props.size]), props.classes, 'icon')
);
</script>

<template>
  <span data-part="root" :class="rootClass" v-bind="rootAria">
    <img
      v-if="showImage"
      data-part="image"
      :class="imageClass"
      :src="resolvedSrc"
      alt=""
      aria-hidden="true"
      @error="onImageError"
    />
    <span v-else-if="showInitials" data-part="initials" :class="initialsClass" aria-hidden="true">
      {{ initials }}
    </span>
    <svg
      v-else
      data-part="icon"
      :class="iconClass"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0 -4 3 -7 7 -7s7 3 7 7" />
    </svg>
  </span>
</template>
