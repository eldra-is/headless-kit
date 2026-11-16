<script setup lang="ts">
/**
 * An inline notice: a bordered box in the page flow holding guidance or the outcome of something
 * the visitor did, with an optional icon, title and actions. It stays where it is put and has no
 * close button — a message that comes and goes on its own is a `Toast`, and an empty or failed
 * page region is an `EmptyState`.
 *
 * Not in design spec 1 (README, "Additions beyond the spec"); its visual language is the Toast
 * section's: the same four tones, the same icons at the same 1.25rem / 1.75 stroke, the same
 * 1px `radius-md` surface — without the shadow, since it does not float.
 */
import { computed, useSlots } from 'vue';
import { useEldraScope } from '../../composables/useEldraScope';
import { useSlotPresence } from '../../composables/useSlotPresence';
import {
  ALERT_CIRCLE_PATHS,
  ALERT_TRIANGLE_PATHS,
  CIRCLE_CHECK_PATHS,
  INFO_CIRCLE_PATHS,
} from '../../icons/paths';
import type { NoticeProps, NoticeTone } from './types';

const eldra = useEldraScope();

const props = withDefaults(defineProps<NoticeProps>(), {
  tone: 'info',
  title: undefined,
  text: undefined,
  icon: undefined,
  headingLevel: undefined,
  announce: true,
  classes: undefined,
});

const present = useSlotPresence(useSlots(), ['default', 'title', 'actions']);

const DEFAULT_ICON_PATHS: Record<NoticeTone, string[]> = {
  info: INFO_CIRCLE_PATHS,
  success: CIRCLE_CHECK_PATHS,
  warning: ALERT_TRIANGLE_PATHS,
  danger: ALERT_CIRCLE_PATHS,
};

/** The stroke `Toast`, `Dialog` and `Link` draw their icons with. */
const ICON_STROKE_WIDTH = 1.75;

/**
 * Polite for news, assertive only for an error: `role="status"` carries `aria-live="polite"` and
 * `role="alert"` carries `aria-live="assertive"` implicitly, so neither attribute is written.
 */
const role = computed(() => {
  if (!props.announce) return undefined;
  return props.tone === 'danger' ? 'alert' : 'status';
});

const hasIcon = computed(() => props.icon !== null);
const hasTitle = computed(() => present.value.title || !!props.title);
const hasText = computed(() => present.value.default || !!props.text);

const titleTag = computed(() => (props.headingLevel ? `h${props.headingLevel}` : 'p'));

/**
 * `info` sits on `surface` with the hairline `border`. The three coloured tones tint both from
 * their own colour role mixed toward `background`, so a store that sets `success` restyles the
 * notice with it; the text stays `text` on every tone, and the tone's full colour is only ever on
 * the icon.
 */
const TONE_SURFACE: Record<NoticeTone, string> = {
  info: 'eldra:bg-surface eldra:border-border',
  success:
    'eldra:bg-[color-mix(in_oklab,var(--eldra-color-success),var(--eldra-color-background)_92%)] ' +
    'eldra:border-[color-mix(in_oklab,var(--eldra-color-success),var(--eldra-color-background)_60%)]',
  warning:
    'eldra:bg-[color-mix(in_oklab,var(--eldra-color-warning),var(--eldra-color-background)_92%)] ' +
    'eldra:border-[color-mix(in_oklab,var(--eldra-color-warning),var(--eldra-color-background)_60%)]',
  danger:
    'eldra:bg-[color-mix(in_oklab,var(--eldra-color-danger),var(--eldra-color-background)_92%)] ' +
    'eldra:border-[color-mix(in_oklab,var(--eldra-color-danger),var(--eldra-color-background)_60%)]',
};

const TONE_ICON: Record<NoticeTone, string> = {
  info: 'eldra:text-text',
  success: 'eldra:text-success',
  warning: 'eldra:text-warning',
  danger: 'eldra:text-danger',
};

const rootClass = computed(() => [
  'eldra:flex eldra:w-full eldra:min-w-0 eldra:items-start eldra:gap-3 eldra:rounded-md eldra:border eldra:px-4 eldra:py-3 eldra:text-text',
  TONE_SURFACE[props.tone],
]);

/** 1.25rem, nudged 0.125rem down so it centres on the first line of 0.875rem / 1.5 text. */
const iconClass = computed(() => [
  'eldra:mt-0.5 eldra:flex eldra:size-5 eldra:shrink-0 eldra:items-center eldra:justify-center',
  TONE_ICON[props.tone],
  props.classes?.icon,
]);

const contentClass = computed(() => [
  'eldra:flex eldra:min-w-0 eldra:flex-1 eldra:flex-col eldra:gap-0.5',
  props.classes?.content,
]);

const titleClass = computed(() => [
  'eldra:text-body-sm eldra:m-0 eldra:min-w-0 eldra:font-semibold eldra:break-words',
  props.classes?.title,
]);

const textClass = computed(() => [
  'eldra:text-body-sm eldra:min-w-0 eldra:break-words',
  props.classes?.text,
]);

const actionsClass = computed(() => [
  'eldra:mt-2 eldra:flex eldra:flex-wrap eldra:items-center eldra:gap-3',
  props.classes?.actions,
]);
</script>

<template>
  <div
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :data-tone="tone"
    :class="rootClass"
    :role="role"
  >
    <span v-if="hasIcon" data-part="icon" :class="iconClass" aria-hidden="true">
      <component
        :is="icon"
        v-if="icon"
        class="eldra:size-5"
        :stroke-width="ICON_STROKE_WIDTH"
        aria-hidden="true"
        focusable="false"
      />
      <svg
        v-else
        class="eldra:size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="ICON_STROKE_WIDTH"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path v-for="d in DEFAULT_ICON_PATHS[tone]" :key="d" :d="d" />
      </svg>
    </span>
    <div data-part="content" :class="contentClass">
      <component
        :is="titleTag"
        v-if="hasTitle"
        :data-eldra-slot="eldra.slotHost('title')"
        data-part="title"
        :class="titleClass"
      >
        <slot name="title">{{ title }}</slot>
      </component>
      <div
        v-if="hasText"
        :data-eldra-slot="eldra.slotHost('default')"
        data-part="text"
        :class="textClass"
      >
        <slot>{{ text }}</slot>
      </div>
      <div
        v-if="present.actions"
        :data-eldra-slot="eldra.slotHost('actions')"
        data-part="actions"
        :class="actionsClass"
      >
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
