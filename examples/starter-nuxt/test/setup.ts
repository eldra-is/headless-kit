// Mirrors packages/vue/src/test-setup.ts: registers vitest-axe's matchers
// (`toHaveNoViolations`) globally so every `__tests__/*.spec.ts` accessibility
// assertion (`expect(await axe(wrapper.element)).toHaveNoViolations()`) just
// works, without each spec file importing/extending it itself. The matching
// `declare module 'vitest'` type augmentation lives in the package-root
// `vitest-axe.d.ts` instead of here — `nuxi typecheck` does not include
// `test/**`, but does include a root-level `*.d.ts` (see that file).
import { afterEach, expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';
import { enableAutoUnmount } from '@vue/test-utils';

expect.extend(matchers);

// `UiDialog` (and anything built on it, like `UiDrawer`) locks document
// scroll and adds a document-level Escape/focus-trap keydown listener while
// mounted and open. A spec that doesn't explicitly `wrapper.unmount()`
// would otherwise leak both across to the next test in the same file (they
// share one jsdom `document`) — auto-unmounting after every test is the
// standard `@vue/test-utils` fix, and it also runs `onBeforeUnmount`/
// `onScopeDispose` cleanup no test needs to remember to write.
enableAutoUnmount(afterEach);
