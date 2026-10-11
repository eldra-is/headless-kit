import { configureAxe } from 'vitest-axe';

/**
 * `vitest-axe`'s default `axe()` runs axe-core's full rule set, including
 * `region` ("all page content should be contained by landmarks") — a
 * page-level check that makes sense for a full document but not for a
 * single component mounted in isolation (`@vue/test-utils`' `mount()`
 * renders a detached fragment with no `<main>`/`<header>` around it by
 * design). Every `src/components/<name>/__tests__/*.spec.ts` imports `axe`
 * from here instead of `vitest-axe` directly, so `expect(await
 * axe(wrapper.element)).toHaveNoViolations()` only fails for violations a
 * mounted fragment can actually have.
 */
export const axe = configureAxe({ rules: { region: { enabled: false } } });
