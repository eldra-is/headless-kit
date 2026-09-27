import type { Component } from 'vue';

// The static apiId → Block.vue map a sample-page fixture (`pages/<name>.page.json`) renders
// through: every listed block has to be available synchronously (no `await` between resolving an
// apiId and rendering it), so this stays a plain object rather than `import.meta.glob`/dynamic
// `import()` (`test/mocks/blocks.ts`, the `virtual:eldra/blocks` mock `EldraBlockZone` consumes,
// globs lazily on purpose — a different job, code-split loading for a real site).
//
// Shared by `test/support/mountPage.ts` (the page-level specs) and
// `stories/pages/*.stories.ts` (the same fixtures rendered as Storybook stories).
//
// Lives under `stories/support/` rather than `test/support/` (keeps `test/**` out of the shipped
// Storybook build) and rather than `app/utils/`: `nuxt.config.ts`'s `typescript.tsConfig.exclude`
// already drops `../stories/**` from `nuxi typecheck`'s program, while `../app/**/*` is a root of
// that program — an `app/**` file importing every block here would pull each `Block.vue`'s
// internals into `nuxi typecheck` (blocks are otherwise reached only through the code-split
// `virtual:eldra/blocks` glob, never a static import from `app/**`), surfacing template type
// errors that belong to those blocks' own tasks. `stories/**` is separately type-checked by plain
// `tsc` (`pnpm typecheck:storybook`), which resolves `*.vue` imports through `.storybook/
// shims-vue.d.ts`'s opaque shim rather than parsing template internals, so it never hits this.
//
// Extend it by adding one import + one entry per block a new page fixture introduces.
import Announcement from '../../blocks/announcement-bar/Block.vue';
import Article from '../../blocks/article/Block.vue';
import ArticleList from '../../blocks/article-list/Block.vue';
import Breadcrumbs from '../../blocks/breadcrumbs/Block.vue';
import Cta from '../../blocks/cta/Block.vue';
import Faq from '../../blocks/faq/Block.vue';
import FeatureGrid from '../../blocks/feature-grid/Block.vue';
import Footer from '../../blocks/footer/Block.vue';
import Gallery from '../../blocks/gallery/Block.vue';
import Hero from '../../blocks/hero/Block.vue';
import ImageBlock from '../../blocks/image/Block.vue';
import Navigation from '../../blocks/navigation/Block.vue';
import Newsletter from '../../blocks/newsletter/Block.vue';
import ProductCarousel from '../../blocks/product-carousel/Block.vue';
import ProductDetail from '../../blocks/product-detail/Block.vue';
import SplitContent from '../../blocks/split-content/Block.vue';
import Testimonials from '../../blocks/testimonials/Block.vue';
import TrustStrip from '../../blocks/trust-strip/Block.vue';

export const pageBlockComponents: Record<string, Component> = {
  'announcement-bar': Announcement,
  article: Article,
  'article-list': ArticleList,
  breadcrumbs: Breadcrumbs,
  cta: Cta,
  faq: Faq,
  'feature-grid': FeatureGrid,
  footer: Footer,
  gallery: Gallery,
  hero: Hero,
  image: ImageBlock,
  navigation: Navigation,
  newsletter: Newsletter,
  'product-carousel': ProductCarousel,
  'product-detail': ProductDetail,
  'split-content': SplitContent,
  testimonials: Testimonials,
  'trust-strip': TrustStrip,
};

export interface PageFixtureBlock {
  apiId: string;
  id: string;
  data: Record<string, unknown>;
}

export interface PageFixture {
  template: string;
  title: string;
  blocks: PageFixtureBlock[];
}
