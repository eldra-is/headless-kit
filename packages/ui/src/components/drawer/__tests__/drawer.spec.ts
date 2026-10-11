// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `sectionAdjacentBackground.spec.ts`
// and `source-scan.spec.ts` document).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { isBuilt, itFailsWithoutDist } from '../../../test/built';
import { currentDialog } from '../../../composables/dialogStack';
import { expectClosedModalRendersNothing } from '../../../test/modal';
import Dialog from '../../dialog/Dialog.vue';
import Drawer from '../Drawer.vue';

type Finder = { find: (selector: string) => { element: Element } };

function root(wrapper: Finder): HTMLDialogElement {
  return wrapper.find('[data-part="root"]').element as HTMLDialogElement;
}

function panel(wrapper: Finder): HTMLElement {
  return wrapper.find('[data-part="panel"]').element as HTMLElement;
}

function closeButton(wrapper: Finder): HTMLButtonElement {
  return wrapper.find('[data-part="close"]').element as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Drawer — element and parts', () => {
  it('is a native dialog with a data-part on every named part', () => {
    const wrapper = mountWith(Drawer, {
      props: { title: 'Your cart', modelValue: true },
      slots: { default: 'Line items go here.', footer: '<button type="button">Check out</button>' },
    });
    expect(root(wrapper).tagName).toBe('DIALOG');
    expect(wrapper.find('[data-part="panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="header"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="title"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="close"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="body"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="footer"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('has no role="dialog" anywhere — the native element carries its own semantics', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the title as a real h2', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    const title = wrapper.find('[data-part="title"]').element;
    expect(title.tagName).toBe('H2');
    expect(title.textContent).toContain('Your cart');
    wrapper.unmount();
  });

  it('renders no title part without a title prop', () => {
    const wrapper = mountWith(Drawer, {
      props: { ariaLabel: 'Menu', side: 'left', modelValue: true },
    });
    expect(wrapper.find('[data-part="title"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('stretches the open dialog between the pinned top and bottom, with no viewport-unit height', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Filters', modelValue: true } });
    const classes = root(wrapper).className;
    expect(classes).toContain('inset-0');
    expect(classes).toContain('h-auto');
    expect(classes).not.toMatch(/\bh-(full|dvh|svh|lvh|screen)\b/);
    wrapper.unmount();
  });

  it('renders no footer part without a footer slot', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    expect(wrapper.find('[data-part="footer"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Drawer — side classes', () => {
  it('defaults to right: docked at the end, inner border on the left', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    expect(root(wrapper).className).toContain('justify-end');
    expect(root(wrapper).className).toContain('animate-eldra-drawer-in-right');
    expect(panel(wrapper).className).toContain('border-l');
    wrapper.unmount();
  });

  it('side="left" docks at the start, inner border on the right', () => {
    const wrapper = mountWith(Drawer, {
      props: { ariaLabel: 'Menu', side: 'left', modelValue: true },
    });
    expect(root(wrapper).className).toContain('justify-start');
    expect(root(wrapper).className).toContain('animate-eldra-drawer-in-left');
    expect(panel(wrapper).className).toContain('border-r');
    wrapper.unmount();
  });
});

describe('Drawer — title vs label naming', () => {
  it('with a title: aria-labelledby the title, no aria-label', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    const titleId = wrapper.find('[data-part="title"]').element.id;
    expect(root(wrapper).getAttribute('aria-labelledby')).toBe(titleId);
    expect(root(wrapper).hasAttribute('aria-label')).toBe(false);
    wrapper.unmount();
  });

  it('with only an ariaLabel: aria-label the drawer, no aria-labelledby, no title part', () => {
    const wrapper = mountWith(Drawer, {
      props: { ariaLabel: 'Menu', side: 'left', modelValue: true },
    });
    expect(root(wrapper).getAttribute('aria-label')).toBe('Menu');
    expect(root(wrapper).hasAttribute('aria-labelledby')).toBe(false);
    expect(wrapper.find('[data-part="title"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('title wins over ariaLabel when both are set', () => {
    const wrapper = mountWith(Drawer, {
      props: { title: 'Your cart', ariaLabel: 'Cart drawer', modelValue: true },
    });
    expect(root(wrapper).hasAttribute('aria-label')).toBe(false);
    expect(root(wrapper).hasAttribute('aria-labelledby')).toBe(true);
    wrapper.unmount();
  });

  it('the close button names the drawer from the title: "Close Your cart"', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    expect(closeButton(wrapper).getAttribute('aria-label')).toBe('Close Your cart');
    wrapper.unmount();
  });

  it('the close button names the drawer from ariaLabel when there is no title: "Close Menu"', () => {
    const wrapper = mountWith(Drawer, {
      props: { ariaLabel: 'Menu', side: 'left', modelValue: true },
    });
    expect(closeButton(wrapper).getAttribute('aria-label')).toBe('Close Menu');
    wrapper.unmount();
  });

  it('falls back to the plain "Close" with neither a title nor an ariaLabel', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Drawer, { props: { modelValue: true } });
    expect(closeButton(wrapper).getAttribute('aria-label')).toBe('Close');
    expect(warn).toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('Drawer — count', () => {
  it('renders the count in parentheses, in muted, next to the title', () => {
    const wrapper = mountWith(Drawer, {
      props: { title: 'Your cart', count: 3, modelValue: true },
    });
    const count = wrapper.find('[data-part="count"]').element;
    expect(count.textContent).toBe('(3)');
    expect(count.className).toContain('text-muted');
    wrapper.unmount();
  });

  it('renders no count part without a count prop', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    expect(wrapper.find('[data-part="count"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a zero count — 0 is a real count, not "no count"', () => {
    const wrapper = mountWith(Drawer, {
      props: { title: 'Your cart', count: 0, modelValue: true },
    });
    expect(wrapper.find('[data-part="count"]').element.textContent).toBe('(0)');
    wrapper.unmount();
  });
});

describe('Drawer — width variable and viewport cap', () => {
  it('sets --eldra-drawer-width on the panel from the width prop', () => {
    const wrapper = mountWith(Drawer, {
      props: { title: 'Filters', width: '24rem', modelValue: true },
    });
    expect(panel(wrapper).style.getPropertyValue('--eldra-drawer-width')).toBe('24rem');
    wrapper.unmount();
  });

  it('leaves the variable unset with no width prop, so the utility default (28rem) applies', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    expect(panel(wrapper).style.getPropertyValue('--eldra-drawer-width')).toBe('');
    expect(panel(wrapper).className).toContain('eldra-drawer-width');
    wrapper.unmount();
  });

  const distDir = fileURLToPath(new NodeURL('../../../../dist/', import.meta.url));
  const built = isBuilt(`${distDir}tailwind.css`, `${distDir}index.js`);

  describe('built CSS', () => {
    it.runIf(built)(
      'the width utility clamps to the viewport and goes full-screen below a 48rem viewport',
      async () => {
        const { compile } = await import('@tailwindcss/node');
        const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
          base: distDir,
          onDependency() {},
        });
        const css = compiler.build(['eldra-drawer-width']);

        expect(css).toContain('.eldra-drawer-width {');
        expect(css).toContain('width: min(var(--eldra-drawer-width, 28rem), 100vw);');
        // The full-screen variant is a plain @media query on the viewport, never a @container
        // query — the design spec's own exception for Drawer/Lightbox/Search modal.
        expect(css).toContain('@media (width < 48rem)');
        expect(css).not.toContain('@container');
        const mediaStart = css.indexOf('@media (width < 48rem)');
        const mediaBlock = css.slice(
          mediaStart,
          css.indexOf('}', css.indexOf('{', mediaStart)) + 1
        );
        expect(mediaBlock).toContain('width: 100vw;');
      }
    );

    // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
    itFailsWithoutDist(built);
  });
});

describe('Drawer — body scrolls, footer stays fixed', () => {
  it('the body scrolls on its own; header and footer never shrink', () => {
    const wrapper = mountWith(Drawer, {
      props: { title: 'Your cart', modelValue: true },
      slots: {
        default: '<p>Long content…</p>',
        footer: '<button type="button">Check out</button>',
      },
    });
    expect(wrapper.find('[data-part="body"]').element.className).toContain('overflow-y-auto');
    expect(wrapper.find('[data-part="header"]').element.className).toContain('shrink-0');
    expect(wrapper.find('[data-part="footer"]').element.className).toContain('shrink-0');
    wrapper.unmount();
  });

  it('keeps its own width clamp regardless of a narrow ancestor', () => {
    const wrapper = mountNarrow(Drawer, { props: { title: 'Filters', modelValue: true } });
    expect(wrapper.find('[data-part="panel"]').element.className).toContain('eldra-drawer-width');
    wrapper.unmount();
  });
});

describe('Drawer — open and close (useDialog)', () => {
  it('opens with showModal, reflected as the open attribute', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });

  it('opens when modelValue turns true, and closes when it turns false', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: false } });
    await wrapper.setProps({ modelValue: true });
    expect(root(wrapper).open).toBe(true);
    await wrapper.setProps({ modelValue: false });
    expect(root(wrapper).open).toBe(false);
    wrapper.unmount();
  });

  /** Fix, from the operator's own finding: the Drawer `Cart` story "opens as a dialog; once
   *  closed it just sits on the right-hand side, not as a dialog" — a bare `flex` on the root beat
   *  the UA's own `display: none` for a closed `<dialog>`. */
  it('renders nothing while closed — hidden open:flex on the root, not a bare flex', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: false } });
    expectClosedModalRendersNothing(root(wrapper));
    wrapper.unmount();
  });

  it('closing it (modelValue turns false) goes back to hidden open:flex, not a leftover flex', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    await wrapper.setProps({ modelValue: false });
    expectClosedModalRendersNothing(root(wrapper));
    wrapper.unmount();
  });

  it('the close button closes it, emitting close("button") and update:modelValue(false)', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    await closeButton(wrapper).click();
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['button']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('the close button carries cursor-pointer and the standard focus ring', () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    const cls = closeButton(wrapper).className;
    expect(cls).toContain('cursor-pointer');
    expect(cls).toContain('eldra-focus');
    wrapper.unmount();
  });

  it('Esc fires cancel, then closes with close("escape")', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    root(wrapper).dispatchEvent(new Event('cancel', { cancelable: true }));
    await nextTick();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['escape']);
    wrapper.unmount();
  });

  it('a backdrop click closes it — there is no dismissable prop to gate it', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    root(wrapper).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['backdrop']);
    wrapper.unmount();
  });

  it('a click inside the panel does not close it — the target is a descendant, not the dialog', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    panel(wrapper).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });

  it("the exposed close(value) closes with an action value of the consumer's own", async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    (wrapper.vm as unknown as { close: (v?: string) => void }).close('checkout');
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['checkout']);
    wrapper.unmount();
  });

  /** Final review M2/item 1 — see `dialog.spec.ts`'s identical pair for the full rationale: a
   *  literal `false` default snaps the drawer shut the instant a parent stops binding v-model. */
  it('going uncontrolled (modelValue prop removed) keeps the drawer open instead of snapping shut', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    await wrapper.setProps({ modelValue: undefined });
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });

  it('once uncontrolled, its own close button still closes it and emits update:modelValue(false)', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    await wrapper.setProps({ modelValue: undefined });
    await closeButton(wrapper).click();
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['button']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('a v-model close after a prior button close reads "programmatic", not the stale "button" (I4)', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    await closeButton(wrapper).click();
    await nextTick();
    expect(wrapper.emitted('close')?.[0]).toEqual(['button']);
    // Simulate the real v-model round trip: the parent accepts the emitted `false`, then reopens
    // and closes again from outside (a route with no `returnValue` of its own).
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    await wrapper.setProps({ modelValue: false });
    await nextTick();
    expect(wrapper.emitted('close')?.[1]).toEqual(['programmatic']);
    wrapper.unmount();
  });
});

describe('Drawer — nested modals (operator override, 2026-09-26)', () => {
  it('a second Drawer opens on top of the first — no refusal, no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    const second = mountWith(Drawer, {
      props: { ariaLabel: 'Menu', side: 'left', modelValue: true },
    });
    await nextTick();

    expect(root(first).open).toBe(true);
    expect(root(second).open).toBe(true);
    expect(second.emitted('update:modelValue')).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();

    first.unmount();
    second.unmount();
  });

  /** The story this guards: `StackedConfirm` (cart Drawer → confirm Dialog) — the mechanism the
   *  operator's report described directly ("we should allow modals to open inside of a modal"). */
  it('a Dialog opens on top of an already-open Drawer, and vice versa', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const drawer = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    const dialog = mountWith(Dialog, { props: { title: 'Remove item?', modelValue: true } });
    await nextTick();

    expect((drawer.find('[data-part="root"]').element as HTMLDialogElement).open).toBe(true);
    expect((dialog.find('[data-part="root"]').element as HTMLDialogElement).open).toBe(true);

    // Esc acts on the top (the Dialog, opened last) only.
    (dialog.find('[data-part="root"]').element as HTMLDialogElement).dispatchEvent(
      new Event('cancel', { cancelable: true })
    );
    await nextTick();
    expect((dialog.find('[data-part="root"]').element as HTMLDialogElement).open).toBe(false);
    expect((drawer.find('[data-part="root"]').element as HTMLDialogElement).open).toBe(true);

    drawer.unmount();
    dialog.unmount();
  });

  it('closing the first frees the slot for the next one to open', async () => {
    const first = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    await first.setProps({ modelValue: false });
    expect(currentDialog()).toBeNull();

    const second = mountWith(Drawer, {
      props: { ariaLabel: 'Menu', side: 'left', modelValue: true },
    });
    await nextTick();
    expect(root(second).open).toBe(true);

    first.unmount();
    second.unmount();
  });
});

describe('Drawer — initial focus', () => {
  it('right side (default): focuses the close button when nothing is marked autofocus', async () => {
    const wrapper = mountWith(Drawer, {
      props: { title: 'Your cart', modelValue: true },
      slots: { default: '<a href="#">Continue shopping</a>' },
    });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(closeButton(wrapper));
    wrapper.unmount();
  });

  it('right side: a control marked autofocus wins over the close button', async () => {
    const wrapper = mountWith(Drawer, {
      props: { title: 'Filters', modelValue: true },
      slots: { default: '<input data-testid="query" autofocus />' },
    });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.find('[data-testid="query"]').element);
    wrapper.unmount();
  });

  it('left side: focuses the first link in the menu, never the close button', async () => {
    const wrapper = mountWith(Drawer, {
      props: { ariaLabel: 'Menu', side: 'left', modelValue: true },
      slots: {
        default: '<nav aria-label="Main"><a href="#" data-testid="first-link">Shop all</a></nav>',
      },
    });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.find('[data-testid="first-link"]').element);
    wrapper.unmount();
  });

  it('returns focus to the opener once the drawer closes', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open cart';
    document.body.append(opener);
    opener.focus();

    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: true } });
    await nextTick();
    expect(document.activeElement).not.toBe(opener);

    await wrapper.setProps({ modelValue: false });
    await nextTick();
    expect(document.activeElement).toBe(opener);

    wrapper.unmount();
    opener.remove();
  });
});

describe('Drawer — classes prop', () => {
  it('merges a classes override onto the named part instead of landing beside it', () => {
    const wrapper = mountWith(Drawer, {
      props: {
        title: 'Your cart',
        modelValue: true,
        classes: { panel: 'border-none', title: 'text-h1' },
      },
    });
    const panelClass = panel(wrapper).className;
    const titleClass = wrapper.find('[data-part="title"]').element.className;
    expect(panelClass).toContain('border-none');
    expect(titleClass).toContain('text-h1');
    expect(titleClass).not.toContain('text-drawer-title');
    wrapper.unmount();
  });
});

describe('Drawer — messages', () => {
  it('the close button label overrides through the messages prop when there is no name', () => {
    const wrapper = mountWith(Drawer, {
      props: { modelValue: true, messages: { close: 'Loka' } },
    });
    expect(closeButton(wrapper).getAttribute('aria-label')).toBe('Loka');
    wrapper.unmount();
  });

  it('the closeDrawer message overrides the named close label', () => {
    const wrapper = mountWith(Drawer, {
      props: {
        title: 'Karfa',
        modelValue: true,
        messages: { closeDrawer: (n: string) => `Loka ${n}` },
      },
    });
    expect(closeButton(wrapper).getAttribute('aria-label')).toBe('Loka Karfa');
    wrapper.unmount();
  });
});

describe('Drawer — accessibility', () => {
  it('is axe-clean open, cart-shaped (title, count, footer)', async () => {
    const wrapper = mountWith(Drawer, {
      props: { title: 'Your cart', count: 2, modelValue: true },
      slots: {
        default: '<p>Merino crew sweater</p>',
        footer: '<button type="button">Check out</button>',
      },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean open, menu-shaped (ariaLabel, left side, nav)', async () => {
    const wrapper = mountWith(Drawer, {
      props: { ariaLabel: 'Menu', side: 'left', modelValue: true },
      slots: {
        default: '<nav aria-label="Main"><a href="#">Shop all</a></nav>',
        footer: '<button type="button">Sign in</button>',
      },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean closed', async () => {
    const wrapper = mountWith(Drawer, { props: { title: 'Your cart', modelValue: false } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
