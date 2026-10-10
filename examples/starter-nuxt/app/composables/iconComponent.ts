import { defineComponent, h, type Component, type VNode } from 'vue';
import { useEldraIcon } from './useEldraIcon';

/**
 * The theme's one name→icon-component adapter.
 *
 * Several `@eldrajs/ui` props take an icon *component* with no props of its own — `FeatureCard`'s
 * and `Badge`'s `icon`, `EmptyState`'s `icon`, `Button`'s leading-icon slot content in a few
 * places — while a CMS field gives a block an icon *name* (`feature-grid`'s `items[].icon` is a
 * string an editor picks in Studio). `app/components/EldraIcon.vue` bridges name→`Icon` for the
 * template case; this module is the same bridge for the "I need the component itself" case, plus
 * the two small pieces both share.
 *
 * It exists because that bridge had been copy-pasted into eight blocks
 * (`feature-grid`, `pricing-table`, `image`, `article-list`, `cart`, `collection-grid`,
 * `order-status`, `video-embed`) — nine copies of one fragile regex over Tabler's markup, in a
 * codebase the customer is expected to edit, with no shared home to fix once. Blocks import it
 * explicitly, like every other `app/**` helper they use (`safeHref`, `useT`, `useBlockData`).
 */

/**
 * Tabler publishes each icon as a complete `<svg>` document with its own `class`, `width`/`height`
 * and `stroke-width`. Only its *body* is reused: the root is rebuilt so the consumer
 * (`@eldrajs/ui`'s `Icon`, or the block's own `size-*` class) stays in charge of size, the spec's
 * 1.75 stroke and the decorative/labelled ARIA state.
 */
export function tablerSvgBody(markup: string): string {
  return markup.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

/**
 * The rebuilt root. `body === null` renders the same element with nothing in it — an icon slot that
 * has not resolved yet (or resolved to nothing) keeps its layout box rather than collapsing, which
 * is what the package props that require an icon component expect.
 */
export function renderTablerSvg(body: string | null): VNode {
  if (body === null) return h('svg', { viewBox: '0 0 24 24' });
  return h('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    innerHTML: body,
  });
}

/**
 * An inert, empty icon for a required `icon` prop with nothing to show — `feature-grid`'s image
 * media and its not-yet-chosen icon items, where the tile itself is hidden through
 * `classes.iconTile`.
 */
export const EMPTY_ICON: Component = defineComponent({
  name: 'EldraEmptyIcon',
  setup: () => () => renderTablerSvg(null),
});

/**
 * A component that draws the named Tabler icon — for a package prop that takes the icon component
 * rather than a name.
 *
 * Cached per name at module scope, shared by every mounted block, so a reactive re-render never
 * creates a new component identity for the same icon: a new identity would remount — and re-fetch
 * — the icon on every keystroke in the Studio editor.
 *
 * A stateful component, not a bare render function: a *functional* component that declares no props
 * passes only `class`, `style` and listeners to its root, so `Icon`'s `stroke-width`, `role` and
 * `aria-*` would silently never reach the `<svg>`. Safe to call at module scope — `useEldraIcon`
 * runs inside the returned component's own `setup`, not here.
 */
export function iconComponent(name: string): Component {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const component = defineComponent({
    name: 'EldraTablerIcon',
    setup() {
      const svg = useEldraIcon(name);
      return () => renderTablerSvg(svg.value);
    },
  });
  cache.set(name, component);
  return component;
}
const cache = new Map<string, Component>();
