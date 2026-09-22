// Mirrors packages/vue/src/test-setup.ts: registers vitest-axe's matchers
// (`toHaveNoViolations`) globally so every `__tests__/*.spec.ts` accessibility
// assertion (`expect(await axe(wrapper.element)).toHaveNoViolations()`) just
// works, without each spec file importing/extending it itself. The matching
// `declare module 'vitest'` type augmentation lives in the package-root
// `vitest-axe.d.ts` instead of here — `nuxi typecheck` does not include
// `test/**`, but does include a root-level `*.d.ts` (see that file).
import { expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';

expect.extend(matchers);
