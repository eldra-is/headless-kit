<script setup lang="ts">
import { computed } from 'vue';
import { useEldraScope } from '../../composables/useEldraScope';
import { TAG_SHAPE, tagPadding } from '../../utils/tagRecipe';
import type { MultiSelectPart, SelectOption } from './types';

/**
 * A multi-select's chosen values as removable chips: below the control, or inside its field
 * (`inside`, where `more` counts the chips `maxTagRows` hides and the list is `display: contents`,
 * so its chips wrap in the field's own row with the trigger). Internal, so `MultiSelect` draws the
 * one list in either place.
 */
const props = defineProps<{
  options: SelectOption[];
  id: string;
  label: string;
  labelledBy?: string;
  inside: boolean;
  classes?: Partial<Record<MultiSelectPart, string>>;
  removable: boolean;
  removeLabel: (label: string) => string;
  more: number;
  moreLabel: string;
}>();

const emit = defineEmits<{
  /** A remove button, or a `tagItem` slot's `remove`: deselect and return focus to the trigger. */
  remove: [value: string];
  /** A `tag` slot's `remove`: deselect only. */
  deselect: [value: string];
}>();

const eldra = useEldraScope();

/**
 * `tagRecipe`'s `TAG_FILL` and `TAG_REMOVE_BUTTON`, with each colour read through a
 * `--eldra-select-tag-*` variable that falls back to the token the recipe uses, so a consumer
 * recolours these tags without re-theming the `tag` slot's content or `Chip`.
 */
const SELECT_TAG_FILL = [
  'eldra:bg-[color:var(--eldra-select-tag-background,var(--eldra-color-surface-strong))]',
  'eldra:text-[color:var(--eldra-select-tag-text,var(--eldra-color-text))]',
];
const SELECT_TAG_REMOVE_BUTTON = [
  'eldra:inline-flex eldra:size-6 eldra:shrink-0 eldra:cursor-pointer eldra:items-center eldra:justify-center eldra:rounded-full',
  'eldra:text-[color:var(--eldra-select-tag-muted,var(--eldra-color-muted))]',
  'eldra:hover:text-[color:var(--eldra-select-tag-text,var(--eldra-color-text))]',
  'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-select-tag-text,var(--eldra-color-text)),transparent_89%)]',
  'eldra:eldra-focus',
];

/**
 * Spec "Multi-select" → Sizes, Tags: "small chips: min 1.75rem tall, 0.8125rem text, 0.625rem start
 * padding, `surface-strong` fill, `radius-full`. … The list wraps with a 0.375rem gap, 0.25rem
 * below the control." The chip and its remove button are the same recipe `Chip`'s own `sm` size
 * draws — see `src/utils/tagRecipe.ts`.
 */
const tagsClass = computed(() => [
  props.inside
    ? 'eldra:contents eldra:list-none'
    : 'eldra:mt-1 eldra:flex eldra:list-none eldra:flex-wrap eldra:gap-1.5 eldra:p-0',
  props.classes?.tags,
]);

/** The inside list's "+N": a tag's shape and fill, no remove button. */
const tagMoreClass = computed(() => [
  SELECT_TAG_FILL,
  TAG_SHAPE,
  tagPadding(false),
  'eldra:relative eldra:z-1 eldra:select-none',
  props.classes?.tagMore,
]);

/** A disabled option's tag is fixed, as its row in the panel is: no remove button, no end inset. */
const tagClass = (option: SelectOption) => [
  SELECT_TAG_FILL,
  TAG_SHAPE,
  tagPadding(props.removable && !option.disabled),
  // A flex item never shrinks below its content unless told to: this lets a label longer than
  // the row truncate instead of pushing its remove button (and the field's end) out of view.
  'eldra:min-w-0',
  // While "+N" follows inside, a long tag truncates short of the row so the pill can share it.
  props.inside && props.more > 0 ? 'eldra:max-w-[calc(100%-3rem)]' : 'eldra:max-w-full',
  // Inside, above the trigger that lies under the tags across the field (it comes later in the
  // DOM, so without a z-index it would paint over them and take their clicks).
  props.inside && 'eldra:relative eldra:z-1',
  props.classes?.tag,
];

/** A `tagItem` slot draws its own chip, so its `<li>` carries no fill, shape or padding. */
const tagItemClass = computed(() => [
  'eldra:flex eldra:min-w-0 eldra:max-w-full',
  props.inside && 'eldra:relative eldra:z-1',
  props.classes?.tag,
]);

/** "Remove button 1.5rem circle with a 0.875rem icon (hover `text` at 11%)." */
const tagRemoveClass = computed(() => [SELECT_TAG_REMOVE_BUTTON, props.classes?.tagRemove]);
</script>

<template>
  <!-- Spec → Accessibility: "a `<ul>` named 'Selected <label>'. Each chip's remove control is a
       real `<button type="button">` named 'Remove <label>'." `role="list"` keeps that name when
       the inside layout sets the list to `display: contents`. -->
  <ul
    :id="id"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    role="list"
    data-part="tags"
    :class="tagsClass"
    :aria-label="label"
    :aria-labelledby="labelledBy ? `${id} ${labelledBy}` : undefined"
  >
    <!-- `tagItem` replaces the whole chip, remove button included: the consumer then owns an
         accessible remove control, and `remove` returns focus to the trigger like ours does. -->
    <template v-if="$slots.tagItem">
      <li
        v-for="option in options"
        :key="option.value"
        :data-eldra-slot="eldra.slotHost('tagItem')"
        data-part="tag"
        :class="tagItemClass"
      >
        <slot
          name="tagItem"
          :option="option"
          :remove="() => emit('remove', option.value)"
          :removable="removable && !option.disabled"
          :remove-label="removeLabel(option.label)"
        />
      </li>
    </template>
    <template v-else>
      <li
        v-for="option in options"
        :key="option.value"
        :data-eldra-slot="eldra.slotHost('tag')"
        data-part="tag"
        :class="tagClass(option)"
      >
        <slot name="tag" :option="option" :remove="() => emit('deselect', option.value)">
          <span class="eldra:min-w-0 eldra:truncate">{{ option.label }}</span>
        </slot>
        <button
          v-if="removable && !option.disabled"
          :data-eldra-scope="eldra.scope"
          data-part="tagRemove"
          type="button"
          :class="tagRemoveClass"
          :aria-label="removeLabel(option.label)"
          @click="emit('remove', option.value)"
        >
          <!-- Tabler's `x` at 0.875rem. Decorative: the button is named above. -->
          <svg
            class="eldra:size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M18 6l-12 12" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </li>
    </template>
    <li v-if="more > 0" data-part="tagMore" :class="tagMoreClass">{{ moreLabel }}</li>
  </ul>
</template>
