// @vitest-environment jsdom
//
// `mountPage` is exercised for real by `test/pages/*.spec.ts`, but it is a
// foundation contract other tests depend on verbatim — this proves the
// harness itself renders a fixture correctly and fails loudly on an unknown
// apiId, using two of the starter's existing blocks as a stand-in fixture
// (this file does not assert anything about `hero`/`footer` beyond "they
// rendered where expected").
import { describe, expect, it } from 'vitest';
import heroMock from '../../blocks/hero/mock.json';
import footerMock from '../../blocks/footer/mock.json';
import { mountPage } from './mountPage';

describe('mountPage', () => {
  it('renders each fixture block as a sibling inside <main id="main">, in order', async () => {
    const wrapper = await mountPage({
      blocks: [
        { apiId: 'hero', id: 'hero-1', data: heroMock },
        { apiId: 'footer', id: 'footer-1', data: footerMock },
      ],
    });

    const main = wrapper.find('main#main');
    expect(main.exists()).toBe(true);

    // Order: hero's h1 (the page's only heading landmark text here) comes
    // before the footer landmark in the rendered DOM.
    const heading = main.find('h1');
    expect(heading.exists()).toBe(true);
    expect(heading.text()).toBe(heroMock.heading);

    const footerLandmark = main.find('footer');
    expect(footerLandmark.exists()).toBe(true);
    // Order, not just presence: the hero block's markup appears before the
    // footer block's in `<main>`'s own rendered output.
    const html = main.html();
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<footer'));
  });

  it('throws a clear error for an apiId with no registered Block.vue', async () => {
    await expect(
      mountPage({ blocks: [{ apiId: 'does-not-exist', id: 'x', data: {} }] })
    ).rejects.toThrow(/no Block\.vue registered for apiId "does-not-exist"/);
  });
});
