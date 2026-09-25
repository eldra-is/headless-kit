import { describe, expect, it } from 'vitest';
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
