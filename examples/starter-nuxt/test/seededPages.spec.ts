import { describe, expect, it } from 'vitest';
import { SEEDED_PAGE_SLUGS } from '../app/seededPages';
import { starterPages } from '../app/templates';

describe('SEEDED_PAGE_SLUGS', () => {
  it('lists exactly the pages the theme seeds', () => {
    expect([...SEEDED_PAGE_SLUGS].sort()).toEqual(
      starterPages()
        .map((seed) => seed.page.slug)
        .sort()
    );
  });
});
