import { defineComponent, h, type PropType } from 'vue';
import type { EntryDoc } from '@eldrajs/theme-core';

/**
 * Mock theme block components resolved by the `virtual:eldra/blocks` alias.
 *
 * `hero` declares an `actions` outlet (and a `footer` outlet) with fallbacks,
 * mirroring an SFC like:
 *   <section data-test-hero>
 *     <h1>{{ entry.data.heading }}</h1>
 *     <slot name="actions"><span data-test-fallback>default cta</span></slot>
 *   </section>
 * When EldraLayout omits an empty slot, the fallback renders.
 */
export default {
  hero: async () => ({
    default: defineComponent({
      props: { entry: { type: Object as PropType<EntryDoc>, required: true } },
      setup:
        (props, { slots }) =>
        () => {
          const actions =
            slots.actions === undefined
              ? [h('span', { 'data-test-fallback': '' }, 'default cta')]
              : slots.actions();
          const footer = slots.footer === undefined ? [] : slots.footer();
          return h('section', { 'data-test-hero': '' }, [
            h('h1', String(props.entry.data.heading)),
            ...actions,
            ...footer,
          ]);
        },
    }),
  }),
  cta: async () => ({
    default: defineComponent({
      props: { entry: { type: Object as PropType<EntryDoc>, required: true } },
      setup: (props) => () =>
        h('button', { 'data-test-cta': '' }, String(props.entry.data.label ?? '')),
    }),
  }),
};
