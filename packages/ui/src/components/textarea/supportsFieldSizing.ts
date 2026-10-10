/**
 * Whether this runtime grows a `<textarea>` to its content on its own (spec "Textarea" →
 * Variants, Auto-grow: "CSS `field-sizing: content` where supported").
 *
 * A named export of its own, rather than an inline check in `Textarea.vue`, so a test can stub it
 * directly (`vi.spyOn`) to exercise the measured fallback — some DOM test environments expose
 * `CSS` as an accessor that hands back a fresh object on every read, which makes monkey-patching
 * `CSS.supports` itself unreliable.
 */
export function supportsFieldSizing(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('field-sizing: content')
  );
}
