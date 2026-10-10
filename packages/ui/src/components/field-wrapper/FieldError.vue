<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';

/**
 * A field's error row: the `alert-circle` icon and the message, as the design spec's Field wrapper
 * section sizes them (0.8125rem / 1.45, weight 500, `danger`, the icon top-aligned and 0.3125rem
 * from the text — `gap-1.25` on the 0.25rem step).
 *
 * **Internal.** It is not exported from the package and has no props of its own beyond the wiring:
 * it exists because `FieldWrapper` and `CheckboxGroup` draw the same row, and a hand-copied
 * `<svg>` in two files is a path drifting apart. Both keep their own `error` and `errorIcon`
 * parts — the `data-part`s and the `classes` keys are the *parent's*, not this component's, which
 * is why the parent's `classes` object is handed straight through.
 *
 * The row is linked by id, never a live region: the spec's Accessibility notes put the error in
 * `aria-describedby` so it is announced on focus, and leave announcing a failed submit to the
 * form's own error summary. A `role="alert"` here would read every error again the moment it
 * rendered.
 */
const props = defineProps<{
  /** The id the field points at with `aria-describedby`. */
  id?: string;
  /** Extra classes for the row — the inline form's full-width row. */
  rowClass?: string;
  /** The parent's per-part overrides. Only `error` and `errorIcon` are read. */
  classes?: Partial<Record<'error' | 'errorIcon', string>>;
}>();

const errorClass = computed(() =>
  partClass(
    cx('text-field-note text-danger flex items-start gap-1.25 font-medium', props.rowClass),
    props.classes,
    'error'
  )
);

/** 1rem, nudged 0.1em down so it sits on the text rather than above it. */
const errorIconClass = computed(() =>
  partClass('size-4 shrink-0 translate-y-[0.1em]', props.classes, 'errorIcon')
);
</script>

<template>
  <p :id="id" data-part="error" :class="errorClass">
    <!-- Tabler's `alert-circle`, stroke 1.75, at 1rem. Decorative: the message is the text. -->
    <svg
      data-part="errorIcon"
      :class="errorIconClass"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
    <span><slot /></span>
  </p>
</template>
