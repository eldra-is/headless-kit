import { defineComponent, h } from 'vue';

/**
 * Storybook renders blocks outside Nuxt, so the `<NuxtLink>` Nuxt injects as
 * a global component (see `blocks/navigation/Block.vue`, the only block that
 * uses it) has nothing to resolve to. This stub renders a plain `<a>` from
 * the same `to` prop Nuxt's real component reads, which is all a static
 * story needs — it never has to navigate.
 */
export const NuxtLinkStub = defineComponent({
  name: 'NuxtLink',
  props: {
    to: { type: [String, Object], default: '' },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'a',
        { href: typeof props.to === 'string' ? props.to : JSON.stringify(props.to) },
        slots.default?.()
      );
  },
});
