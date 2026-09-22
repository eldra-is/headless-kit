// Ambient module augmentation for vitest-axe's `toHaveNoViolations()`
// matcher — the matcher itself is registered at runtime by
// `test/setup.ts`'s `expect.extend(matchers)` (vitest's `setupFiles`).
// `test/**` is not part of `nuxi typecheck`'s program (see `.nuxt/tsconfig.json`),
// but this file is picked up by its `../*.d.ts` include, so
// `app/components/ui/__tests__/*.spec.ts`'s `toHaveNoViolations()` calls
// still type-check.
import type { AxeMatchers } from 'vitest-axe/matchers';

declare module 'vitest' {
  interface Assertion extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
