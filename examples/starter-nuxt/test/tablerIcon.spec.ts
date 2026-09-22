import { describe, expect, it } from 'vitest';
import { encodeStega } from '@eldrajs/theme-core';
import { tablerIconSvg } from '../server/utils/tablerIcon';

describe('tablerIconSvg', () => {
  it('inlines a known outline icon with currentColor and no fixed size', () => {
    const svg = tablerIconSvg('bolt');
    expect(svg).toContain('<svg');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toMatch(/ width="24"| height="24"/);
  });
  it('refuses unknown or unsafe names', () => {
    expect(tablerIconSvg('does-not-exist-xyz')).toBeNull();
    expect(tablerIconSvg('../../etc/passwd')).toBeNull();
    expect(tablerIconSvg('')).toBeNull();
  });
  it('resolves a stega-encoded name, as an entry field carries inside Studio', () => {
    // `feature.icon` is a CMS field, so in preview it arrives with the
    // invisible click-tracking payload appended. Without stripping, the name
    // fails the safe-name test and every icon vanishes in edit mode.
    const encoded = encodeStega('lock', {
      entryId: 'entry-1',
      fieldPath: 'features.0.icon',
      locale: 'en-US',
    });
    expect(encoded).not.toBe('lock');
    expect(tablerIconSvg(encoded)).toBe(tablerIconSvg('lock'));
  });
  it('still refuses an unsafe name that was stega-encoded', () => {
    expect(
      tablerIconSvg(
        encodeStega('../../etc/passwd', {
          entryId: 'entry-1',
          fieldPath: 'features.0.icon',
          locale: null,
        })
      )
    ).toBeNull();
  });
});
