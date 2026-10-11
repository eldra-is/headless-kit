// @vitest-environment jsdom
//
// `mountPage` is exercised for real by `test/pages/*.spec.ts`, but it is a
// foundation contract other tests depend on verbatim — this proves the
// harness itself splits a fixture into the same three landmark regions
// `app/pages/[...slug].vue` renders (`app/utils/pageStructure.ts`) and fails
// loudly on an unknown apiId, using three of the starter's existing blocks as
// a stand-in fixture (this file does not assert anything about
// `navigation`/`hero`/`footer` beyond "they rendered where expected").
import { describe, expect, it } from 'vitest';
import heroMock from '../../blocks/hero/mock.json';
import footerMock from '../../blocks/footer/mock.json';
import navigationMock from '../../blocks/navigation/mock.json';
import { mountPage } from './mountPage';

describe('mountPage', () => {
  it('renders the fixture in the route\u2019s three landmark regions, in order', async () => {
    const wrapper = await mountPage({
      blocks: [
        { apiId: 'navigation', id: 'nav-1', data: navigationMock },
        { apiId: 'hero', id: 'hero-1', data: heroMock },
        { apiId: 'footer', id: 'footer-1', data: footerMock },
      ],
    });

    const main = wrapper.get('main#main');
    // The header leads the list, so it renders *before* `<main>`; the footer trails it, so it
    // renders after — see `app/utils/pageStructure.ts`. Only the hero is inside.
    const banner = wrapper.element.querySelector('header')!;
    const contentinfo = wrapper.element.querySelector('footer')!;
    expect(banner).not.toBeNull();
    expect(contentinfo).not.toBeNull();
    expect(main.element.contains(banner)).toBe(false);
    expect(main.element.contains(contentinfo)).toBe(false);

    const heading = main.find('h1');
    expect(heading.exists()).toBe(true);
    expect(heading.text()).toBe(heroMock.heading);

    // Order, not just presence: banner → main → contentinfo in the rendered document.
    expect(
      banner.compareDocumentPosition(main.element) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      main.element.compareDocumentPosition(contentinfo) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('keeps a block that is not leading structure inside <main>', async () => {
    // The partition is positional: only a *leading* run of announcement-bar/navigation is the
    // banner, and only a *trailing* `footer` is the contentinfo.
    const wrapper = await mountPage({
      blocks: [
        { apiId: 'hero', id: 'hero-1', data: heroMock },
        { apiId: 'footer', id: 'footer-1', data: footerMock },
        { apiId: 'navigation', id: 'nav-1', data: navigationMock },
      ],
    });

    const main = wrapper.get('main#main');
    // The `footer` is not last, and the `navigation` does not lead — both stay inside `<main>`.
    expect(main.element.querySelector('footer')).not.toBeNull();
    expect(main.element.querySelector('header')).not.toBeNull();
    expect(wrapper.element.children).toHaveLength(1);
  });

  it('throws a clear error for an apiId with no registered Block.vue', async () => {
    await expect(
      mountPage({ blocks: [{ apiId: 'does-not-exist', id: 'x', data: {} }] })
    ).rejects.toThrow(/no Block\.vue registered for apiId "does-not-exist"/);
  });
});
