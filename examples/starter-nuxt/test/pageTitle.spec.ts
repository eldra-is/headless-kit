import { describe, expect, it } from 'vitest';
import { pageTitle } from '../app/utils/pageTitle';

const notFoundTitle = 'Page not found';

describe('pageTitle', () => {
  it('names a catalog route after the object it is showing, not its template', () => {
    // The defect this closes: every product page's tab read "Product" — the route template's own
    // title — because that is the document the page renders through.
    expect(
      pageTitle({
        isNotFound: false,
        notFoundTitle,
        catalogTitle: 'Ash glaze mug',
        documentTitle: 'Product',
      })
    ).toBe('Ash glaze mug');
  });

  it('names an ordinary page after its own document', () => {
    expect(
      pageTitle({ isNotFound: false, notFoundTitle, catalogTitle: null, documentTitle: 'About us' })
    ).toBe('About us');
  });

  it('falls back to the document when a catalog object has no usable title', () => {
    for (const catalogTitle of [null, undefined, '', '   ', 42]) {
      expect(
        pageTitle({ isNotFound: false, notFoundTitle, catalogTitle, documentTitle: 'Product' })
      ).toBe('Product');
    }
  });

  it('falls back to the site name when nothing names the page', () => {
    expect(pageTitle({ isNotFound: false, notFoundTitle })).toBe('Site');
    expect(pageTitle({ isNotFound: false, notFoundTitle, documentTitle: '  ' })).toBe('Site');
  });

  it('names the not-found shell itself, whatever else resolved', () => {
    expect(
      pageTitle({
        isNotFound: true,
        notFoundTitle,
        catalogTitle: 'Ash glaze mug',
        documentTitle: 'Product',
      })
    ).toBe(notFoundTitle);
  });
});
