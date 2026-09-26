import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mountWith } from '../../../test/mount';
import { panelOf } from '../../../test/popover';
import SearchBar from '../../search-bar/SearchBar.vue';
import MultiSelect from '../MultiSelect.vue';
import Select from '../Select.vue';
import type { SelectOption } from '../types';

/**
 * Where the popup panels of `Select`, `MultiSelect` and `SearchBar` actually live, and what still
 * has to hold once they live there.
 *
 * A panel rendered inside its own control is at the mercy of everything above it: an ancestor with
 * `overflow: hidden` clips it, and a later stacking context paints over it however high its
 * `z-index` is. `usePopover` therefore renders it through a `<Teleport>` — to `body`, or to the
 * open native `<dialog>` the control sits in, because *that* renders in the browser's top layer
 * and `body` would be behind it — and positions it with floating-ui's `fixed` strategy, the only
 * frame the two elements still share once they are in different subtrees.
 *
 * Each control's own spec proves its behaviour through the teleported panel already (they find it
 * by id, through `src/test/popover.ts`). What is proven here is the move itself: where the panel
 * ends up, that nothing about closing, the keyboard or the ARIA wiring depends on containment, and
 * that `teleport: false` still renders the old shape.
 */

const OPTIONS: SelectOption[] = [
  { value: 'oat', label: 'Oat' },
  { value: 'clay', label: 'Clay' },
  { value: 'moss', label: 'Moss' },
];

/** Twelve options is past the spec's "more than 10", so the panel gets its search field. */
const MANY: SelectOption[] = Array.from({ length: 12 }, (_, index) => ({
  value: `v${index}`,
  label: `Option ${index}`,
}));

const NAME = { 'aria-label': 'Colour' };

const mounted: VueWrapper[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  for (const host of hosts.splice(0)) host.remove();
  document.body.innerHTML = '';
});

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function mountSelect(props: Record<string, unknown> = {}, attachTo?: HTMLElement) {
  const wrapper = mountWith(Select, {
    props: { options: OPTIONS, ...props },
    attrs: NAME,
    ...(attachTo === undefined ? {} : { attachTo }),
  });
  mounted.push(wrapper as unknown as VueWrapper);
  return wrapper;
}

/** A pointer press followed by its click — what a real mouse does, and what the trigger reads. */
async function press(target: { trigger: (name: string) => Promise<unknown> }): Promise<void> {
  await target.trigger('pointerdown');
  await target.trigger('click');
  await flush();
}

const triggerOf = (wrapper: {
  find: (s: string) => { trigger: (n: string) => Promise<unknown> };
}) => wrapper.find('[data-part="trigger"]');

// ---------------------------------------------------------------------------------------------

describe('the popover panels are teleported out of their control', () => {
  it('puts the panel on document.body, outside the component root', async () => {
    const wrapper = mountSelect();
    await press(triggerOf(wrapper));

    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);
    expect(panel.exists()).toBe(true);
    expect(panel.element.parentElement).toBe(document.body);
    // The whole point: the control's own subtree no longer holds it.
    expect(wrapper.element.contains(panel.element)).toBe(false);
    expect(wrapper.find('[data-part="panel"]').exists()).toBe(false);

    // …and it is taken away again when the panel closes, rather than left on the body.
    await press(triggerOf(wrapper));
    expect(document.querySelectorAll('[data-part="panel"]')).toHaveLength(0);
  });

  it('escapes an ancestor that clips its overflow', async () => {
    // The operator's case: a card with `overflow: hidden` around the field. Containment is what
    // clipping follows, so a panel that is not contained cannot be clipped — whatever the card's
    // computed style says, which happy-dom does not lay out anyway.
    const card = document.createElement('div');
    card.style.overflow = 'hidden';
    document.body.append(card);
    hosts.push(card);

    const wrapper = mountSelect({}, card);
    await press(triggerOf(wrapper));

    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);
    expect(card.contains(panel.element)).toBe(false);
    expect(panel.element.parentElement).toBe(document.body);
  });

  it('positions it against the viewport, since it no longer shares a frame with its control', async () => {
    const wrapper = mountSelect();
    await press(triggerOf(wrapper));
    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);

    expect(panel.attributes('style')).toContain('position: fixed');
    // Unchanged by the move: the width floor and the entrance the keyframes read.
    expect(panel.attributes('style')).toContain('min-width');
    expect(panel.attributes('style')).toContain('--eldra-popover-origin');
    expect(panel.classes()).toContain('animate-eldra-popover-in');
    expect(panel.classes()).toContain('z-popover');
  });

  it('marks the panel as part of its overlay', async () => {
    const wrapper = mountSelect();
    await press(triggerOf(wrapper));
    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);

    // `useOverlay` recognises a part of an overlay that is not inside its content element by this
    // attribute; the panel claims its own id, so anything under it reads as inside.
    expect(panel.attributes('data-eldra-overlay-owner')).toBe(panel.attributes('id'));
  });

  it('teleports MultiSelect and SearchBar panels too', async () => {
    const multi = mountWith(MultiSelect, { props: { options: OPTIONS }, attrs: NAME });
    mounted.push(multi as unknown as VueWrapper);
    await press(multi.find('[data-part="trigger"]'));
    const multiPanel = panelOf(multi.find('[data-part="trigger"]').element);
    expect(multiPanel.element.parentElement).toBe(document.body);
    // The footer is the panel's own slot, so it travels with it.
    expect(multiPanel.find('[data-part="footerDone"]').exists()).toBe(true);

    const bar = mountWith(SearchBar, { props: { popular: ['Merino'] } });
    mounted.push(bar as unknown as VueWrapper);
    const field = bar.find('[data-part="field"]');
    (field.element as HTMLInputElement).focus();
    await field.trigger('focus');
    await flush();
    const barPanel = panelOf(field.element);
    expect(barPanel.exists()).toBe(true);
    expect(barPanel.element.parentElement).toBe(document.body);
  });

  it('takes a CSS selector as the target', async () => {
    const host = document.createElement('div');
    host.id = 'popover-host';
    document.body.append(host);
    hosts.push(host);

    const wrapper = mountSelect({ teleport: '#popover-host' });
    await press(triggerOf(wrapper));
    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);
    expect(panel.element.parentElement).toBe(host);
  });

  it('leaves the panel in place under teleport: false, positioned absolutely', async () => {
    const wrapper = mountSelect({ teleport: false });
    await press(triggerOf(wrapper));

    // The pre-teleport shape, exactly: the panel is a child of the control's own root.
    const inPlace = wrapper.find('[data-part="panel"]');
    expect(inPlace.exists()).toBe(true);
    expect(wrapper.element.contains(inPlace.element)).toBe(true);
    expect(inPlace.attributes('style')).toContain('position: absolute');
  });
});

describe('a teleported panel keeps every rule that assumed containment', () => {
  it('closes on a press outside, and not on one inside the panel', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    hosts.push(outside);

    const wrapper = mountSelect();
    await press(triggerOf(wrapper));
    const panel = () => panelOf(wrapper.find('[data-part="trigger"]').element);

    // Inside the teleported panel: containment says nothing about it any more, and it must still
    // read as inside.
    panel()
      .find('[data-part="listbox"]')
      .element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panel().exists()).toBe(true);

    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panel().exists()).toBe(false);
  });

  it('does not close when focus moves from the trigger into the teleported panel', async () => {
    const wrapper = mountSelect({ options: MANY });
    await press(triggerOf(wrapper));
    const panel = () => panelOf(wrapper.find('[data-part="trigger"]').element);

    const search = panel().find('[data-part="search"]').element;
    expect(document.activeElement).toBe(search);

    // The focus move that a `focusout` on the trigger reports: the new owner is in another subtree
    // entirely, and `useOverlay` must still read it as inside the overlay.
    wrapper
      .find('[data-part="trigger"]')
      .element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: search }));
    await flush();
    expect(panel().exists()).toBe(true);

    // Focus leaving for real still closes it.
    wrapper
      .find('[data-part="trigger"]')
      .element.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body })
      );
    await flush();
    expect(panel().exists()).toBe(false);
  });

  it('keeps the ARIA wiring pointing into the panel, because ids are global', async () => {
    const wrapper = mountSelect({ options: MANY });
    await press(triggerOf(wrapper));
    const trigger = wrapper.find('[data-part="trigger"]').element;
    const panel = panelOf(trigger);

    // `aria-controls` resolves through the document, not through the subtree.
    const controls = trigger.getAttribute('aria-controls');
    expect(controls).not.toBeNull();
    const listbox = document.getElementById(controls as string);
    expect(listbox).not.toBeNull();
    expect(panel.element.contains(listbox as HTMLElement)).toBe(true);

    // The search field owns `aria-activedescendant` when there is one, and it points at a row.
    const search = panel.find('[data-part="search"]').element;
    const active = search.getAttribute('aria-activedescendant');
    expect(active).not.toBeNull();
    expect(document.getElementById(active as string)?.getAttribute('role')).toBe('option');
  });

  it('moves the active row and selects with the keyboard exactly as before', async () => {
    const wrapper = mountSelect({ options: MANY });
    const trigger = wrapper.find('[data-part="trigger"]').element;

    // Opened from the keyboard, so nothing about the pointer is involved.
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await flush();
    const panel = () => panelOf(trigger);
    expect(panel().exists()).toBe(true);

    const search = panel().find('[data-part="search"]').element;
    const activeLabel = (): string | undefined => {
      const id = search.getAttribute('aria-activedescendant');
      return id === null ? undefined : (document.getElementById(id)?.textContent?.trim() ?? '');
    };
    expect(activeLabel()).toBe('Option 0');

    search.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await flush();
    expect(activeLabel()).toBe('Option 1');

    search.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await flush();
    expect(wrapper.emitted('change')?.at(-1)).toEqual(['v1']);
    expect(panel().exists()).toBe(false);
  });

  it('still closes whichever panel was open when another control opens', async () => {
    const first = mountSelect({ id: 'first' });
    const second = mountSelect({ id: 'second', options: MANY });

    await press(triggerOf(first));
    expect(panelOf(first.find('[data-part="trigger"]').element).exists()).toBe(true);

    await press(triggerOf(second));
    expect(panelOf(second.find('[data-part="trigger"]').element).exists()).toBe(true);
    expect(panelOf(first.find('[data-part="trigger"]').element).exists()).toBe(false);
  });
});

describe('inside an open native <dialog>', () => {
  /**
   * A modal `<dialog>` renders in the browser's **top layer**, above every z-index on the page, so
   * a panel teleported to `body` would render behind the dialog that opened it and no `z-index`
   * could rescue it. The panel therefore goes into the dialog itself, which keeps both the escape
   * from clipping and the top layer.
   */
  function openDialog(): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    hosts.push(dialog);
    dialog.showModal();
    return dialog;
  }

  it('teleports into the dialog rather than onto the body', async () => {
    const dialog = openDialog();
    const wrapper = mountSelect({}, dialog);
    await press(triggerOf(wrapper));

    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);
    expect(panel.element.parentElement).toBe(dialog);
    expect(panel.element.parentElement).not.toBe(document.body);
  });

  it('goes back to the body once the dialog is closed', async () => {
    const dialog = openDialog();
    const wrapper = mountSelect({}, dialog);

    dialog.close();
    // Still in the dialog's subtree, but the dialog is no longer in the top layer, so `body` is
    // the right target again — and the target is resolved afresh on every open.
    await press(triggerOf(wrapper));
    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);
    expect(panel.element.parentElement).toBe(document.body);
  });

  /**
   * `showModal()` and `show()` both set the `open` attribute, and nothing else in the DOM tells
   * them apart — only `:modal` does, and only a modal dialog is in the top layer. happy-dom parses
   * the selector and never matches it (jsdom does not implement modality at all), so this teaches
   * the two dialogs the single fact a real engine knows, the same way `test/setup.ts` guards the
   * `showModal()` implementation itself.
   */
  function declareModal(dialog: HTMLDialogElement, modal: boolean): void {
    const native = dialog.matches.bind(dialog);
    // The cast is the DOM lib's type-predicate overload of `matches`, which a plain
    // `(selector) => boolean` cannot satisfy; the behaviour is the ordinary boolean one.
    dialog.matches = ((selector: string): boolean =>
      selector === ':modal' ? modal : native(selector)) as Element['matches'];
  }

  it('prefers the modal dialog when a non-modal one is nearer', async () => {
    const modal = openDialog();
    const inner = document.createElement('dialog');
    modal.append(inner);
    inner.show?.();
    inner.setAttribute('open', '');
    declareModal(modal, true);
    declareModal(inner, false);

    const wrapper = mountSelect({}, inner);
    await press(triggerOf(wrapper));

    // The nearest open dialog is `inner`, but it is an ordinary in-flow element: it clips and
    // stacks like any other, and teleporting into it would escape nothing. The top layer is the
    // outer one's.
    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);
    expect(panel.element.parentElement).toBe(modal);
    expect(panel.element.parentElement).not.toBe(inner);
  });

  /**
   * Nested modals (operator override, 2026-09-26 — see the README's Deviations entry): a `Dialog`
   * opened from inside another one's slot content is a genuine DOM descendant of it, both really
   * `showModal()`-modal. `topLayerDialog`'s own walk starts from the nearest ancestor dialog and
   * returns as soon as it finds one in the top layer — which, for a trigger inside the *inner* of
   * two stacked modals, is the inner one, found first. This is the "confirm it picks the top one"
   * half of the stack ruling: not a new branch in `topLayerDialog` (nesting already made this work),
   * but a test proving the existing walk actually resolves to the top when both ancestors are
   * legitimately modal, not only in the modal-vs-non-modal case above.
   */
  it('prefers the inner of two stacked modal dialogs — both genuinely modal', async () => {
    const outer = openDialog();
    const inner = document.createElement('dialog');
    outer.append(inner);
    inner.setAttribute('open', '');
    declareModal(outer, true);
    declareModal(inner, true);

    const wrapper = mountSelect({}, inner);
    await press(triggerOf(wrapper));

    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);
    expect(panel.element.parentElement).toBe(inner);
    expect(panel.element.parentElement).not.toBe(outer);
  });

  it('keeps the nearest open dialog when nothing above it claims the top layer', async () => {
    // Either they are all really non-modal or the engine cannot answer `:modal`, and nothing tells
    // the two apart — so the nearest open dialog is kept, which is the safe mistake of the two
    // (see `topLayerDialog`). This is also every run in happy-dom, where `:modal` never matches.
    const plain = document.createElement('dialog');
    document.body.append(plain);
    hosts.push(plain);
    plain.setAttribute('open', '');
    declareModal(plain, false);

    const wrapper = mountSelect({}, plain);
    await press(triggerOf(wrapper));

    const panel = panelOf(wrapper.find('[data-part="trigger"]').element);
    expect(panel.element.parentElement).toBe(plain);
  });

  it('keeps a real modal dialog where the engine cannot answer :modal', async () => {
    // Plain happy-dom: `matches(":modal")` is `false` for a dialog that really is modal. The
    // fallback is what stops that from throwing every panel onto the body behind its own dialog.
    const dialog = openDialog();
    expect(dialog.matches(':modal')).toBe(false);

    const wrapper = mountSelect({}, dialog);
    await press(triggerOf(wrapper));
    expect(panelOf(wrapper.find('[data-part="trigger"]').element).element.parentElement).toBe(
      dialog
    );
  });
});

describe('the Tab walk into a teleported panel', () => {
  /**
   * Sequential focus follows the DOM, and a teleported panel is no longer after its control in it.
   * Left alone, `Tab` from the trigger would step past the panel to the next thing on the page and
   * the popup would close with its own controls never reached — which the design spec's
   * Multi-select Keyboard table forbids: "Tab moves from the search field (or the trigger) to the
   * footer's Clear, then Done, with the popover still open."
   *
   * `usePopover`'s `tabRedirect` restores exactly the two boundary steps and nothing else, so there
   * is an exit in both directions (past the last row forwards, `Shift+Tab` to the trigger
   * backwards) and WCAG 2.1.2's no-keyboard-trap rule holds.
   */
  const tab = (from: Element, shiftKey = false): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    from.dispatchEvent(event);
    return event;
  };

  async function openMulti(props: Record<string, unknown> = {}) {
    const wrapper = mountWith(MultiSelect, {
      props: { options: OPTIONS, searchable: false, ...props },
      attrs: NAME,
    });
    mounted.push(wrapper as unknown as VueWrapper);
    const trigger = wrapper.find('[data-part="trigger"]').element as HTMLButtonElement;
    trigger.focus();
    await press(wrapper.find('[data-part="trigger"]'));
    return { wrapper, trigger, panel: () => panelOf(trigger) };
  }

  it('walks from a non-searchable MultiSelect trigger into the panel, and back again', async () => {
    // Nothing selected, so there is no clear button: the trigger is the control's only tab stop,
    // and the redirect happens there. The case with one is the next test.
    const { wrapper, trigger, panel } = await openMulti();
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);
    const clear = panel().find('[data-part="footerClear"]').element as HTMLElement;
    const done = panel().find('[data-part="footerDone"]').element as HTMLElement;
    expect(document.activeElement).toBe(trigger);

    // Forwards: into the panel's first tab stop, which is the footer's Clear.
    const forward = tab(trigger);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(panel().exists()).toBe(true);

    // Between the footer's own buttons nothing is touched: the browser's order is already right.
    const inside = tab(clear);
    expect(inside.defaultPrevented).toBe(false);

    // Backwards out of the first row: onto the trigger, popover still open.
    const back = tab(clear, true);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(panel().exists()).toBe(true);

    // And `Shift+Tab` anywhere else in the panel is the browser's too.
    const insideBack = tab(done, true);
    expect(insideBack.defaultPrevented).toBe(false);
  });

  it('passes the trigger clear button on the way into the panel, and returns to it', async () => {
    // Spec → Keyboard, and the clear button's own `data-eldra-overlay-owner`: it belongs to the
    // popover while that is open, so the walk runs trigger → clear → footer Clear → Done. Only the
    // step the teleport broke — the last one out of the control — is redirected; the step from the
    // trigger to the clear button is still the browser's, because they are siblings in the DOM.
    const { wrapper, trigger, panel } = await openMulti({ modelValue: ['oat'] });
    const clear = wrapper.find('[data-part="clearButton"]').element as HTMLElement;
    const footerClear = panel().find('[data-part="footerClear"]').element as HTMLElement;

    // Trigger → clear button: untouched, so the browser's own order takes it there.
    const toClear = tab(trigger);
    expect(toClear.defaultPrevented).toBe(false);

    // Clear button → the panel: this is the step that would otherwise leave the control.
    clear.focus();
    const intoPanel = tab(clear);
    expect(intoPanel.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(footerClear);
    expect(panel().exists()).toBe(true);

    // And back: `Shift+Tab` off the panel's first row returns to the clear button, not past it to
    // the trigger — from there the browser's own reverse order finishes the walk.
    const back = tab(footerClear, true);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(panel().exists()).toBe(true);
  });

  it('leaves Tab on the panel last row to the browser, which is the way out', async () => {
    const { trigger, panel } = await openMulti();
    const done = panel().find('[data-part="footerDone"]').element as HTMLElement;
    done.focus();

    const out = tab(done);
    expect(out.defaultPrevented).toBe(false);
    expect(panel().exists()).toBe(true);

    // The browser moves focus on; `useOverlay` closes behind it, exactly as it always has.
    done.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    await flush();
    expect(panel().exists()).toBe(false);
    expect(trigger).toBeTruthy();
  });

  it('leaves a searchable MultiSelect alone, because opening already put focus in the panel', async () => {
    const { panel } = await openMulti({ options: MANY, searchable: true });
    const search = panel().find('[data-part="search"]').element as HTMLElement;
    expect(document.activeElement).toBe(search);

    // The footer is the browser's own next stop from here, so nothing is redirected either way.
    expect(tab(search).defaultPrevented).toBe(false);
    expect(tab(search, true).defaultPrevented).toBe(false);
  });

  it('does not redirect when the panel is rendered in place', async () => {
    const wrapper = mountWith(MultiSelect, {
      props: { options: OPTIONS, searchable: false, teleport: false },
      attrs: NAME,
    });
    mounted.push(wrapper as unknown as VueWrapper);
    const trigger = wrapper.find('[data-part="trigger"]').element as HTMLButtonElement;
    trigger.focus();
    await press(wrapper.find('[data-part="trigger"]'));

    // In place the panel is already after the trigger in the DOM: the browser's order is the
    // spec's order, and touching it would only move focus twice.
    expect(tab(trigger).defaultPrevented).toBe(false);
  });

  it('walks into and out of a SearchBar panel that holds a focusable row control', async () => {
    const bar = mountWith(SearchBar, {
      props: {
        modelValue: 'mer',
        results: {
          products: [{ id: 'p1', title: 'Merino', href: '/p' }],
          collections: [],
          articles: [],
          pages: [],
          total: 1,
        },
      },
      slots: { item: '<button type="button" data-testid="row-action">Add</button>' },
    });
    mounted.push(bar as unknown as VueWrapper);
    const field = bar.find('[data-part="field"]').element as HTMLInputElement;
    field.focus();
    await bar.find('[data-part="field"]').trigger('focus');
    await flush();

    const panel = () => panelOf(field);
    const action = panel().find('[data-testid="row-action"]').element as HTMLElement;

    const forward = tab(field);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(action);
    // `useListbox`'s own `Tab` case closes this popup; the redirect runs in the capture phase, so
    // that never gets the chance to throw away the panel we are walking into.
    expect(panel().exists()).toBe(true);

    const back = tab(action, true);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(panel().exists()).toBe(true);
  });

  it('leaves a SearchBar whose rows are all out of the tab order alone', async () => {
    const bar = mountWith(SearchBar, { props: { recent: ['merino scarf'], popular: ['Linen'] } });
    mounted.push(bar as unknown as VueWrapper);
    const field = bar.find('[data-part="field"]').element as HTMLInputElement;
    field.focus();
    await bar.find('[data-part="field"]').trigger('focus');
    await flush();

    // Every row the panel draws is `tabindex="-1"` — reached through `aria-activedescendant`, never
    // with `Tab` — so there is nothing to walk into and `Tab` keeps its old meaning: close and move
    // on.
    expect(panelOf(field).exists()).toBe(true);
    expect(panelOf(field).findAll('[data-part="clearRecent"]').length).toBeGreaterThan(0);
    const event = tab(field);
    expect(event.defaultPrevented).toBe(false);
    await flush();
    expect(panelOf(field).exists()).toBe(false);
  });
});
