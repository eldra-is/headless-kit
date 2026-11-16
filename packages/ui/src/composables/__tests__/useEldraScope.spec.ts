import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, type Component, type VNode } from 'vue';
import Button from '../../components/button/Button.vue';
import Chip from '../../components/chip/Chip.vue';
import Dialog from '../../components/dialog/Dialog.vue';
import Input from '../../components/input/Input.vue';
import Popover from '../../components/popover/Popover.vue';
import Tabs from '../../components/tabs/Tabs.vue';
import Toaster from '../../components/toast/Toaster.vue';
import { provideEldraScope } from '../../index';
import { axe } from '../../test/axe';
import { mountWith } from '../../test/mount';
import { panelOf } from '../../test/popover';
import { useToast } from '../useToast';

const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  useToast().clear();
  document.body.innerHTML = '';
});

/** A consumer's wrapper: `provideEldraScope(scope)` in its setup, then the kit component. */
function mountScoped(render: () => VNode, scope?: string | null) {
  const Wrapper = defineComponent({
    setup() {
      if (scope !== null) provideEldraScope(scope);
      return render;
    },
  });
  const wrapper = mountWith(Wrapper as Component) as unknown as VueWrapper;
  mounted.push(wrapper);
  return wrapper;
}

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const scopes = (root: ParentNode = document.body) =>
  [...root.querySelectorAll('[data-eldra-scope]')].map((element) =>
    element.getAttribute('data-eldra-scope')
  );

describe('provideEldraScope', () => {
  it('renders no scope anywhere without a provider', async () => {
    mountScoped(
      () =>
        h('div', [
          h(Button, { variant: 'primary' }, () => 'Add'),
          h(Input, { modelValue: 'wool', clearable: true }, { suffix: () => 'kr.' }),
          h(Dialog, { title: 'Remove?', modelValue: true }, () => 'Body'),
        ]),
      null
    );
    await flush();
    expect(document.body.querySelector('[data-eldra-ui]')).not.toBeNull();
    expect(scopes()).toEqual([]);
  });

  it('puts the name on the root, defaulting to "default"', () => {
    const named = mountScoped(() => h(Button, () => 'Add'), 'studio');
    expect(named.element.getAttribute('data-eldra-scope')).toBe('studio');
    const unnamed = mountScoped(() => h(Button, () => 'Add'));
    expect(unnamed.element.getAttribute('data-eldra-scope')).toBe('default');
  });

  it('reaches every component below the provider, the consumer slot content included', () => {
    const wrapper = mountScoped(
      () =>
        h(Tabs, { ariaLabel: 'Product', items: [{ value: 'a', title: 'A', content: 'Panel' }] }),
      'studio'
    );
    const roots = [...wrapper.element.querySelectorAll('[data-eldra-ui]'), wrapper.element];
    expect(roots.length).toBeGreaterThan(2);
    for (const root of roots) expect(root.getAttribute('data-eldra-scope')).toBe('studio');
  });

  it('marks a teleported panel and its slot host', async () => {
    mountScoped(
      () =>
        h(
          Popover,
          { ariaLabel: 'Sort' },
          {
            trigger: ({ attrs }: { attrs: Record<string, unknown> }) => h('button', attrs, 'Sort'),
            default: () => h('p', { id: 'mine' }, 'Mine'),
          }
        ),
      'studio'
    );
    const trigger = document.querySelector<HTMLElement>('[aria-haspopup]')!;
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    await flush();
    const panel = panelOf(trigger).element;
    expect(panel.closest('[data-eldra-scope]')).toBe(panel);
    expect(panel.getAttribute('data-eldra-scope')).toBe('studio');
    expect(panel.hasAttribute('data-eldra-slot')).toBe(true);
    expect(document.getElementById('mine')!.parentElement).toBe(panel);
  });

  it('marks a dialog, its title, body and footer hosts, and the description beside the body slot', async () => {
    mountScoped(
      () =>
        h(
          Dialog,
          { modelValue: true, description: 'Kept for 30 days.' },
          {
            title: () => h('span', 'Remove?'),
            default: () => h('p', 'Body'),
            footer: () => h(Button, () => 'OK'),
          }
        ),
      'studio'
    );
    await flush();
    const dialog = document.querySelector('dialog')!;
    expect(dialog.getAttribute('data-eldra-scope')).toBe('studio');
    for (const part of ['title', 'body', 'footer'])
      expect(dialog.querySelector(`[data-part="${part}"]`)!.hasAttribute('data-eldra-slot')).toBe(
        true
      );
    const description = dialog.querySelector('[data-part="description"]')!;
    expect(description.getAttribute('data-eldra-scope')).toBe('studio');
    expect(
      dialog.querySelector('[data-part="footer"] button')!.getAttribute('data-eldra-scope')
    ).toBe('studio');
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('marks every toast the toaster teleports', async () => {
    mountScoped(() => h(Toaster), 'studio');
    useToast().show({ title: 'Saved' });
    await flush();
    const toast = document.querySelector('[data-part="icon"]')!.closest('[data-eldra-ui]')!;
    expect(toast.getAttribute('data-eldra-scope')).toBe('studio');
    expect(scopes().every((scope) => scope === 'studio')).toBe(true);
    expect(scopes().length).toBeGreaterThan(1);
  });
});

describe('data-eldra-slot', () => {
  it('marks a slot host only while the slot has content, with or without a provider', () => {
    for (const scope of [null, 'studio']) {
      const filled = mountScoped(() => h(Button, () => h('span', 'Add')), scope);
      expect(filled.find('[data-part="label"]').attributes('data-eldra-slot')).toBe('');
      const fallback = mountScoped(() => h(Button, { variant: 'primary', label: 'Add' }), scope);
      expect(fallback.find('[data-part="label"]').attributes('data-eldra-slot')).toBeUndefined();
    }
  });

  it("scopes the kit's own element beside a slot, so it is styled below the host", () => {
    const wrapper = mountScoped(
      () => h(Input, { modelValue: 'wool', clearable: true }, { suffix: () => 'kr.' }),
      'studio'
    );
    const suffix = wrapper.find('[data-part="suffix"]');
    expect(suffix.attributes('data-eldra-slot')).toBe('');
    const clear = suffix.find('button');
    expect(clear.attributes('data-eldra-scope')).toBe('studio');
  });

  it('leaves a scoped component as accessible as an unscoped one', async () => {
    const chip = () => h(Chip, { label: 'Wool', removable: true }, () => h('span', 'Wool'));
    const scoped = mountScoped(chip, 'studio');
    expect(scoped.find('[data-part="label"]').attributes('data-eldra-slot')).toBe('');
    expect(await axe(scoped.element)).toHaveNoViolations();
    const button = mountScoped(() => h(Button, { variant: 'primary' }, () => 'Add'), 'studio');
    expect(await axe(button.element)).toHaveNoViolations();
  });
});
