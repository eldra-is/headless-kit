/**
 * Whether this engine closes the previously open sibling itself when a same-`name` `<details>`
 * opens — the native "exclusive accordion group" behaviour every current browser (Chromium,
 * Firefox, Safari) implements for the `name` attribute. Feature-detected once and cached rather
 * than assumed, because the test environment (happy-dom) does not implement it at all:
 * `AccordionItem.vue`'s own JS fallback exists for exactly that gap, and this is what gates it —
 * a browser that already does this natively never runs the fallback query.
 *
 * The probe creates two same-named `<details>`, opens both, and checks whether opening the second
 * closed the first — the same effect a user clicking between two summaries produces, just via the
 * `open` property instead of a click, which the HTML "toggle a details" algorithm treats no
 * differently (see MDN's `toggle` event docs: it fires "whenever the open/closed state changes",
 * scripted or not).
 */
let cached: boolean | null = null;

const PROBE_NAME = 'eldra-accordion-exclusivity-probe';

/**
 * Reads `open` through a function call rather than inline, so TypeScript cannot narrow it to the
 * literal `true` it was just assigned — the whole point of the probe is that setting `b.open`
 * afterwards may change `a.open` behind that assignment, a DOM side effect no amount of type
 * narrowing can see.
 */
function isOpen(details: HTMLDetailsElement): boolean {
  return details.open;
}

/**
 * `setAttribute`, not the `.name` IDL property: `name` on `<details>` is a recent HTML addition
 * that not every DOM engine implements as a property yet (happy-dom does not — the very reason
 * this probe, and `AccordionItem.vue`'s own fallback query, both go through the attribute
 * instead), and the attribute is what the "exclusive accordion group" algorithm itself keys off.
 */
function setName(details: HTMLDetailsElement, name: string): void {
  details.setAttribute('name', name);
}

export function supportsExclusiveDetailsGroups(): boolean {
  if (cached !== null) return cached;
  if (typeof document === 'undefined') {
    cached = true;
    return cached;
  }
  try {
    const host = document.createElement('div');
    host.hidden = true;
    const a = document.createElement('details');
    const b = document.createElement('details');
    setName(a, PROBE_NAME);
    setName(b, PROBE_NAME);
    host.append(a, b);
    document.body.append(host);
    a.open = true;
    b.open = true;
    cached = isOpen(a) === false;
    host.remove();
  } catch {
    // A sandboxed or otherwise unusual DOM: assume native support (the common case) rather than
    // add the fallback's extra query to every toggle for a probe failure that is not itself proof
    // of anything.
    cached = true;
  }
  return cached;
}

/** Test-only: clears the cached probe result so a spec can exercise both branches deliberately. */
export function resetExclusiveDetailsProbeForTests(): void {
  cached = null;
}
