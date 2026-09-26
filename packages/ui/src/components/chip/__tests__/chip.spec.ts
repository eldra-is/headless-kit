import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconStar } from '@tabler/icons-vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Chip from '../Chip.vue';
import ChipGroup from '../ChipGroup.vue';

/** Twice the length of a typical chip label. */
const LONG_LABEL = 'Hand-glazed stoneware bowl set, made to order in small batches over six weeks';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Chip — element and parts', () => {
  it('renders a plain span with no interactive role by default', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Knitwear' } });
    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('tabindex')).toBeUndefined();
    expect(wrapper.attributes('aria-pressed')).toBeUndefined();
    expect(wrapper.get('[data-part="label"]').text()).toBe('Knitwear');
    wrapper.unmount();
  });

  it('renders a real button when selectable', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Wool', selectable: true } });
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.attributes('aria-pressed')).toBe('false');
    wrapper.unmount();
  });

  it('falls back to the label prop when no default slot is given', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Ceramics' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Ceramics');
    wrapper.unmount();
  });

  it('prefers the default slot over the label prop', () => {
    const wrapper = mountWith(Chip, {
      props: { label: 'Ignored' },
      slots: { default: 'Merino wool' },
    });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Merino wool');
    wrapper.unmount();
  });

  it('renders no icon, avatar or remove button by default', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Knitwear' } });
    expect(wrapper.find('[data-part="icon"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="avatar"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="removeButton"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('accepts a class override for every part', () => {
    const wrapper = mountWith(Chip, {
      props: {
        label: 'Knitwear',
        removable: true,
        icon: IconStar,
        classes: {
          root: 'ring-1',
          icon: 'text-accent',
          label: 'uppercase',
          removeButton: 'italic',
        },
      },
    });
    expect(wrapper.classes()).toContain('ring-1');
    expect(wrapper.get('[data-part="icon"]').classes()).toContain('text-accent');
    expect(wrapper.get('[data-part="label"]').classes()).toContain('uppercase');
    expect(wrapper.get('[data-part="removeButton"]').classes()).toContain('italic');
    wrapper.unmount();
  });
});

describe('Chip — remove', () => {
  it('names the remove button "Remove <label>"', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Sweaters', removable: true } });
    const removeButton = wrapper.get('[data-part="removeButton"]');
    expect(removeButton.element.tagName).toBe('BUTTON');
    expect(removeButton.attributes('aria-label')).toBe('Remove Sweaters');
    wrapper.unmount();
  });

  it('emits remove on a click of the remove button, and nothing else', async () => {
    const wrapper = mountWith(Chip, { props: { label: 'Sweaters', removable: true } });
    await wrapper.get('[data-part="removeButton"]').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[]]);
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('update:selected')).toBeUndefined();
    wrapper.unmount();
  });

  it('emits remove on Backspace or Delete on the remove button', async () => {
    const wrapper = mountWith(Chip, { props: { label: 'Sweaters', removable: true } });
    const removeButton = wrapper.get('[data-part="removeButton"]');
    await removeButton.trigger('keydown', { key: 'Backspace' });
    await removeButton.trigger('keydown', { key: 'Delete' });
    expect(wrapper.emitted('remove')).toEqual([[], []]);
    wrapper.unmount();
  });

  it('emits remove on Backspace or Delete on a focused removable chip root', async () => {
    const wrapper = mountWith(Chip, { props: { label: 'Sweaters', removable: true } });
    expect(wrapper.attributes('tabindex')).toBe('0');
    await wrapper.trigger('keydown', { key: 'Backspace' });
    expect(wrapper.emitted('remove')).toEqual([[]]);
    wrapper.unmount();
  });

  it('ignores other keys on the root and the remove button', async () => {
    const wrapper = mountWith(Chip, { props: { label: 'Sweaters', removable: true } });
    await wrapper.trigger('keydown', { key: 'Enter' });
    await wrapper.get('[data-part="removeButton"]').trigger('keydown', { key: 'a' });
    expect(wrapper.emitted('remove')).toBeUndefined();
    wrapper.unmount();
  });

  it('does not remove or focus when disabled', async () => {
    const wrapper = mountWith(Chip, {
      props: { label: 'Sweaters', removable: true, disabled: true },
    });
    expect(wrapper.attributes('tabindex')).toBeUndefined();
    const removeButton = wrapper.get('[data-part="removeButton"]');
    expect((removeButton.element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.trigger('keydown', { key: 'Backspace' });
    expect(wrapper.emitted('remove')).toBeUndefined();
    wrapper.unmount();
  });

  /** The private library's `FilterChip` rule, kept here too — see `Chip.vue`'s own comment. */
  it('renders a non-interactive root when both removable and selectable are set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Chip, {
      props: { label: 'Sweaters', removable: true, selectable: true },
    });
    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.attributes('aria-pressed')).toBeUndefined();
    expect(wrapper.find('button').exists()).toBe(true);
    expect(wrapper.findAll('button')).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});

describe('Chip — selectable', () => {
  it('toggles selected and emits update:selected and select on click', async () => {
    const wrapper = mountWith(Chip, { props: { label: 'Wool', selectable: true } });
    await wrapper.trigger('click');
    expect(wrapper.emitted('update:selected')).toEqual([[true]]);
    expect(wrapper.emitted('select')).toEqual([[true]]);
    wrapper.unmount();
  });

  it('toggles Enter/Space through native button behaviour, not a manual keydown handler', async () => {
    // A native <button> fires `click` for Enter/Space itself; asserting on a `click` trigger (not
    // `keydown`) is what proves the component does not also handle the keys itself and double-toggle.
    const wrapper = mountWith(Chip, { props: { label: 'Wool', selectable: true } });
    await wrapper.trigger('click');
    await wrapper.trigger('click');
    expect(wrapper.emitted('update:selected')).toEqual([[true], [false]]);
    wrapper.unmount();
  });

  it('fills selected with the primary role and sets aria-pressed', async () => {
    const wrapper = mountWith(Chip, { props: { label: 'Wool', selectable: true, selected: true } });
    expect(wrapper.classes()).toContain('bg-primary');
    expect(wrapper.classes()).toContain('text-primary-contrast');
    expect(wrapper.attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('fills unselected with the surface-strong role', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Wool', selectable: true } });
    expect(wrapper.classes()).toContain('bg-surface-strong');
    expect(wrapper.classes()).toContain('text-text');
    wrapper.unmount();
  });

  it('manages its own state with no v-model bound', async () => {
    const wrapper = mountWith(Chip, { props: { label: 'Wool', selectable: true } });
    await wrapper.trigger('click');
    expect(wrapper.attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('stays controlled once selected is bound: a click still emits, the prop still decides', async () => {
    const wrapper = mountWith(Chip, {
      props: { label: 'Wool', selectable: true, selected: false },
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('update:selected')).toEqual([[true]]);
    // A controlled component does not apply the change itself.
    expect(wrapper.attributes('aria-pressed')).toBe('false');
    await wrapper.setProps({ selected: true });
    expect(wrapper.attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('does not toggle when disabled', async () => {
    const wrapper = mountWith(Chip, {
      props: { label: 'Wool', selectable: true, disabled: true },
    });
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.trigger('click');
    expect(wrapper.emitted('update:selected')).toBeUndefined();
    wrapper.unmount();
  });

  it('disabled follows the muted, cursor-not-allowed treatment', () => {
    const wrapper = mountWith(Chip, {
      props: { label: 'Wool', selectable: true, disabled: true, selected: true },
    });
    expect(wrapper.classes()).toContain('bg-surface-strong');
    expect(wrapper.classes()).toContain('text-muted');
    expect(wrapper.classes()).toContain('cursor-not-allowed');
    wrapper.unmount();
  });
});

describe('Chip — sizes', () => {
  it('defaults to md', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Wool' } });
    expect(wrapper.classes()).toContain('min-h-9');
    wrapper.unmount();
  });

  it('draws the sm size at the MultiSelect tag row height', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Wool', size: 'sm' } });
    expect(wrapper.classes()).toContain('min-h-7');
    expect(wrapper.classes()).toContain('text-caption');
    wrapper.unmount();
  });
});

describe('Chip — icon and avatar', () => {
  it('renders a decorative leading icon', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Organic cotton', icon: IconStar } });
    const icon = wrapper.get('[data-part="icon"]');
    const svg = icon.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('renders an avatar at the chip icon size, overriding the Avatar default size', () => {
    const wrapper = mountWith(Chip, { props: { label: 'Ingrid Solberg', avatar: '/ingrid.jpg' } });
    const avatarWrap = wrapper.get('[data-part="avatar"]');
    const avatarRoot = avatarWrap.get('[data-part="root"]');
    expect(avatarRoot.classes()).toContain('size-4');
    expect(avatarRoot.classes()).not.toContain('size-8');
    wrapper.unmount();
  });

  it('prefers avatar over icon when both are given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Chip, {
      props: { label: 'Ingrid Solberg', avatar: '/ingrid.jpg', icon: IconStar },
    });
    expect(wrapper.find('[data-part="avatar"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="icon"]').exists()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});

describe('Chip — content', () => {
  it('never wraps a long label', () => {
    const wrapper = mountWith(Chip, { props: { label: LONG_LABEL } });
    expect(wrapper.classes()).toContain('whitespace-nowrap');
    wrapper.unmount();
  });

  it('renders inside a narrow container without overflowing', () => {
    const wrapper = mountNarrow(Chip, { props: { label: LONG_LABEL, removable: true } });
    expect(wrapper.classes()).toContain('max-w-full');
    wrapper.unmount();
  });
});

describe('Chip — accessibility', () => {
  it('has no axe violations plain, selectable or removable', async () => {
    const plain = mountWith(Chip, { props: { label: 'Knitwear' } });
    expect(await axe(plain.element)).toHaveNoViolations();
    plain.unmount();

    const selectable = mountWith(Chip, { props: { label: 'Wool', selectable: true } });
    expect(await axe(selectable.element)).toHaveNoViolations();
    selectable.unmount();

    const removable = mountWith(Chip, { props: { label: 'Sweaters', removable: true } });
    expect(await axe(removable.element)).toHaveNoViolations();
    removable.unmount();
  });

  it('has no axe violations selected, disabled, with an icon or an avatar', async () => {
    const selected = mountWith(Chip, {
      props: { label: 'Wool', selectable: true, selected: true },
    });
    expect(await axe(selected.element)).toHaveNoViolations();
    selected.unmount();

    const disabled = mountWith(Chip, {
      props: { label: 'Sweaters', removable: true, disabled: true },
    });
    expect(await axe(disabled.element)).toHaveNoViolations();
    disabled.unmount();

    const withIcon = mountWith(Chip, { props: { label: 'Organic cotton', icon: IconStar } });
    expect(await axe(withIcon.element)).toHaveNoViolations();
    withIcon.unmount();

    const withAvatar = mountWith(Chip, { props: { label: 'Ingrid Solberg', avatar: '/i.jpg' } });
    expect(await axe(withAvatar.element)).toHaveNoViolations();
    withAvatar.unmount();
  });
});

describe('ChipGroup — element and toggling', () => {
  it('renders role="group" with the given label', () => {
    const wrapper = mountWith(ChipGroup, { props: { modelValue: [], label: 'Materials' } });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('role')).toBe('group');
    expect(wrapper.attributes('aria-label')).toBe('Materials');
    wrapper.unmount();
  });

  it('derives each chip’s selected state from modelValue', () => {
    const wrapper = mountWith(ChipGroup, {
      props: { modelValue: ['wool'], label: 'Materials' },
      slots: {
        default: `
          <Chip value="wool" selectable label="Wool" />
          <Chip value="cotton" selectable label="Cotton" />
        `,
      },
      global: { components: { Chip } },
    });
    const chips = wrapper.findAll('button');
    expect(chips[0]?.attributes('aria-pressed')).toBe('true');
    expect(chips[1]?.attributes('aria-pressed')).toBe('false');
    wrapper.unmount();
  });

  it('emits update:modelValue with a new array on toggle, adding and removing', async () => {
    const wrapper = mountWith(ChipGroup, {
      props: { modelValue: ['wool'], label: 'Materials' },
      slots: {
        default: `
          <Chip value="wool" selectable label="Wool" />
          <Chip value="cotton" selectable label="Cotton" />
        `,
      },
      global: { components: { Chip } },
    });
    const chips = wrapper.findAll('button');
    await chips[1]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['wool', 'cotton']]);

    await chips[0]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([[]]);
    wrapper.unmount();
  });

  it('never mutates the array instance it was given', async () => {
    const modelValue = ['wool'];
    const wrapper = mountWith(ChipGroup, {
      props: { modelValue, label: 'Materials' },
      slots: { default: `<Chip value="cotton" selectable label="Cotton" />` },
      global: { components: { Chip } },
    });
    await wrapper.get('button').trigger('click');
    expect(modelValue).toEqual(['wool']);
    wrapper.unmount();
  });

  it('disables every member chip, and toggling a disabled chip does nothing', async () => {
    const wrapper = mountWith(ChipGroup, {
      props: { modelValue: [], label: 'Materials', disabled: true },
      slots: { default: `<Chip value="wool" selectable label="Wool" />` },
      global: { components: { Chip } },
    });
    const chip = wrapper.get('button');
    expect((chip.element as HTMLButtonElement).disabled).toBe(true);
    await chip.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await nextTick();
    wrapper.unmount();
  });

  it('lets a member chip disable itself independently', () => {
    const wrapper = mountWith(ChipGroup, {
      props: { modelValue: [], label: 'Materials' },
      slots: {
        default: `
          <Chip value="wool" selectable label="Wool" />
          <Chip value="cotton" selectable label="Cotton" disabled />
        `,
      },
      global: { components: { Chip } },
    });
    const chips = wrapper.findAll('button');
    expect((chips[0].element as HTMLButtonElement).disabled).toBe(false);
    expect((chips[1].element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('accepts a root class override', () => {
    const wrapper = mountWith(ChipGroup, {
      props: { modelValue: [], label: 'Materials', classes: { root: 'ring-1' } },
    });
    expect(wrapper.classes()).toContain('ring-1');
    wrapper.unmount();
  });

  it('has no axe violations', async () => {
    const wrapper = mountWith(ChipGroup, {
      props: { modelValue: ['wool'], label: 'Materials' },
      slots: {
        default: `
          <Chip value="wool" selectable label="Wool" />
          <Chip value="cotton" selectable label="Cotton" />
        `,
      },
      global: { components: { Chip } },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
