import { describe, expect, it } from 'vitest';
import { RICH_TEXT_TOOLBAR_CONTROLS, safeHref } from '../richText';
import { encodeStega, type StegaMeta } from '../stega';

const META: StegaMeta = { entryId: 'e1', fieldPath: 'title', locale: 'en-US' };

describe('safeHref', () => {
  it('allows site-relative, https/http, mailto, and tel links', () => {
    expect(safeHref('/contact')).toBe('/contact');
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:hello@example.com')).toBe('mailto:hello@example.com');
    expect(safeHref('tel:+15551234567')).toBe('tel:+15551234567');
    expect(safeHref('  #details  ')).toBe('#details');
  });

  it('rejects executable and opaque schemes, protocol-relative and malformed values', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref('//evil.example/path')).toBeNull();
    expect(safeHref('/\\evil.example/path')).toBeNull();
    expect(safeHref('/safe\npath')).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(42)).toBeNull();
    expect(safeHref('')).toBeNull();
  });

  it('strips a stega payload before validating', () => {
    expect(safeHref('/guides/' + encodeStega('volcanic-coast', META))).toBe(
      '/guides/volcanic-coast'
    );
    expect(safeHref(encodeStega('/about', META))).toBe('/about');
    expect(safeHref(encodeStega('javascript:alert(1)', META))).toBeNull();
    expect(safeHref(encodeStega('//evil.example/path', META))).toBeNull();
  });
});

describe('RICH_TEXT_TOOLBAR_CONTROLS', () => {
  it('is a fixed, deduplicated list shared by the scanner and theme-vue', () => {
    expect(new Set(RICH_TEXT_TOOLBAR_CONTROLS).size).toBe(RICH_TEXT_TOOLBAR_CONTROLS.length);
    expect(RICH_TEXT_TOOLBAR_CONTROLS).toContain('bold');
    expect(RICH_TEXT_TOOLBAR_CONTROLS).toContain('table');
  });
});
