/**
 * The link cue's arrow (spec "Content card"/"Feature card" → States, Hover: "cue arrow moves 2px
 * right (`duration-fast`)"), shared by `ContentCard.vue` and `FeatureCard.vue` — both draw the
 * exact same 1.125rem Tabler `arrow-right`, geometry and hover nudge, so the class string and path
 * data live here once rather than twice. Each component still renders its own `<svg>` (a tiny
 * internal component would cost a render-function indirection for markup this small), reading
 * `CUE_ARROW_CLASS`/`CUE_ARROW_PATHS` instead of redeclaring them.
 */
export const CUE_ARROW_CLASS =
  'inline-block size-4.5 shrink-0 transition-[translate] duration-fast ease-out ' +
  'motion-reduce:transition-none group-hover:translate-x-0.5';

export const CUE_ARROW_PATHS = ['M5 12l14 0', 'M13 18l6 -6', 'M13 6l6 6'];
