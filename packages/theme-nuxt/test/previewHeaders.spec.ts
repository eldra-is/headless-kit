import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREVIEW_HOST_PATTERNS,
  PREVIEW_HEADERS_BEGIN,
  previewHostHeadersBlock,
  stripPreviewHostHeaders,
} from '../src/runtime/previewHeaders';

describe('preview host headers', () => {
  it('sends noindex on every default preview host and nowhere else', () => {
    const block = previewHostHeadersBlock(DEFAULT_PREVIEW_HOST_PATTERNS);
    for (const suffix of ['previews', 'previews-staging', 'previews-dev']) {
      expect(block).toContain(
        `https://:org.${suffix}.eldra.dev/*\n  X-Robots-Tag: noindex, nofollow`
      );
    }
    expect(block).not.toMatch(/^\/\*/m);
  });

  it('writes nothing for no hosts', () => {
    expect(previewHostHeadersBlock([])).toBe('');
    expect(previewHostHeadersBlock(['  '])).toBe('');
  });

  it('strips a block written earlier, leaving the rest', () => {
    const block = previewHostHeadersBlock(['https://:org.previews.eldra.dev/*']);
    const file = `/*\n  X-Frame: a\n\n${block}\n/more\n  X-B: b\n`;
    const stripped = stripPreviewHostHeaders(file);
    expect(stripped).not.toContain(PREVIEW_HEADERS_BEGIN);
    expect(stripped).toContain('/*\n  X-Frame: a');
    expect(stripped).toContain('/more\n  X-B: b');
  });
});
