import type { InjectionKey, Ref } from 'vue';

/**
 * Context `UiAccordion` provides and `UiAccordionItem` injects (see
 * `iconFetcher.ts`/`useEldraIcon.ts` for the same `InjectionKey` + plain
 * `provide()`/`inject()` shape used elsewhere in this starter). Vue resolves
 * `inject()` for a component written inside another component's default
 * slot against the *providing* component, not the outer template scope, so
 * `<UiAccordion><UiAccordionItem/></UiAccordion>` works as a normal
 * compound component despite `UiAccordionItem` being authored as slot
 * content.
 */
export interface AccordionContext {
  /** When true, opening one item closes every other open item. */
  single: boolean;
  /** The currently open item's id in `single` mode; unused otherwise. */
  openId: Ref<string | null>;
  setOpen: (id: string | null) => void;
}

export const ACCORDION_KEY: InjectionKey<AccordionContext> = Symbol('eldra-accordion');
