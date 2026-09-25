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
