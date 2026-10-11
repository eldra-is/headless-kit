import type { ComputedRef, InjectionKey } from 'vue';

/**
 * What an `Accordion` tells the `AccordionItem`s inside it.
 *
 * An `Accordion` does not render its children — a consumer places `<AccordionItem>`s in its
 * default slot, the same shape as `ButtonGroup`/`ChipGroup` — so the shared `name` a single-open
 * group's `<details>` elements all need (spec "Accordion" → Properties, `name` row: "the shared
 * `name` used when `multiple` is false") has to reach every item some other way. Every
 * `AccordionItem` injects this optionally (`inject(ACCORDION_KEY, null)`); a standalone item with
 * no `Accordion` above it gets no shared name at all, which is correct — exclusivity is a group
 * behaviour, not something a lone `<details>` needs.
 */
export interface AccordionContext {
  /** `false`: every item in the group shares `name`, so opening one closes its native siblings. */
  multiple: boolean;
  /** The shared `name`, meaningful only while `multiple` is `false`. */
  name: string | undefined;
}

/** The key an `Accordion` provides its `AccordionContext` on. */
export const ACCORDION_KEY: InjectionKey<ComputedRef<AccordionContext>> =
  Symbol('eldra-ui:accordion');
