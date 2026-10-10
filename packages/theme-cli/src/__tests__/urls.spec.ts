import { describe, expect, it } from 'vitest';
import { stripTrailingSlashes } from '../urls';

describe('stripTrailingSlashes', () => {
  it('strips a long run of trailing slashes in one pass — the regex equivalent (/\\/+$/) backtracks polynomially on input like this', () => {
    const longRun = 'https://gateway.example.test' + '/'.repeat(50_000);
    expect(stripTrailingSlashes(longRun)).toBe('https://gateway.example.test');
  });

  it('leaves the normal cases unchanged', () => {
    expect(stripTrailingSlashes('https://gateway.example.test')).toBe(
      'https://gateway.example.test'
    );
    expect(stripTrailingSlashes('https://gateway.example.test/')).toBe(
      'https://gateway.example.test'
    );
    expect(stripTrailingSlashes('https://gateway.example.test///')).toBe(
      'https://gateway.example.test'
    );
    expect(stripTrailingSlashes('')).toBe('');
    expect(stripTrailingSlashes('/')).toBe('');
    // A slash in the middle of the path is not trailing and stays.
    expect(stripTrailingSlashes('https://gateway.example.test/cms/v1/')).toBe(
      'https://gateway.example.test/cms/v1'
    );
  });
});
