<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import Icon from '../icon/Icon.vue';
import type { EditorPlaceholderProps } from './types';

const props = withDefaults(defineProps<EditorPlaceholderProps>(), {
  icon: null,
  help: null,
  inline: false,
  classes: undefined,
});

/**
 * The Studio page-builder's own hint for an unfilled block field (spec "Empty and error states" →
 * Variants, "Editor hint" row: "never rendered on the live site; there, an empty optional part
 * simply does not render"). It carries no ARIA role — spec → Accessibility: "Editor hints are not
 * part of the live page, so they need no roles" — because it exists only inside the editor's own
 * chrome, never in what a screen reader on the storefront ever reaches.
 */

const rootClass = computed(() =>
  partClass(
    cx(
      'eldra-editor-placeholder-border flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface text-center',
      props.inline ? 'p-4' : 'p-8'
    ),
    props.classes,
    'root'
  )
);

/** 1.5rem (spec → Sizes, "Editor hint" row) is exactly `Icon.vue`'s own `lg` size, unlike
 * `EmptyState`'s 1.75rem icon — so, unlike that component, this one draws it through the shared
 * `Icon` component instead of a hand-rolled `<svg>`. Colour (spec → States, "Editor hint" row):
 * `muted`, same as the help text. */
const iconClass = computed(() => partClass('text-muted', props.classes, 'icon'));

const labelClass = computed(() =>
  partClass('text-body-sm font-semibold text-text', props.classes, 'label')
);
const helpClass = computed(() => partClass('text-body-sm text-muted', props.classes, 'help'));
</script>

<template>
  <div data-part="root" :class="rootClass">
    <span v-if="icon" data-part="icon" :class="iconClass">
      <Icon :icon="icon" size="lg" />
    </span>
    <p data-part="label" :class="labelClass">{{ label }}</p>
    <p v-if="help" data-part="help" :class="helpClass">{{ help }}</p>
  </div>
</template>
