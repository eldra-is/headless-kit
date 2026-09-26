import { fileURLToPath, URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { axe } from '../../../test/axe';
import { isBuilt, itFailsWithoutDist } from '../../../test/built';
import { mountNarrow, mountWith } from '../../../test/mount';
import Pagination from '../Pagination.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

/** The numbered form's own list — a real `<ul>`, unlike the compact form's `<div>` — so a test can
 *  disambiguate the two `data-part="list"` elements the responsive default renders side by side. */
function numberedList(wrapper: { get: (s: string) => { element: Element } }) {
  return wrapper.get('ul[data-part="list"]').element;
}

function compactRow(wrapper: { get: (s: string) => { element: Element } }) {
  return wrapper.get('div[data-part="list"]').element;
}

function pageNumbers(root: Element): string[] {
  return [...root.querySelectorAll('[data-part="page"], [data-part="current"]')].map(
    (el) => el.textContent?.trim() ?? ''
  );
}

function hasEllipsis(root: Element): boolean {
  return root.querySelector('[data-part="ellipsis"]') !== null;
}

describe('Pagination — nothing at one page', () => {
  it('renders nothing at all with totalPages: 1', () => {
    const wrapper = mountWith(Pagination, { props: { page: 1, totalPages: 1 } });
    expect(wrapper.find('nav').exists()).toBe(false);
    expect(wrapper.html()).toBe('<!--v-if-->');
    wrapper.unmount();
  });

  it('also renders nothing with totalPages: 0 (defensive)', () => {
    const wrapper = mountWith(Pagination, { props: { page: 1, totalPages: 0 } });
    expect(wrapper.find('nav').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders from totalPages: 2', () => {
    const wrapper = mountWith(Pagination, { props: { page: 1, totalPages: 2 } });
    expect(wrapper.find('nav').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Pagination — page window and ellipses', () => {
  it("matches the spec's own example: 1 … 5 [6] 7 … 12 at siblings=1 (default)", () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    const list = numberedList(wrapper);
    expect(pageNumbers(list)).toEqual(['1', '5', '6', '7', '12']);
    const ellipses = list.querySelectorAll('[data-part="ellipsis"]');
    expect(ellipses).toHaveLength(2);
    wrapper.unmount();
  });

  it('widens the window with siblings=2: 1 … 4 5 [6] 7 8 … 12', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12, siblings: 2 } });
    expect(pageNumbers(numberedList(wrapper))).toEqual(['1', '4', '5', '6', '7', '8', '12']);
    wrapper.unmount();
  });

  it('shows every page with no ellipsis when the whole range already fits', () => {
    const wrapper = mountWith(Pagination, { props: { page: 3, totalPages: 5 } });
    const list = numberedList(wrapper);
    expect(pageNumbers(list)).toEqual(['1', '2', '3', '4', '5']);
    expect(hasEllipsis(list)).toBe(false);
    wrapper.unmount();
  });

  it('collapses siblings=0 to just the current page plus first/last', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12, siblings: 0 } });
    expect(pageNumbers(numberedList(wrapper))).toEqual(['1', '6', '12']);
    wrapper.unmount();
  });

  it('at the first page: 1 2 … 12, only one ellipsis', () => {
    const wrapper = mountWith(Pagination, { props: { page: 1, totalPages: 12 } });
    const list = numberedList(wrapper);
    expect(pageNumbers(list)).toEqual(['1', '2', '12']);
    expect(list.querySelectorAll('[data-part="ellipsis"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('at the last page: 1 … 11 12, only one ellipsis', () => {
    const wrapper = mountWith(Pagination, { props: { page: 12, totalPages: 12 } });
    const list = numberedList(wrapper);
    expect(pageNumbers(list)).toEqual(['1', '11', '12']);
    expect(list.querySelectorAll('[data-part="ellipsis"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('gaps are aria-hidden, decorative, and not focusable', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    const ellipsis = numberedList(wrapper).querySelector('[data-part="ellipsis"]') as HTMLElement;
    expect(ellipsis.getAttribute('aria-hidden')).toBe('true');
    expect(ellipsis.tagName).toBe('SPAN');
    expect(ellipsis.hasAttribute('href')).toBe(false);
    expect(ellipsis.tabIndex).toBe(-1);
    wrapper.unmount();
  });
});

describe('Pagination — current page', () => {
  it('marks the current page with aria-current, fill classes and a full sentence label', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    const current = numberedList(wrapper).querySelector('[data-part="current"]') as HTMLElement;
    expect(current.textContent?.trim()).toBe('6');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.getAttribute('aria-label')).toBe('Page 6, current page');
    expect(current.className).toContain('bg-primary');
    expect(current.className).toContain('text-primary-contrast');
    expect(current.className).toContain('font-semibold');
    wrapper.unmount();
  });

  it('names an ordinary page link with just "Page n"', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    const page = numberedList(wrapper).querySelector('[data-part="page"]') as HTMLElement;
    expect(page.getAttribute('aria-label')).toBe('Page 1');
    wrapper.unmount();
  });

  it('still shows the standard focus ring on the current (primary-filled) page', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    const current = numberedList(wrapper).querySelector('[data-part="current"]') as HTMLElement;
    expect(current.className).toContain('eldra-focus');
    wrapper.unmount();
  });
});

describe('Pagination — real links via hrefForPage', () => {
  it('renders every page, prev and next as a real <a href>, with rel prev/next', () => {
    const wrapper = mountWith(Pagination, {
      props: { page: 6, totalPages: 12, hrefForPage: (n: number) => `/products?page=${n}` },
    });
    const list = numberedList(wrapper);
    const first = list.querySelector('[data-part="page"]') as HTMLAnchorElement;
    expect(first.tagName).toBe('A');
    expect(first.getAttribute('href')).toBe('/products?page=1');

    const prev = list.querySelector('[data-part="prev"]') as HTMLAnchorElement;
    expect(prev.tagName).toBe('A');
    expect(prev.getAttribute('href')).toBe('/products?page=5');
    expect(prev.getAttribute('rel')).toBe('prev');

    const next = list.querySelector('[data-part="next"]') as HTMLAnchorElement;
    expect(next.getAttribute('href')).toBe('/products?page=7');
    expect(next.getAttribute('rel')).toBe('next');

    const current = list.querySelector('[data-part="current"]') as HTMLAnchorElement;
    expect(current.tagName).toBe('A');
    expect(current.getAttribute('href')).toBe('/products?page=6');
    wrapper.unmount();
  });

  it('does not emit update:page when a real link is clicked', async () => {
    const wrapper = mountWith(Pagination, {
      props: { page: 6, totalPages: 12, hrefForPage: (n: number) => `/products?page=${n}` },
    });
    const first = numberedList(wrapper).querySelector('[data-part="page"]') as HTMLAnchorElement;
    await first.click();
    expect(wrapper.emitted('update:page')).toBeUndefined();
    wrapper.unmount();
  });

  it('passes href as `to` when linkAs is a router component', () => {
    const FakeRouterLink = defineComponent({
      props: { to: { type: String, required: true } },
      setup:
        (props, { slots }) =>
        () =>
          h('a', { 'data-fake-router-link': props.to }, slots.default?.()),
    });
    const wrapper = mountWith(Pagination, {
      props: {
        page: 1,
        totalPages: 3,
        hrefForPage: (n: number) => `/products?page=${n}`,
        linkAs: FakeRouterLink,
      },
    });
    const first = numberedList(wrapper).querySelector('[data-fake-router-link]');
    expect(first).not.toBeNull();
    expect(first?.getAttribute('href')).toBeNull();
    wrapper.unmount();
  });
});

describe('Pagination — buttons when hrefForPage is absent', () => {
  it('renders pages and prev/next as native buttons', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    const list = numberedList(wrapper);
    expect((list.querySelector('[data-part="page"]') as HTMLButtonElement).tagName).toBe('BUTTON');
    expect((list.querySelector('[data-part="page"]') as HTMLButtonElement).type).toBe('button');
    wrapper.unmount();
  });

  it('emits update:page with the target page when a page button is clicked', async () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    const target = [...numberedList(wrapper).querySelectorAll('[data-part="page"]')].find(
      (el) => el.textContent?.trim() === '7'
    ) as HTMLButtonElement;
    await target.click();
    expect(wrapper.emitted('update:page')?.[0]).toEqual([7]);
    wrapper.unmount();
  });

  it('emits update:page(page - 1) / (page + 1) from prev/next', async () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    const list = numberedList(wrapper);
    await (list.querySelector('[data-part="prev"]') as HTMLButtonElement).click();
    await (list.querySelector('[data-part="next"]') as HTMLButtonElement).click();
    expect(wrapper.emitted('update:page')?.[0]).toEqual([5]);
    expect(wrapper.emitted('update:page')?.[1]).toEqual([7]);
    wrapper.unmount();
  });
});

describe('Pagination — prev/next disabled at the ends', () => {
  it('previous is a non-focusable, non-link span at the first page', () => {
    const wrapper = mountWith(Pagination, { props: { page: 1, totalPages: 12 } });
    const list = numberedList(wrapper);
    const prev = list.querySelector('[data-part="prev"]') as HTMLElement;
    expect(prev.tagName).toBe('SPAN');
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    expect(prev.hasAttribute('href')).toBe(false);
    expect(prev.tabIndex).toBe(-1);
    expect(list.querySelector('[data-part="next"]')?.tagName).not.toBe('SPAN');
    wrapper.unmount();
  });

  it('next is disabled at the last page, previous is not', () => {
    const wrapper = mountWith(Pagination, { props: { page: 12, totalPages: 12 } });
    const list = numberedList(wrapper);
    const next = list.querySelector('[data-part="next"]') as HTMLElement;
    expect(next.tagName).toBe('SPAN');
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(list.querySelector('[data-part="prev"]')?.tagName).not.toBe('SPAN');
    wrapper.unmount();
  });

  it("the same disabled rule applies to the compact form's arrows", () => {
    const wrapper = mountWith(Pagination, { props: { page: 1, totalPages: 12, compact: true } });
    const row = compactRow(wrapper);
    const prev = row.querySelector('[data-part="prev"]') as HTMLElement;
    expect(prev.tagName).toBe('SPAN');
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    wrapper.unmount();
  });
});

describe('Pagination — compact mode (forced)', () => {
  it('renders only the compact row: no numbered list, no page/current/ellipsis parts', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12, compact: true } });
    expect(wrapper.find('ul[data-part="list"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="page"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="current"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="ellipsis"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows "Page 6 of 12" and names the arrows "Previous page"/"Next page"', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12, compact: true } });
    const row = compactRow(wrapper);
    expect(row.textContent).toContain('Page 6 of 12');
    expect(row.querySelector('[data-part="prev"]')?.getAttribute('aria-label')).toBe(
      'Previous page'
    );
    expect(row.querySelector('[data-part="next"]')?.getAttribute('aria-label')).toBe('Next page');
    wrapper.unmount();
  });

  it('the compact row always renders on one line: no wrap, unlike the numbered form', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12, compact: true } });
    expect(compactRow(wrapper).className).not.toContain('flex-wrap');
    wrapper.unmount();
  });

  it('emits update:page from the compact arrows without hrefForPage', async () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12, compact: true } });
    const row = compactRow(wrapper);
    await (row.querySelector('[data-part="next"]') as HTMLButtonElement).click();
    expect(wrapper.emitted('update:page')?.[0]).toEqual([7]);
    wrapper.unmount();
  });
});

describe('Pagination — the default (non-forced) responsive markup', () => {
  it('renders both the numbered list and the compact row, one a <ul> the other a <div>', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    expect(wrapper.find('ul[data-part="list"]').exists()).toBe(true);
    expect(wrapper.find('div[data-part="list"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('the numbered list is hidden below 48rem and flex from it; the compact row the reverse', () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    expect(wrapper.find('ul[data-part="list"]').classes()).toEqual(
      expect.arrayContaining(['hidden', '@tablet:flex'])
    );
    expect(wrapper.find('div[data-part="list"]').classes()).toEqual(
      expect.arrayContaining(['flex', '@tablet:hidden'])
    );
    wrapper.unmount();
  });
});

describe('Pagination — the container query (built CSS)', () => {
  const distDir = fileURLToPath(new NodeURL('../../../../dist/', import.meta.url));
  const built = isBuilt(`${distDir}tailwind.css`, `${distDir}index.js`);

  describe('built CSS', () => {
    it.runIf(built)(
      'compiles the responsive numbered/compact swap to a real @container rule, not a viewport @media',
      async () => {
        const { compile } = await import('@tailwindcss/node');
        const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
          base: distDir,
          onDependency() {},
        });
        // The exact two variant classes the component emits on its two `data-part="list"`
        // elements: the numbered list is `hidden @tablet:flex` (hidden below the pagination's own
        // 48rem, flex from it) and the compact row is `flex @tablet:hidden` (the mirror). Both
        // share the one `--container-tablet: 48rem` breakpoint declared in `tailwind.css`'s
        // `@theme` block for exactly this edge — there is no separate "narrower than 48rem"
        // variant token to compile, so a single `@container (width >= 48rem)` condition is the
        // whole guard, not a pair of opposite conditions.
        const css = compiler.build(['hidden', '@tablet:flex', 'flex', '@tablet:hidden']);

        expect(css).toContain('@container (width >= 48rem)');
        expect(css).toContain('.\\@tablet\\:flex');
        expect(css).toContain('.\\@tablet\\:hidden');
        // Never a plain viewport media query — the design spec's own rule that this edge is
        // measured on the pagination's own width, not the viewport (unlike Drawer's full-screen
        // breakpoint; see that component's own built-CSS guard for the contrasting case).
        expect(css).not.toMatch(/@media \(width/);
      }
    );

    // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
    itFailsWithoutDist(built);
  });
});

describe('Pagination — messages', () => {
  it("defaults the nav's accessible name to the pagination message", () => {
    const wrapper = mountWith(Pagination, { props: { page: 1, totalPages: 3 } });
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Pagination');
    wrapper.unmount();
  });

  it('ariaLabel overrides the default nav name', () => {
    const wrapper = mountWith(Pagination, {
      props: { page: 1, totalPages: 3, ariaLabel: 'Search results pages' },
    });
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Search results pages');
    wrapper.unmount();
  });
});

describe('Pagination — classes prop', () => {
  it('merges a classes override onto a named part instead of landing beside it', () => {
    const wrapper = mountWith(Pagination, {
      props: { page: 1, totalPages: 3, classes: { root: 'mt-8' } },
    });
    expect(wrapper.find('nav').classes()).toContain('mt-8');
    wrapper.unmount();
  });
});

describe('Pagination — accessibility', () => {
  it('is axe-clean at a mid-range page', async () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12 } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean forced compact', async () => {
    const wrapper = mountWith(Pagination, { props: { page: 6, totalPages: 12, compact: true } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean with real links', async () => {
    const wrapper = mountWith(Pagination, {
      props: { page: 6, totalPages: 12, hrefForPage: (n: number) => `?page=${n}` },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Pagination — narrow container', () => {
  it('renders in a 20rem host without throwing (the built CSS test above covers the CSS rule)', () => {
    const wrapper = mountNarrow(Pagination, { props: { page: 6, totalPages: 12 } });
    expect(wrapper.find('nav').exists()).toBe(true);
    wrapper.unmount();
  });
});
