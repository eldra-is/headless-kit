import { DOMWrapper } from '@vue/test-utils';

/**
 * The popup panel of a `Select`, `MultiSelect` or `SearchBar`, wherever it has been teleported to.
 *
 * `wrapper.find()` walks the component's **own** subtree, and these panels are rendered through a
 * `<Teleport>` to `document.body` (or to the open `<dialog>` the control sits in), so a query
 * through the wrapper returns nothing — the panel is a sibling of the mount point, not a
 * descendant of it. Ids are global, though, and the panel's id is derived from the control's own,
 * so `getElementById` finds exactly this control's panel and no other open one's. That is also
 * what makes the trigger's `aria-controls` / `aria-activedescendant` keep working across the
 * teleport, which several specs assert directly.
 *
 * A missing element is handed to `DOMWrapper`, which answers with `@vue/test-utils`' own empty
 * wrapper: `.exists()` is `false` and anything else throws, exactly as a failed `find()` does.
 *
 * ```ts
 * const panel = panelOf(triggerOf(wrapper).element);
 * expect(panel.exists()).toBe(true);
 * expect(panel.element.parentElement).toBe(document.body);
 * ```
 */
export function panelOf(control: Element | null | undefined): DOMWrapper<Element> {
  const id = control?.getAttribute('id');
  const element = id === null || id === undefined ? null : document.getElementById(`${id}-panel`);
  return new DOMWrapper<Element>(element);
}
