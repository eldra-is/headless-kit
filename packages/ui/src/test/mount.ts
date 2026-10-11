import { mount, type ComponentMountingOptions, type VueWrapper } from '@vue/test-utils';
import type { Component } from 'vue';

/**
 * Mount a component attached to `document.body`.
 *
 * `@vue/test-utils` renders into a detached fragment by default, and a
 * detached element is never `document.activeElement`: `focus()` silently does
 * nothing, so every keyboard and focus-management assertion in this package
 * would pass vacuously. Attaching the component to the live document is what
 * makes those assertions real, so every spec mounts through this helper (or
 * `mountNarrow`) rather than calling `mount` directly.
 */
export function mountWith<T extends Component>(
  component: T,
  options?: ComponentMountingOptions<T>
): VueWrapper<InstanceType<T & (new () => unknown)>> {
  const wrapper = mount(component as Component, {
    attachTo: document.body,
    ...(options as ComponentMountingOptions<Component>),
  });
  return wrapper as unknown as VueWrapper<InstanceType<T & (new () => unknown)>>;
}

/**
 * Mount a component inside a 20rem-wide host element — the "narrow container"
 * state the design spec requires every component to render in without
 * overflowing or throwing. The host stays in `document.body`, so focus works
 * exactly as it does in `mountWith`.
 */
export function mountNarrow<T extends Component>(
  component: T,
  options?: ComponentMountingOptions<T>
): VueWrapper<InstanceType<T & (new () => unknown)>> {
  const host = document.createElement('div');
  host.dataset.eldraNarrowHost = '';
  host.style.width = NARROW_CONTAINER_WIDTH;
  document.body.append(host);
  const wrapper = mount(component as Component, {
    attachTo: host,
    ...(options as ComponentMountingOptions<Component>),
  });
  return wrapper as unknown as VueWrapper<InstanceType<T & (new () => unknown)>>;
}

/** The narrow-container width from the design spec's content checklist. */
export const NARROW_CONTAINER_WIDTH = '20rem';
