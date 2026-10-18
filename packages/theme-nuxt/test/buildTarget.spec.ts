import { describe, expect, it, vi } from 'vitest';
import { resolveBuildTarget } from '../src/buildTarget';

describe('resolveBuildTarget', () => {
  it('is production unless the variable says preview', () => {
    const warn = vi.fn();
    expect(resolveBuildTarget(undefined, warn)).toBe('production');
    expect(resolveBuildTarget('', warn)).toBe('production');
    expect(resolveBuildTarget('production', warn)).toBe('production');
    expect(resolveBuildTarget('preview', warn)).toBe('preview');
    expect(resolveBuildTarget(' Preview ', warn)).toBe('preview');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns about any other value and counts it as production', () => {
    const warn = vi.fn();
    expect(resolveBuildTarget('staging', warn)).toBe('production');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('staging');
  });
});
