import { inject, provide, useSlots, type InjectionKey } from 'vue';

/** The injection key `provideEldraScope` provides under. */
export const ELDRA_SCOPE_KEY: InjectionKey<string> = Symbol('eldra-scope');

/**
 * Opts every component of this package rendered below the caller into `@eldrajs/ui/scoped.css`,
 * the stylesheet for embedding these components in another Tailwind app (see the README,
 * "Embedding in another Tailwind app"). Call it in `setup()` of a wrapper or an app root.
 *
 * Each component then renders `data-eldra-scope="<name>"` on its root and on every part it
 * teleports (panels, dialogs, toasts). The name is free; the consumer's own variable overrides
 * target it (`[data-eldra-scope='studio'] { --eldra-color-primary: … }`). Without a provider the
 * attribute is not rendered, so the output is unchanged.
 */
export function provideEldraScope(name = 'default'): void {
  provide(ELDRA_SCOPE_KEY, name || 'default');
}

/**
 * Internal: what a component of this package binds for `scoped.css`. `scope` goes on every root,
 * teleported root and kit-owned element sitting directly in a slot host (so it is a scope root of
 * its own and stays styled below the host's limit); it is `undefined` without a provider.
 * `slotHost(...names)` is `data-eldra-slot`, on the element holding those slots, where `scoped.css`
 * stops styling. It renders whenever one of the slots has content, provider or not (it changes no
 * style without `scoped.css`), and never for a fallback, which is the kit's own markup.
 */
export function useEldraScope() {
  const scope = inject(ELDRA_SCOPE_KEY, undefined);
  const slots = useSlots();
  return {
    scope,
    slotHost: (...names: string[]): '' | undefined =>
      names.some((name) => slots[name] !== undefined) ? '' : undefined,
  };
}
