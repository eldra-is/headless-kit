import navigationMock from '../../blocks/navigation/mock.json';
import navigationPreview from '../../blocks/navigation/preview.json';
import footerMock from '../../blocks/footer/mock.json';
import type { PageFixture } from './pageBlocks';

/**
 * A page fixture with the header and footer filled in from their blocks' own demo data, for the
 * page **stories** only.
 *
 * The fixtures in `pages/*.page.json` are what a deploy seeds, so their header and footer carry no
 * destinations and nothing about a particular store (no menu, no footer link groups, no opening
 * hours or phone number): a fresh organisation would otherwise start with links to pages it does
 * not have and promises it never made (`test/starter.spec.ts`, "seeds a header and footer with no
 * destinations at all"). A page story is a picture of the theme, not of a fresh organisation, so it
 * shows the menu, info strip and store details an author fills in Studio — taken from each block's
 * `mock.json` and `preview.json`, the same data its own block story shows. The page specs mount the
 * fixture as it is.
 */
const DEMO_CHROME: Record<string, Record<string, unknown>> = {
  navigation: { ...navigationMock, ...navigationPreview },
  footer: { ...footerMock },
};

export function withDemoChrome(fixture: PageFixture): PageFixture {
  return {
    ...fixture,
    blocks: fixture.blocks.map((block) => {
      const demo = DEMO_CHROME[block.apiId];
      return demo === undefined ? block : { ...block, data: { ...block.data, ...demo } };
    }),
  };
}
