import { afterEach, describe, expect, it } from 'vitest';
import type { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import { panelOf } from '../../../test/popover';
import MultiSelect from '../MultiSelect.vue';
import Select from '../Select.vue';
import type { SelectOption } from '../types';

/**
 * The chrome colours of the select panel (`--eldra-select-panel-*`) and of `MultiSelect`'s tags
 * (`--eldra-select-tag-*`). Each is read by its own part's class only, falling back to the theme
 * colour that part drew before, so a consumer recolours the chrome without redefining a theme-wide
 * `--color-*` on an element that also holds their slotted content.
 */

const OPTIONS: SelectOption[] = [
  { value: 'wool', label: 'Wool', group: 'Natural', hint: 'Warm' },
  { value: 'linen', label: 'Linen', group: 'Natural', meta: '12' },
  { value: 'nylon', label: 'Nylon', group: 'Synthetic' },
  { value: 'acrylic', label: 'Acrylic', group: 'Synthetic', disabled: true },
];

const BG = 'eldra:bg-[color:var(--eldra-select-panel-background,var(--eldra-color-background))]';
const BORDER = 'eldra:border-[color:var(--eldra-select-panel-border,var(--eldra-color-border))]';
const TEXT = 'eldra:text-[color:var(--eldra-select-panel-text,var(--eldra-color-text))]';
const INHERIT = 'eldra:text-[color:var(--eldra-select-panel-text)]';
const MUTED = 'eldra:text-[color:var(--eldra-select-panel-muted,var(--eldra-color-muted))]';
const ACTIVE =
  'eldra:bg-[color:var(--eldra-select-panel-active,var(--eldra-color-surface-strong))]';

const VARIABLES = {
  '--eldra-select-panel-background': '#111827',
  '--eldra-select-panel-border': '#374151',
  '--eldra-select-panel-text': '#f9fafb',
  '--eldra-select-panel-muted': '#d1d5db',
  '--eldra-select-panel-active': '#1f2937',
  '--eldra-select-panel-check': '#93c5fd',
  '--eldra-select-panel-check-contrast': '#111827',
  '--eldra-select-panel-check-border': '#9ca3af',
  '--eldra-select-tag-background': '#1e3a8a',
  '--eldra-select-tag-text': '#ffffff',
  '--eldra-select-tag-muted': '#dbeafe',
};

type Control = typeof Select | typeof MultiSelect;
const mounted: VueWrapper[] = [];

function mount(component: Control, props: Record<string, unknown> = {}) {
  const wrapper = mountWith(component as typeof Select, {
    props: { options: OPTIONS, ...props },
    attrs: { 'aria-label': 'Fibre' },
  });
  mounted.push(wrapper as unknown as VueWrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  for (const name of Object.keys(VARIABLES)) document.documentElement.style.removeProperty(name);
});

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

type Mounted = ReturnType<typeof mount>;
const triggerOf = (wrapper: Mounted) => wrapper.find('[data-part="trigger"]');
const panel = (wrapper: Mounted) => panelOf(triggerOf(wrapper).element);
const part = (wrapper: Mounted, name: string) => panel(wrapper).find(`[data-part="${name}"]`);
const partsOf = (wrapper: Mounted, name: string) => panel(wrapper).findAll(`[data-part="${name}"]`);

async function open(wrapper: Mounted): Promise<void> {
  await triggerOf(wrapper).trigger('pointerdown');
  await triggerOf(wrapper).trigger('click');
  await flush();
}

async function type(wrapper: Mounted, text: string): Promise<void> {
  const input = part(wrapper, 'search').element as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await flush();
}

const CONTROLS: [string, Control][] = [
  ['Select', Select],
  ['MultiSelect', MultiSelect],
];

describe.each(CONTROLS)('%s — panel colour variables', (_name, component) => {
  it('draws the surface, border and inherited text through the panel variables', async () => {
    const wrapper = mount(component);
    await open(wrapper);
    const classes = panel(wrapper).classes();
    expect(classes).toEqual(expect.arrayContaining([BG, BORDER, INHERIT, 'eldra:border']));
    expect(classes).not.toContain('eldra:bg-background');
    expect(classes).not.toContain('eldra:border-border');
  });

  it('reads text, muted, border and active through the variables on every row part', async () => {
    const wrapper = mount(component, { searchable: true });
    await open(wrapper);
    expect(part(wrapper, 'search').classes()).toContain(TEXT);
    expect(part(wrapper, 'search').classes()).toContain(
      MUTED.replace('eldra:', 'eldra:placeholder:')
    );
    expect(part(wrapper, 'search').element.parentElement?.className).toContain(BORDER);
    expect(
      part(wrapper, 'search').element.parentElement?.querySelector('svg')?.getAttribute('class')
    ).toContain(MUTED);

    const groups = partsOf(wrapper, 'group');
    expect(groups[1]?.classes()).toContain(BORDER);
    expect(partsOf(wrapper, 'groupLabel')[0]?.classes()).toContain(MUTED);

    const options = partsOf(wrapper, 'option');
    expect(options[0]?.classes()).toContain(TEXT);
    expect(options[3]?.classes()).toContain(MUTED);
    expect(options[3]?.classes()).not.toContain(TEXT);
    expect(part(wrapper, 'optionHint').classes()).toContain(MUTED);
    expect(part(wrapper, 'optionMeta').classes()).toContain(MUTED);

    const active = options.find((option) => option.classes().includes(ACTIVE));
    expect(active).toBeDefined();
    expect(options.filter((option) => option.classes().includes(ACTIVE))).toHaveLength(1);
  });

  it('draws the empty and loading rows in the panel muted colour', async () => {
    const empty = mount(component, { searchable: true });
    await open(empty);
    await type(empty, 'zzz');
    expect(part(empty, 'empty').classes()).toContain(MUTED);

    const loading = mount(component, { loading: true });
    await open(loading);
    expect(part(loading, 'loading').classes()).toContain(MUTED);
  });

  it('draws the create row and its hairline through the variables', async () => {
    const wrapper = mount(component, { creatable: true });
    await open(wrapper);
    await type(wrapper, 'woo');
    const row = part(wrapper, 'createOption');
    expect(row.classes()).toContain(TEXT);
    expect(row.element.parentElement?.className).toContain(BORDER);
  });

  it('never redefines a theme-wide colour variable on the panel', async () => {
    const wrapper = mount(component, { searchable: true });
    await open(wrapper);
    expect(panel(wrapper).element.outerHTML).not.toMatch(/--(eldra-)?color-[a-z-]+:/);
  });

  it('is axe-clean with the chrome recoloured through its variables', async () => {
    for (const [name, value] of Object.entries(VARIABLES)) {
      document.documentElement.style.setProperty(name, value);
    }
    const wrapper = mount(component, { searchable: true, modelValue: undefined });
    await open(wrapper);
    expect(await axe(panel(wrapper).element)).toHaveNoViolations();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});

describe('Select — selected check', () => {
  it('draws the check mark through --eldra-select-panel-check, falling back to text', async () => {
    const wrapper = mount(Select, { modelValue: 'linen' });
    await open(wrapper);
    expect(part(wrapper, 'optionCheck').classes()).toContain(
      'eldra:text-[color:var(--eldra-select-panel-check,var(--eldra-color-text))]'
    );
  });
});

describe('MultiSelect — selected box, footer and tags', () => {
  it('fills a chosen box through --eldra-select-panel-check, falling back to primary', async () => {
    const wrapper = mount(MultiSelect, { modelValue: ['linen'] });
    await open(wrapper);
    const boxes = partsOf(wrapper, 'optionCheck');
    expect(boxes[1]?.classes()).toEqual(
      expect.arrayContaining([
        'eldra:bg-[color:var(--eldra-select-panel-check,var(--eldra-color-primary))]',
        'eldra:border-[color:var(--eldra-select-panel-check,var(--eldra-color-primary))]',
      ])
    );
    expect(boxes[1]?.find('svg').classes()).toContain(
      'eldra:text-[color:var(--eldra-select-panel-check-contrast,var(--eldra-color-primary-contrast))]'
    );
    expect(boxes[0]?.classes()).toEqual(
      expect.arrayContaining([
        BG,
        'eldra:border-[color:var(--eldra-select-panel-check-border,var(--eldra-color-border-strong))]',
      ])
    );
    // A disabled box keeps the theme's dashed look.
    expect(boxes[3]?.classes()).toEqual(
      expect.arrayContaining([
        'eldra:bg-surface-strong',
        'eldra:border-border',
        'eldra:border-dashed',
      ])
    );
  });

  it('draws the footer through the panel surface, border and muted variables', async () => {
    const wrapper = mount(MultiSelect, { modelValue: ['linen'] });
    await open(wrapper);
    expect(part(wrapper, 'footer').classes()).toEqual(expect.arrayContaining([BG, BORDER]));
    expect(part(wrapper, 'footerCount').classes()).toContain(MUTED);
  });

  it('draws each tag and its remove button through --eldra-select-tag-*', () => {
    const wrapper = mount(MultiSelect, { modelValue: ['wool', 'linen'] });
    const tag = wrapper.find('[data-part="tag"]');
    expect(tag.classes()).toEqual(
      expect.arrayContaining([
        'eldra:bg-[color:var(--eldra-select-tag-background,var(--eldra-color-surface-strong))]',
        'eldra:text-[color:var(--eldra-select-tag-text,var(--eldra-color-text))]',
      ])
    );
    expect(tag.classes()).not.toContain('eldra:bg-surface-strong');
    const remove = wrapper.find('[data-part="tagRemove"]');
    expect(remove.classes()).toEqual(
      expect.arrayContaining([
        'eldra:text-[color:var(--eldra-select-tag-muted,var(--eldra-color-muted))]',
        'eldra:hover:text-[color:var(--eldra-select-tag-text,var(--eldra-color-text))]',
        'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-select-tag-text,var(--eldra-color-text)),transparent_89%)]',
      ])
    );
  });

  it('lets a consumer tag class replace the variable-reading fill', () => {
    const wrapper = mount(MultiSelect, { modelValue: ['wool'], classes: { tag: 'bg-primary' } });
    const classes = wrapper.find('[data-part="tag"]').classes();
    expect(classes).toContain('bg-primary');
    expect(classes.join(' ')).not.toContain('--eldra-select-tag-background');
  });

  it('is axe-clean with the tags recoloured through their variables', async () => {
    for (const [name, value] of Object.entries(VARIABLES)) {
      document.documentElement.style.setProperty(name, value);
    }
    const wrapper = mount(MultiSelect, { modelValue: ['wool', 'linen'] });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
