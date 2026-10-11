import { expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';
import type { AxeMatchers } from 'vitest-axe/matchers';

expect.extend(matchers);

declare module 'vitest' {
  interface Assertion extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

/**
 * Every modal surface in this package is a native `<dialog>` driven by
 * `showModal()`/`close()`. happy-dom implements both, so this guard returns
 * early and nothing is patched — it exists so that an environment change
 * that drops the native implementation (jsdom does: it reflects the `open`
 * attribute but implements neither method) fails loudly here instead of
 * silently turning every dialog spec into a test of a stub.
 */
function assertDialogSupport(): void {
  const ctor = (globalThis as { HTMLDialogElement?: typeof HTMLDialogElement }).HTMLDialogElement;
  if (!ctor) return; // not a DOM environment (e.g. a node-environment spec file)
  const proto = ctor.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal === 'function') return; // native implementation (happy-dom, browsers)
  throw new Error(
    'The test environment has no HTMLDialogElement.showModal(); ' +
      'the dialog specs would test a stub. Keep vitest on happy-dom.'
  );
}

assertDialogSupport();
