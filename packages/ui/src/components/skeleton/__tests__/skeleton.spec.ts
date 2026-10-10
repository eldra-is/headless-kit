import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Skeleton from '../Skeleton.vue';
import type { SkeletonVariant } from '../types';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Skeleton — element and parts', () => {
  it('renders a <div> root with data-part="root" and no interactive role', () => {
    const wrapper = mountWith(Skeleton);
    expect(wrapper.element.tagName).toBe('DIV');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('tabindex')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders one line by default (variant="text", lines=1)', () => {
    const wrapper = mountWith(Skeleton);
    expect(wrapper.findAll('[data-part="line"]')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('Skeleton — root is block-level (the percentage-width-in-shrink-to-fit trap)', () => {
  it('is block and w-full by default, with no inline width', () => {
    const wrapper = mountWith(Skeleton);
    expect(wrapper.classes()).toContain('block');
    expect(wrapper.classes()).toContain('w-full');
    expect(wrapper.attributes('style')).toBeUndefined();
    wrapper.unmount();
  });

  it('drops w-full and sets an explicit style width when `width` is given, staying block', () => {
    const wrapper = mountWith(Skeleton, { props: { width: '12rem' } });
    expect(wrapper.classes()).toContain('block');
    expect(wrapper.classes()).not.toContain('w-full');
    expect(wrapper.attributes('style')).toContain('width: 12rem');
    wrapper.unmount();
  });

  it("every line falls back to w-full (the root's own definite width) once `width` is set", () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'text', lines: 3, width: '12rem' } });
    for (const line of wrapper.findAll('[data-part="line"]')) {
      expect(line.classes()).toContain('w-full');
    }
    const title = mountWith(Skeleton, { props: { variant: 'title', width: '8rem' } });
    expect(title.get('[data-part="line"]').classes()).toContain('w-full');
    title.unmount();
    wrapper.unmount();
  });
});

describe('Skeleton — text variant', () => {
  it('a single line (default) is w-full, h-3.5, rounded-sm', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'text' } });
    const line = wrapper.get('[data-part="line"]');
    expect(line.classes()).toEqual(
      expect.arrayContaining(['eldra-skeleton', 'h-3.5', 'rounded-sm', 'w-full'])
    );
    wrapper.unmount();
  });

  it('renders `lines` rows, widths cycling 85/70/55/35% deterministically by index', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'text', lines: 4 } });
    const rows = wrapper.findAll('[data-part="line"]');
    expect(rows).toHaveLength(4);
    expect(rows[0]?.classes()).toContain('w-[85%]');
    expect(rows[1]?.classes()).toContain('w-[70%]');
    expect(rows[2]?.classes()).toContain('w-[55%]');
    expect(rows[3]?.classes()).toContain('w-[35%]');
    wrapper.unmount();
  });

  it('wraps the cycle back to 85% on a fifth line', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'text', lines: 5 } });
    const rows = wrapper.findAll('[data-part="line"]');
    expect(rows).toHaveLength(5);
    expect(rows[4]?.classes()).toContain('w-[85%]');
    wrapper.unmount();
  });

  it('an explicit `width` renders every line at that literal width, not the cycle', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'text', lines: 3, width: '20rem' } });
    const rows = wrapper.findAll('[data-part="line"]');
    for (const row of rows) {
      expect(row.classes()).not.toEqual(
        expect.arrayContaining(['w-[85%]', 'w-[70%]', 'w-[55%]', 'w-[35%]'])
      );
      expect(row.classes()).toContain('w-full');
    }
    wrapper.unmount();
  });

  it('clamps a non-positive or fractional `lines` to at least one whole row', () => {
    const zero = mountWith(Skeleton, { props: { variant: 'text', lines: 0 } });
    expect(zero.findAll('[data-part="line"]')).toHaveLength(1);
    zero.unmount();

    const fractional = mountWith(Skeleton, { props: { variant: 'text', lines: 2.9 } });
    expect(fractional.findAll('[data-part="line"]')).toHaveLength(2);
    fractional.unmount();
  });

  it('ignores `lines` for every other variant (always exactly one shape)', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'title', lines: 5 } });
    expect(wrapper.findAll('[data-part="line"]')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('Skeleton — title variant', () => {
  it('renders one 60%-wide, 1.5rem-tall bar', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'title' } });
    const line = wrapper.get('[data-part="line"]');
    expect(line.classes()).toEqual(
      expect.arrayContaining(['eldra-skeleton', 'h-6', 'rounded-sm', 'w-[60%]'])
    );
    wrapper.unmount();
  });
});

describe('Skeleton — circle variant', () => {
  it('sets width and height from `size`, fully round', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'circle' } });
    const line = wrapper.get('[data-part="line"]');
    expect(line.classes()).toContain('rounded-full');
    expect(line.attributes('style')).toContain('width: 2.5rem');
    expect(line.attributes('style')).toContain('height: 2.5rem');
    wrapper.unmount();
  });

  it('honours a custom size on both axes', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'circle', size: '4rem' } });
    const line = wrapper.get('[data-part="line"]');
    expect(line.attributes('style')).toContain('width: 4rem');
    expect(line.attributes('style')).toContain('height: 4rem');
    wrapper.unmount();
  });
});

describe('Skeleton — media variant', () => {
  it('defaults to the 4x5 ratio and radius-lg', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'media' } });
    const line = wrapper.get('[data-part="line"]');
    expect(line.classes()).toEqual(expect.arrayContaining(['rounded-lg', 'w-full']));
    expect(line.attributes('style')).toContain('aspect-ratio: 4 / 5');
    wrapper.unmount();
  });

  it.each([
    ['1x1', '1 / 1'],
    ['4x3', '4 / 3'],
    ['16x9', '16 / 9'],
  ] as const)('sets the aspect-ratio style for %s', (ratio, expected) => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'media', ratio } });
    expect(wrapper.get('[data-part="line"]').attributes('style')).toContain(
      `aspect-ratio: ${expected}`
    );
    wrapper.unmount();
  });
});

describe('Skeleton — btn variant', () => {
  it('takes the shared control height, full width, radius-md', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'btn' } });
    const line = wrapper.get('[data-part="line"]');
    expect(line.classes()).toEqual(expect.arrayContaining(['control-h', 'w-full', 'rounded-md']));
    wrapper.unmount();
  });
});

describe('Skeleton — shimmer (eldra-skeleton, reduced-motion aware)', () => {
  it.each(['text', 'title', 'circle', 'media', 'btn'] as SkeletonVariant[])(
    'every %s shape carries the shared eldra-skeleton shimmer utility',
    (variant) => {
      const wrapper = mountWith(Skeleton, { props: { variant } });
      for (const line of wrapper.findAll('[data-part="line"]')) {
        expect(line.classes()).toContain('eldra-skeleton');
      }
      wrapper.unmount();
    }
  );

  it('carries the shimmer on every line of a multi-row text skeleton, not just the first', () => {
    const wrapper = mountWith(Skeleton, { props: { variant: 'text', lines: 3 } });
    for (const line of wrapper.findAll('[data-part="line"]')) {
      expect(line.classes()).toContain('eldra-skeleton');
    }
    wrapper.unmount();
  });
});

describe('Skeleton — accessibility', () => {
  it('hides the root from assistive technology and exposes no live region', () => {
    const wrapper = mountWith(Skeleton);
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('aria-busy')).toBeUndefined();
    expect(wrapper.attributes('aria-live')).toBeUndefined();
    expect(wrapper.attributes('role')).toBeUndefined();
    wrapper.unmount();
  });

  it.each(['text', 'title', 'circle', 'media', 'btn'] as SkeletonVariant[])(
    'has no axe violations for the %s variant',
    async (variant) => {
      const wrapper = mountWith(Skeleton, { props: { variant, lines: 3 } });
      expect(await axe(wrapper.element)).toHaveNoViolations();
      wrapper.unmount();
    }
  );
});

describe('Skeleton — busyLabel', () => {
  it('is a named live busy region when busyLabel is given', () => {
    const wrapper = mountWith(Skeleton, { props: { busyLabel: 'Loading products…' } });
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.attributes('aria-label')).toBe('Loading products…');
    expect(wrapper.attributes('aria-hidden')).toBeUndefined();
    wrapper.unmount();
  });

  it('hides every shape from assistive technology even when the root is the named region', () => {
    const wrapper = mountWith(Skeleton, {
      props: { busyLabel: 'Loading products…', variant: 'text', lines: 3 },
    });
    for (const line of wrapper.findAll('[data-part="line"]')) {
      expect(line.attributes('aria-hidden')).toBe('true');
    }
    wrapper.unmount();
  });

  it('treats an empty or null busyLabel the same as omitted — the root stays aria-hidden', () => {
    const empty = mountWith(Skeleton, { props: { busyLabel: '' } });
    expect(empty.attributes('aria-hidden')).toBe('true');
    expect(empty.attributes('role')).toBeUndefined();
    empty.unmount();

    const nullLabel = mountWith(Skeleton, { props: { busyLabel: null } });
    expect(nullLabel.attributes('aria-hidden')).toBe('true');
    expect(nullLabel.attributes('role')).toBeUndefined();
    nullLabel.unmount();
  });

  it('has no axe violations when named as a busy region', async () => {
    const wrapper = mountWith(Skeleton, {
      props: { busyLabel: 'Loading products…', variant: 'text', lines: 3 },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Skeleton — customisation', () => {
  it('lets classes.root replace a utility instead of landing beside it', () => {
    const wrapper = mountWith(Skeleton, { props: { classes: { root: 'w-40' } } });
    expect(wrapper.classes()).toContain('w-40');
    expect(wrapper.classes()).not.toContain('w-full');
    wrapper.unmount();
  });

  it('applies classes.line to every rendered line', () => {
    const wrapper = mountWith(Skeleton, {
      props: { variant: 'text', lines: 3, classes: { line: 'rounded-full' } },
    });
    for (const line of wrapper.findAll('[data-part="line"]')) {
      expect(line.classes()).toContain('rounded-full');
      expect(line.classes()).not.toContain('rounded-sm');
    }
    wrapper.unmount();
  });
});

describe('Skeleton — narrow container', () => {
  it('renders a composed card (media + title + text) in a 20rem container without throwing', () => {
    const media = mountNarrow(Skeleton, { props: { variant: 'media' } });
    const title = mountNarrow(Skeleton, { props: { variant: 'title' } });
    const text = mountNarrow(Skeleton, { props: { variant: 'text', lines: 2 } });
    for (const wrapper of [media, title, text]) {
      const host = wrapper.element.closest('[data-eldra-narrow-host]') as HTMLElement;
      expect(host).not.toBeNull();
      expect(wrapper.find('[data-part="line"]').exists()).toBe(true);
      wrapper.unmount();
    }
  });
});
