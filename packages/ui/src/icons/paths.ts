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
