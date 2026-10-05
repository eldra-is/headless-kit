/**
 * Whether this runtime tells a keyboard focus apart from a mouse/touch one through
 * `:focus-visible` — the browser's own answer to `Tooltip`'s "focus holds it open" rule (spec →
 * States, Shown: "focus within it"), which the operator report and the controller's decision on it
 * narrowed to *keyboard* focus: a mouse click also focuses its target, and treating that as "focus
 * within" is exactly what left the bubble stuck open after a click.
 *
 * A named export of its own, mirroring `Textarea`'s `supportsFieldSizing`, so a test can stub it
 * directly (`vi.spyOn`) to exercise `Tooltip`'s keyboard-flag fallback deterministically. Feature
 * detection alone cannot pick this environment out: happy-dom (this package's own test
 * environment) both parses the selector and answers `CSS.supports('selector(:focus-visible)')`
 * `true`, but implements `:focus-visible` as a synonym for `:focus` — matching *any* focused
 * element, keyboard or not — so a probe run against it reports "supported" and would still hand
 * back exactly the wrong answer for a mouse-focused trigger. Stubbing this function is what lets a
 * spec exercise the fallback on purpose instead of relying on that quirk by accident.
 */
export function supportsFocusVisible(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('selector(:focus-visible)')
  );
}
