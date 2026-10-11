// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSSRApp, defineComponent, h, ref, Teleport } from 'vue';
import { renderToString } from 'vue/server-renderer';
import SearchBar from '../../search-bar/SearchBar.vue';
import MultiSelect from '../MultiSelect.vue';
import Select from '../Select.vue';
import type { SelectOption } from '../types';
import { usePopover } from '../usePopover';

/**
 * The teleport has to survive a server render, and this file runs with **no DOM at all** (`node`,
 * not the package's usual `happy-dom`) — which is the real shape of the problem. A `<Teleport>`
 * whose target is resolved eagerly would reach for `document.body` here and throw; one that
 * rendered into the server's teleport buffer would put markup somewhere the client's hydration
 * never looks, and Vue would report a mismatch on the first interaction.
 *
 * `usePopover` closes both doors. The target is only computed after `onMounted`, which never runs
 * on the server, and `<Teleport>` is `disabled` until then; and the `v-if` sits on the `<Teleport>`
 * itself, so a closed popup — which every one of these is, on the server — emits nothing, not even
 * the teleport's own anchor comments.
 *
 * `examples/starter-nuxt` proves the same thing end to end: `pnpm --filter starter-nuxt generate`
 * pre-renders the whole site, and a teleport that misbehaved would fail the build there.
 */

const OPTIONS: SelectOption[] = [
  { value: 'oat', label: 'Oat' },
  { value: 'clay', label: 'Clay' },
];

async function render(component: unknown, props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render: () => h(component as never, props),
  });
  return await renderToString(app);
}

describe('server rendering with no DOM', () => {
  it('renders Select without touching the document, and emits no panel', async () => {
    const html = await render(Select, { options: OPTIONS, 'aria-label': 'Colour' });

    expect(html).toContain('data-part="trigger"');
    expect(html).toContain('data-part="native"');
    // Nothing of the popup, and no teleport anchors for hydration to trip over. (The `<!--teleport
    // start-->` / `<!--teleport anchor-->` pair is what `ssrRenderTeleport` emits; the components'
    // own source comments mention the word too, hence the `<!--` on the front of the needle.)
    expect(html).not.toContain('data-part="panel"');
    expect(html).not.toContain('data-part="listbox"');
    expect(html).not.toContain('<!--teleport');
  });

  it('renders MultiSelect and SearchBar the same way', async () => {
    const multi = await render(MultiSelect, { options: OPTIONS, 'aria-label': 'Colours' });
    expect(multi).toContain('data-part="trigger"');
    expect(multi).not.toContain('data-part="panel"');
    expect(multi).not.toContain('<!--teleport');

    const bar = await render(SearchBar, { popular: ['Merino'] });
    expect(bar).toContain('data-part="field"');
    expect(bar).not.toContain('data-part="panel"');
    expect(bar).not.toContain('<!--teleport');
  });

  /**
   * The `v-if` on the `<Teleport>` is what keeps the three components' server output empty, so on
   * its own it would hide a broken `teleportDisabled` completely. This host opens the popup
   * *during setup*, which is the one shape that reaches the teleport on the server — and the one a
   * consumer building their own control on `usePopover` can write by accident.
   *
   * With `teleportDisabled` true before mount, the content renders **in place**, so it is in the
   * returned HTML and the client's first render agrees with it. Drop the `isMounted` half and the
   * content goes into `ssrRenderTeleport`'s own buffer instead: gone from this string, and a
   * hydration mismatch on the client.
   */
  it('renders an already-open popup in place, not into the teleport buffer', async () => {
    const Host = defineComponent({
      setup() {
        const trigger = ref<HTMLElement | null>(null);
        const content = ref<HTMLElement | null>(null);
        const popover = usePopover({ trigger, content });
        popover.setOpen(true);
        return () =>
          h('div', [
            h('button', { ref: trigger }, 'open'),
            h(
              Teleport,
              { to: popover.teleportTo.value, disabled: popover.teleportDisabled.value },
              [h('div', { ref: content, 'data-part': 'panel' }, 'the panel')]
            ),
          ]);
      },
    });

    const html = await renderToString(createSSRApp(Host));
    expect(html).toContain('data-part="panel"');
    expect(html).toContain('the panel');
  });

  it('renders a teleport: false control identically, so the option changes nothing on the server', async () => {
    const teleported = await render(Select, { options: OPTIONS, 'aria-label': 'Colour' });
    const inPlace = await render(Select, {
      options: OPTIONS,
      'aria-label': 'Colour',
      teleport: false,
    });
    expect(inPlace).toBe(teleported);
  });
});
