/**
 * Inline SVG path data for a handful of Tabler icons this package draws directly rather than
 * depending on `@tabler/icons-vue` at runtime (the same decision `StockBadge.vue`'s own comment
 * records for `Button`'s spinner) — copied verbatim from `@tabler/icons-vue`'s "outline" 24x24
 * viewBox icons, MIT licensed. Each consumer keeps its own stroke width; only the path data (the
 * one thing that must stay byte-identical to read as the same icon) lives here, shared rather than
 * duplicated — `StockBadge`'s `low`/`error` icon and `EmptyState`'s own `error` default icon are
 * the same `alert-triangle` glyph.
 */
export const ALERT_TRIANGLE_PATHS = [
  'M12 9v4',
  'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0',
  'M12 16h.01',
];

/** `circle-check`: `Notice`'s `success` default (the same glyph `Toast` and `StockBadge` draw). */
export const CIRCLE_CHECK_PATHS = ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'];

/** `info-circle`: `Notice`'s `info` default (the same glyph `Toast`'s `info` draws). */
export const INFO_CIRCLE_PATHS = [
  'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
  'M12 9h.01',
  'M11 12h1v4h1',
];

/** `alert-circle`: `Notice`'s `danger` default (the same glyph `Toast`'s `danger` draws). */
export const ALERT_CIRCLE_PATHS = ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M12 8v4', 'M12 16h.01'];

/** `check`: a completed step's mark in `StepIndicator`. */
export const CHECK_PATHS = ['M5 12l5 5l10 -10'];
