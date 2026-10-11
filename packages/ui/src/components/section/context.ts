import type { InjectionKey } from 'vue';

/**
 * Presence marker a `Section` provides for its own subtree: `true`, never any other value — the
 * only question anything downstream asks of it is "is there a `Section` ancestor here at all".
 *
 * `Section` itself is the one reader today: it injects this optionally, and when it finds one
 * already provided it means a `Section` has been mounted inside another `Section`, which spec
 * "Container and section" → Behaviour & motion rules out outright ("Sections are never nested
 * inside another section... nest containers only for full-bleed media"). It warns in development
 * rather than throwing, the same shape as every other dev-only guard in this package (see
 * `Button.vue`'s `iconOnly`/`label` warning) — a caller notices in local development and it never
 * breaks a build.
 *
 * Exported so a future component, or a consumer's own, can ask the same question: "am I inside a
 * `Section`" without depending on the DOM (`closest('section')` breaks the moment a caller passes
 * `as="div"` or `as="footer"`, and cannot see through a `<Teleport>`).
 *
 * ```ts
 * import { SECTION_KEY } from '@eldrajs/ui';
 * const insideSection = inject(SECTION_KEY, undefined) === true;
 * ```
 */
export const SECTION_KEY: InjectionKey<true> = Symbol('eldra-ui:section');
