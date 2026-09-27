import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { cx, partClass } from '../cx';

describe('cx', () => {
  it('joins string arguments', () => {
    expect(cx('rounded-md', 'px-4')).toBe('rounded-md px-4');
  });

  it('drops false, null and undefined arguments', () => {
    expect(cx('rounded-md', false, null, undefined, 'px-4')).toBe('rounded-md px-4');
  });

  it('takes the truthy keys of an object argument, in order', () => {
    expect(cx('rounded-md', { 'px-4': true, 'px-2': false, 'py-2': true })).toBe(
      'rounded-md px-4 py-2'
    );
  });

  it('lets a later Tailwind class win over an earlier one in the same group', () => {
    expect(cx('bg-primary', 'bg-accent')).toBe('bg-accent');
  });

  it('resolves conflicts across argument forms', () => {
    expect(cx('bg-surface px-4', { 'bg-surface-strong': true })).toBe('px-4 bg-surface-strong');
  });

  it('returns an empty string when nothing is passed', () => {
    expect(cx()).toBe('');
    expect(cx(undefined, false, null)).toBe('');
  });

  it('keeps unrelated utilities that merely share a prefix', () => {
    expect(cx('size-4', 'shrink-0')).toBe('size-4 shrink-0');
  });
});

describe('cx — custom @utility class groups', () => {
  it('lets a stock font-size utility replace a custom type-style utility', () => {
    expect(cx('text-button-md', 'text-lg')).toBe('text-lg');
  });

  it('lets a stock height utility replace a custom control-height utility', () => {
    expect(cx('control-h', 'h-8')).toBe('h-8');
  });

  it('lets one focus-ring variant replace another', () => {
    expect(cx('eldra-focus', 'eldra-focus-inset')).toBe('eldra-focus-inset');
  });

  it('keeps eldra-focus-always beside eldra-focus, which it modifies rather than replaces', () => {
    // The defect: `eldra-focus-always` shared a class group with `eldra-focus`, so a text field's
    // own `eldra-focus eldra-focus-always` collapsed to `eldra-focus-always` — a `:focus` rule
    // with no ring behind it (the outline, the infill and the transition list are all declared by
    // `eldra-focus`). Input is the first component to need both.
    expect(cx('eldra-focus', 'eldra-focus-always')).toBe('eldra-focus eldra-focus-always');
    expect(cx('eldra-focus-always', 'eldra-focus-always')).toBe('eldra-focus-always');
  });

  it('lets one control height replace another', () => {
    expect(cx('control-h-sm', 'control-h-lg')).toBe('control-h-lg');
  });

  it('lets one target utility replace another of the same kind', () => {
    expect(cx('target-min', 'target-min')).toBe('target-min');
  });

  it('lets one duration utility replace another', () => {
    expect(cx('duration-fast', 'duration-slow')).toBe('duration-slow');
  });

  it('lets one z-layer utility replace another', () => {
    expect(cx('z-sticky', 'z-toast')).toBe('z-toast');
  });

  it('lets one spin animation replace another', () => {
    expect(cx('animate-eldra-spin', 'animate-eldra-pulse')).toBe('animate-eldra-pulse');
  });

  it('keeps unrelated custom utilities that do not conflict', () => {
    expect(cx('control-h', 'text-button-md', 'eldra-focus')).toBe(
      'control-h text-button-md eldra-focus'
    );
  });

  it('keeps a custom utility beside an unrelated stock utility', () => {
    expect(cx('target-min', 'bg-primary')).toBe('target-min bg-primary');
  });

  it('lets a consumer font size replace a control type style', () => {
    expect(cx('text-control', 'text-body-lg')).toBe('text-body-lg');
    expect(cx('text-control-sm', 'text-control-lg')).toBe('text-control-lg');
    // The viewport override is a different variant, so it is not the same utility.
    expect(cx('text-control', 'max-md:text-control-mobile')).toBe(
      'text-control max-md:text-control-mobile'
    );
  });

  it('dedupes eldra-field-invalid against itself instead of keeping both', () => {
    expect(cx('eldra-field-invalid', 'eldra-field-invalid')).toBe('eldra-field-invalid');
  });

  it('dedupes eldra-link-radius against itself instead of keeping both', () => {
    expect(cx('eldra-link-radius', 'eldra-link-radius')).toBe('eldra-link-radius');
  });

  it('lets a stock rounded utility replace eldra-link-radius', () => {
    expect(cx('eldra-link-radius', 'rounded-full')).toBe('rounded-full');
  });

  // The defect: `text-variant-legend` and `text-variant-pill` shipped in `tailwind.css` (the
  // `VariantPicker` legend and pill type styles) without a matching entry in this file's `text`
  // array, so they fell into `tailwind-merge`'s own default text-*colour* group instead of the
  // font-size one — `cx('text-variant-legend', 'text-lg')` kept both instead of the `text-lg`
  // winning, and worse, `cx('text-variant-legend', 'text-red-500')` (a genuinely unrelated
  // property) *dropped* the legend's type style, because tailwind-merge still read both as
  // "text colour" and let the later one win.
  it('lets a stock font-size utility replace the variant-picker type styles', () => {
    expect(cx('text-variant-legend', 'text-lg')).toBe('text-lg');
    expect(cx('text-variant-pill', 'text-lg')).toBe('text-lg');
  });
});

describe('partClass', () => {
  it('returns the base classes when no overrides are given', () => {
    expect(partClass('rounded-md px-4', undefined, 'container')).toBe('rounded-md px-4');
  });

  it('returns the base classes when the part has no override', () => {
    const classes: Partial<Record<'container' | 'label', string>> = { label: 'font-heading' };
    expect(partClass('rounded-md px-4', classes, 'container')).toBe('rounded-md px-4');
  });

  it('merges the part override over the base classes', () => {
    expect(partClass('rounded-md px-4', { container: 'px-6' }, 'container')).toBe(
      'rounded-md px-6'
    );
  });

  it('appends a non-conflicting override', () => {
    expect(partClass('rounded-md', { container: 'shadow-md' }, 'container')).toBe(
      'rounded-md shadow-md'
    );
  });
});

/**
 * An array `classes` value (bug, fixed 2026-09-27 — see `flattenClassValue`'s and
 * `warnArrayClassesValue`'s own comments in `cx.ts`). `classes: { root: ['flex', 'gap-4'] }` used
 * to reach `Object.entries` on an array, which reads its **indices** as class names: the element
 * got `class="0 1"` — two classes that style nothing — in place of the two the consumer wrote, with
 * nothing said about it. TypeScript rejects the shape at the call, but a JavaScript consumer, a
 * `v-bind` of an untyped object and a value out of JSON all reach it anyway.
 *
 * Each test below uses a part name of its own: the warning is deduped per component+part for the
 * process's lifetime (that is the point of it — `partClass` runs on every render), so a shared
 * name would make the second test's assertion depend on the first test's order.
 */
describe('partClass — array classes value (dev warning)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  /** A component, because the warning names the component whose render is running — which is how a
   *  developer finds the `classes` prop to fix. `defineComponent({ name })` rather than an SFC, so
   *  the name under test is explicit rather than derived from this file's own name. */
  function mountWithArrayPart(name: string, part: string): { class: string | undefined } {
    const captured: { class: string | undefined } = { class: undefined };
    const component = defineComponent({
      name,
      setup() {
        return () => {
          captured.class = partClass(
            'rounded-md px-4',
            { [part]: ['px-6', 'shadow-md'] } as never,
            part
          );
          return h('div', { class: captured.class });
        };
      },
    });
    mount(component).unmount();
    return captured;
  }

  it('flattens the array into real class names instead of its indices', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const captured = mountWithArrayPart('ProductCard', 'flattenPart');
    // `px-6` replaces the base `px-4` through the ordinary merge, and `shadow-md` lands beside it —
    // exactly what a single `'px-6 shadow-md'` string would have done.
    expect(captured.class).toBe('rounded-md px-6 shadow-md');
    expect(captured.class).not.toMatch(/\b[01]\b/);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('names the component and the part, once per pair however many renders happen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountWithArrayPart('Carousel', 'namedPart');
    mountWithArrayPart('Carousel', 'namedPart');
    mountWithArrayPart('Carousel', 'namedPart');

    expect(warn).toHaveBeenCalledOnce();
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('[@eldrajs/ui]');
    expect(message).toContain('Carousel');
    expect(message).toContain('classes.namedPart');
  });

  it('warns again for a different component or a different part', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountWithArrayPart('Breadcrumb', 'pairPartA');
    mountWithArrayPart('Breadcrumb', 'pairPartB');
    mountWithArrayPart('Tabs', 'pairPartA');
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('falls back to a readable label outside a component render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(partClass('rounded-md', { loosePart: ['px-6'] } as never, 'loosePart')).toBe(
      'rounded-md px-6'
    );
    expect(String(warn.mock.calls[0]?.[0])).toContain('an @eldrajs/ui component');
  });

  it('stays silent in production, while still flattening the array', () => {
    vi.stubEnv('DEV', false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const captured = mountWithArrayPart('Chip', 'productionPart');
    expect(captured.class).toBe('rounded-md px-6 shadow-md');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('cx — array argument', () => {
  it('flattens a nested array the way Vue own :class array syntax does', () => {
    // Not a documented `ClassValue` (an array is deliberately outside that union — see its own
    // comment), but the runtime behaviour has to be "the classes in it", never their indices.
    expect(cx(['rounded-md', ['px-4', false], undefined] as never)).toBe('rounded-md px-4');
  });
});
