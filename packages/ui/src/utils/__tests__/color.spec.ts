import { describe, expect, it } from 'vitest';
import { mixToward } from '../color';

describe('mixToward', () => {
  it('returns a color-mix() in the oklab space', () => {
    expect(mixToward('var(--eldra-color-primary)', 'var(--eldra-color-text)', 12)).toBe(
      'color-mix(in oklab, var(--eldra-color-primary), var(--eldra-color-text) 12%)'
    );
  });

  it('accepts plain colour keywords as well as variables', () => {
    expect(mixToward('currentColor', 'transparent', 50)).toBe(
      'color-mix(in oklab, currentColor, transparent 50%)'
    );
  });

  it('renders fractional percentages verbatim', () => {
    expect(mixToward('var(--a)', 'var(--b)', 7.5)).toBe(
      'color-mix(in oklab, var(--a), var(--b) 7.5%)'
    );
  });
});
