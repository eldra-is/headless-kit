import { describe, expect, it } from 'vitest';
import { seoInput, type SeoInputParts } from '../app/utils/seoInput';

const base: SeoInputParts = {
  isNotFound: false,
  notFoundTitle: 'Page not found',
  catalog: null,
  entry: null,
  page: null,
  template: null,
  path: '/',
  locales: [],
  formatPrice: (amount) => `${amount} kr.`,
};

describe('seoInput', () => {
  it('builds the product variables, the lowest price and the first image', () => {
    const input = seoInput({
      ...base,
      path: '/products/mug',
      catalog: { kind: 'product', slug: 'mug' },
      template: { data: { title: 'Product' } },
      entry: {
        data: {
          title: 'Mug',
          description: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hand thrown.' }] }],
          },
          variants: [
            { sku: 'M-1', price: 3000 },
            { sku: 'M-2', price: 2800 },
          ],
          images: [
            {
              url: 'https://media.example/public/11111111-1111-1111-1111-111111111111/assets/22222222-2222-2222-2222-222222222222/sm',
            },
          ],
        },
      },
    });
    expect(input.context).toBe('catalog:product');
    expect(input.data).toMatchObject({
      'page.title': 'Mug',
      'product.name': 'Mug',
      'product.sku': 'M-1',
      'product.price': '2800 kr.',
      'product.shortDescription': 'Hand thrown.',
    });
    expect(input.options.contentImage).toMatch(/\/lg$/);
  });

  it('leaves a missing price empty instead of inventing one', () => {
    const input = seoInput({
      ...base,
      catalog: { kind: 'product', slug: 'x' },
      entry: { data: { title: 'X', variants: [{ sku: 'a', price: null }] } },
    });
    expect(input.data['product.price']).toBe('');
  });

  it('builds collection and category variables', () => {
    const collection = seoInput({
      ...base,
      catalog: { kind: 'collection', slug: 'mugs' },
      entry: { data: { title: 'Mugs', description: 'All mugs', productCount: 12 } },
    });
    expect(collection.context).toBe('catalog:collection');
    expect(collection.data).toMatchObject({
      'collection.name': 'Mugs',
      'collection.description': 'All mugs',
      'collection.productCount': 12,
    });
    const category = seoInput({
      ...base,
      catalog: { kind: 'category', slug: 'chairs' },
      entry: { data: { title: 'Chairs' } },
    });
    expect(category.data['category.name']).toBe('Chairs');
  });

  it('knows the home page under a locale prefix', () => {
    expect(seoInput({ ...base, path: '/is-IS/', locales: ['en-US', 'is-IS'] }).context).toBe(
      'home'
    );
    expect(seoInput({ ...base, path: '/is-IS/about', locales: ['en-US', 'is-IS'] }).context).toBe(
      'page'
    );
  });

  it('ignores a blank title and a non-object seo value', () => {
    const input = seoInput({
      ...base,
      path: '/about',
      page: { data: { title: '   ', seo: 'nope' } },
    });
    expect(input.data['page.title']).toBe('');
    expect(input.options.entry).toBeNull();
  });
});
