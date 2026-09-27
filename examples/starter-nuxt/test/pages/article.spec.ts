// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { axe } from '../support/axe';
import { mountPage, type PageFixture } from '../support/mountPage';
import fixture from '../../pages/article.page.json';

const page = fixture as unknown as PageFixture;

const ARTICLE_TITLE = 'How we glaze our stoneware';
const RELATED_TITLES = [
  'Inside the Porto linen mill',
  'Caring for merino: a winter guide',
  'Five-minute brown butter oats',
];

describe('article sample page', () => {
  it('renders the six blocks, in order, on their documented grounds and containers', async () => {
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');
    const children = Array.from(main.element.children);
    expect(children).toHaveLength(6);
    const [headerEl, breadcrumbsEl, articleEl, articleListEl, newsletterEl, footerEl] = children;

    // Tag + landmark identity, in document order.
    expect(headerEl!.tagName).toBe('HEADER');
    expect(headerEl!.querySelector('nav')).not.toBeNull();
    expect(breadcrumbsEl!.tagName).toBe('DIV');
    expect(breadcrumbsEl!.querySelector('nav[aria-label]')).not.toBeNull();
    expect(articleEl!.querySelector('article')).not.toBeNull();
    expect(articleListEl!.tagName).toBe('SECTION');
    expect(newsletterEl!.tagName).toBe('SECTION');
    expect(footerEl!.tagName).toBe('FOOTER');

    // The ground each block sits on (Section's data-section-bg), in order.
    const grounds = children.map((el) => el.getAttribute('data-section-bg'));
    expect(grounds).toEqual(['none', 'none', 'none', 'none', 'surface', 'surface-strong']);
  });

  it('has exactly one h1 (the article title); the related list heading is h2 and its cards are h3', async () => {
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');

    const h1s = main.findAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text()).toBe(ARTICLE_TITLE);

    const articleListEl = main.element.children[3]!;
    const relatedHeading = articleListEl.querySelector('h2');
    expect(relatedHeading?.textContent).toBe('More from the journal');

    const cardHeadings = Array.from(articleListEl.querySelectorAll('h3'));
    expect(cardHeadings.map((h) => h.textContent)).toEqual(RELATED_TITLES);
  });

  it("sits the related list on the article block's own ground so its top padding collapses, while the newsletter and footer change ground and keep full padding", async () => {
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');
    const [, , articleEl, articleListEl, newsletterEl, footerEl] = Array.from(
      main.element.children
    );

    // Same background as the immediately preceding sibling: the package's adjacent-background
    // CSS rule (`[data-section-bg='x'] + [data-section-bg='x']`) drops the second one's own top
    // padding for exactly this pair.
    expect(articleListEl!.getAttribute('data-section-bg')).toBe(
      articleEl!.getAttribute('data-section-bg')
    );

    // The newsletter and footer each change ground relative to the sibling before them, so
    // neither one's top padding is touched by that rule — both keep a full section gap.
    expect(newsletterEl!.getAttribute('data-section-bg')).not.toBe(
      articleListEl!.getAttribute('data-section-bg')
    );
    expect(footerEl!.getAttribute('data-section-bg')).not.toBe(
      newsletterEl!.getAttribute('data-section-bg')
    );
  });

  it('leaves the current post out of the related list and renders exactly one newsletter sign-up', async () => {
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');

    const articleListEl = main.element.children[3]!;
    const cardTitles = Array.from(articleListEl.querySelectorAll('h3')).map((h) => h.textContent);
    expect(cardTitles).not.toContain(ARTICLE_TITLE);
    expect(cardTitles).toHaveLength(3);

    // One newsletter sign-up on the whole page: exactly one email field (the footer's own is
    // switched off — `showNewsletter: false` — and the header's search form has no email input).
    const emailFields = main.element.querySelectorAll('input[type="email"]');
    expect(emailFields).toHaveLength(1);
    expect(main.element.children[4]!.contains(emailFields[0]!)).toBe(true);

    // The footer itself renders no `<form>` at all with its newsletter off.
    expect(main.element.children[5]!.querySelectorAll('form')).toHaveLength(0);
  });

  it('keeps the article header and cover in the 64rem content container and the body/author card in the 40rem narrow container', async () => {
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');
    const articleEl = main.element.children[2]!;

    const contentContainers = articleEl.querySelectorAll('.eldra-container-content');
    const narrowContainers = articleEl.querySelectorAll('.eldra-container-narrow');
    expect(contentContainers.length).toBeGreaterThan(0);
    expect(narrowContainers.length).toBeGreaterThan(0);
    expect(articleEl.querySelectorAll('.eldra-container-wide')).toHaveLength(0);

    // The content container (header + cover) precedes the narrow one (body + author card).
    const firstContent = contentContainers[0]!;
    const firstNarrow = narrowContainers[0]!;
    expect(
      firstContent.compareDocumentPosition(firstNarrow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // The header/breadcrumbs stay on the 80rem wide container.
    expect(main.element.children[0]!.querySelector('.eldra-container-wide')).not.toBeNull();
    expect(main.element.children[1]!.querySelector('.eldra-container-wide')).not.toBeNull();
  });

  it('wraps the body table in a named, focusable region and marks its code block focusable', async () => {
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');
    const articleEl = main.element.children[2]!;

    const region = articleEl.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('tabindex')).toBe('0');
    expect(region!.getAttribute('aria-label')).toBeTruthy();
    expect(region!.querySelector('table')).not.toBeNull();
    expect(region!.textContent).toContain('Fjord');

    const pre = articleEl.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.getAttribute('tabindex')).toBe('0');
    expect(pre!.textContent).toContain('2,264');

    // The reactive-glaze batch code stamp renders as inline code, next to the firing schedule.
    const inlineCode = Array.from(articleEl.querySelectorAll('code')).find(
      (el) => el.textContent === 'FJ-26-09'
    );
    expect(inlineCode).toBeDefined();
  });

  it('follows the visual order header → breadcrumbs → article (links, then the author link) → related list → newsletter → footer', async () => {
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');
    const [headerEl, breadcrumbsEl, articleEl, articleListEl, newsletterEl, footerEl] = Array.from(
      main.element.children
    );

    // Every block contributes at least one focusable element, and each one sits inside its own
    // block's root — proving the page's tab order runs through the blocks in fixture order.
    for (const el of [headerEl, breadcrumbsEl, articleEl, articleListEl, newsletterEl, footerEl]) {
      const focusable = el!.querySelectorAll('a[href], button, input, [tabindex]');
      expect(focusable.length).toBeGreaterThan(0);
    }

    // Within the article block, every in-body link precedes the author card's own link — the
    // author card closes the post, so its link is the last one inside the block.
    const articleLinks = Array.from(articleEl!.querySelectorAll('a[href]'));
    const authorLink = articleLinks.find((a) => a.textContent?.trim() === 'More from Ingrid');
    expect(authorLink).toBeDefined();
    expect(articleLinks.at(-1)).toBe(authorLink);
    expect(articleLinks.length).toBeGreaterThan(1);

    // Within the related list, "View all stories" and the three story cards are both reachable.
    const viewAllLink = Array.from(articleListEl!.querySelectorAll('a[href]')).find(
      (a) => a.textContent?.trim() === 'View all stories'
    );
    expect(viewAllLink).toBeDefined();
    const cardLinks = RELATED_TITLES.map((title) =>
      Array.from(articleListEl!.querySelectorAll('a[href]')).find((a) =>
        a.textContent?.includes(title)
      )
    );
    expect(cardLinks.every((link) => link !== undefined)).toBe(true);
  });

  it('reads Portland everywhere the studio is named, and never Bergen', async () => {
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');
    const articleEl = main.element.children[2]!;
    const footerEl = main.element.children[5]!;

    expect(articleEl.textContent).toContain(
      'Bisqueware waiting for its glaze bath in the Portland studio.'
    );
    expect(articleEl.textContent).toContain(
      'Ingrid has thrown pots in Portland for eighteen years'
    );
    expect(footerEl.textContent).toContain('Studio and shop in Portland, Oregon.');
    expect(main.text()).not.toContain('Bergen');
  });

  it('has no axe violations over the whole rendered page', async () => {
    const wrapper = await mountPage(page);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
