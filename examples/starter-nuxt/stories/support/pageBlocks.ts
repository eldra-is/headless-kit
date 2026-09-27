import type { Component } from 'vue';

// A static map, not `import.meta.glob`/dynamic `import()` — mirrors
// `test/support/mountPage.ts`'s own reasoning: a sample-page story renders a
// fixed, known set of blocks synchronously, so this stays a plain object a
// later page story extends by adding one import + one entry per block it
// introduces. Kept separate from `test/support/mountPage.ts` (rather than
// importing it) because that file pulls in `@vue/test-utils` and Vitest's
// `mountOptions`, neither of which belong in a Storybook bundle; Storybook's
// own context (client, locale, messages, currency, icon fetcher) already
// comes from `.storybook/preview.ts`'s global `withEldraContext` decorator.
import Article from '../../blocks/article/Block.vue';
import ArticleList from '../../blocks/article-list/Block.vue';
import Breadcrumbs from '../../blocks/breadcrumbs/Block.vue';
import Footer from '../../blocks/footer/Block.vue';
import Navigation from '../../blocks/navigation/Block.vue';
import Newsletter from '../../blocks/newsletter/Block.vue';

export const pageBlockComponents: Record<string, Component> = {
  article: Article,
  'article-list': ArticleList,
  breadcrumbs: Breadcrumbs,
  footer: Footer,
  navigation: Navigation,
  newsletter: Newsletter,
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
