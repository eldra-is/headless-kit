// This file deliberately carries no environment docblock: `vitest.config.ts` defaults to the node
// environment, so it is the one place in the suite where `window` and `document` do not exist —
// exactly the environment `nuxi generate` and every SSR request render a page in. Do not write the
// jsdom environment pragma anywhere in this file, not even inside a comment explaining its absence:
// Vitest scans the file's leading comments for that pragma and would switch the environment, which
// makes every assertion below vacuous (the first `it` guards against exactly that).
//
// Nothing else in the suite server-renders a block. `test/starter.spec.ts` does run `nuxi generate`,
// but without gateway credentials it only ever reaches the not-found shell, so no block is server
// rendered there either. That blind spot is how three `watchEffect`s in `blocks/navigation/Block.vue`
// could call `window.addEventListener` / `document.documentElement` unguarded with every gate green:
// a `flush: 'pre'` effect with no callback runs its body immediately, inside `setup()`, and `setup()`
// runs on the server too — so each server render raised `ReferenceError: window is not defined`,
// which `nitro.prerender.failOnError` turns into a failed build.
import { describe, expect, it } from 'vitest';
import Navigation from '../../blocks/navigation/Block.vue';
import navigationMock from '../../blocks/navigation/mock.json';
import navigationPreview from '../../blocks/navigation/preview.json';
import { renderBlockToString, renderPageToString } from '../support/renderSsr';
import type { PageFixture } from '../support/mountPage';
import homePage from '../../pages/home.page.json';
import productPage from '../../pages/product.page.json';
import collectionPage from '../../pages/collection.page.json';
import articlePage from '../../pages/article.page.json';

const FIXTURES: Array<[string, PageFixture]> = [
  ['home', homePage as unknown as PageFixture],
  ['product', productPage as unknown as PageFixture],
  ['collection', collectionPage as unknown as PageFixture],
  ['article', articlePage as unknown as PageFixture],
];

describe('server rendering', () => {
  it('runs in an environment with no window and no document', () => {
    // If this ever fails, every other assertion in this file is vacuous.
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('server-renders the header block without touching window or document', async () => {
    const html = await renderBlockToString(Navigation, {
      id: 'ssr-header',
      data: { ...navigationMock, ...navigationPreview },
    });

    expect(html).toContain('<header');
    expect(html).toContain('Primary navigation');
  });

  it.each(FIXTURES)(
    'server-renders the %s sample page with its banner, main and contentinfo in order',
    async (_name, fixture) => {
      const html = await renderPageToString(fixture);

      const header = html.indexOf('<header');
      const main = html.indexOf('<main id="main"');
      const mainEnd = html.indexOf('</main>');
      const footer = html.lastIndexOf('<footer');

      expect(header).toBeGreaterThanOrEqual(0);
      expect(main).toBeGreaterThan(header);
      expect(footer).toBeGreaterThan(mainEnd);
    }
  );
});
