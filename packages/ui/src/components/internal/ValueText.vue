<script setup lang="ts">
import { ref, watch } from 'vue';
import { fadeInChangedValue } from '../../utils/valueFade';

/**
 * One value's text, with the refresh fade attached to it: `Price`'s amount and compare-at,
 * `StockBadge`'s status line. **Internal** — not exported from `src/index.ts`, not in
 * `componentNames.ts`, no story: it exists so those three sites are one line each instead of three
 * hand-maintained copies of the same markup inside templates where a stray newline between tags
 * silently deletes a space from the sentence a screen reader reads (`Price.vue`'s own template
 * comment is there because that happened once already).
 *
 * It renders a bare `<span>` and nothing else. The caller's `data-part` and `class` land on it as
 * fallthrough attributes — this component sets neither, so nothing of the caller's is replaced —
 * which keeps the part names and the `classes` contract where they belong: with the component a
 * consumer actually uses.
 *
 * **Why a nested span at all.** Its parent — `Price`'s `current`/`compareAt`, `StockBadge`'s
 * `label` — carries the refresh dim, which is an `opacity`. So is this fade. One element cannot
 * animate a property another rule is holding at `--eldra-revalidating-opacity`; two composite
 * cleanly, and this one fades 0 → 1 *inside* the part's dim.
 *
 * The text itself is an ordinary interpolation on a stable element, so it changes in the same
 * render as the props — synchronously, with exactly one copy in the DOM at every instant — and the
 * fade is played on it afterwards (`flush: 'post'`, so the element already holds the new text when
 * it starts). See `src/utils/valueFade.ts` for why that, rather than a keyed `<Transition>`.
 */
defineOptions({ name: 'EldraValueText' });

const props = defineProps<{
  /** The formatted text to show. A change to it plays the fade; the first render never does. */
  text: string;
}>();

const spanRef = ref<HTMLElement | null>(null);

/**
 * Deliberately no `immediate`: a value arriving with the component has not *changed*, and fading
 * in every price on first paint would be an entrance animation the spec never asks for.
 *
 * The watcher compares the formatted text rather than the amount behind it, so a change that
 * formats identically (a currency with no minor units re-reading the same major amount) stays
 * completely still.
 */
watch(
  () => props.text,
  () => fadeInChangedValue(spanRef.value),
  { flush: 'post' }
);
</script>

<template>
  <span ref="spanRef">{{ text }}</span>
</template>
