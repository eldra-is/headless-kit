#!/usr/bin/env node
// Real-browser smoke test for Carousel/Lightbox pointer drag and touch swipe (operator fix,
// 2026-09-26: "swiping/dragging ... is very broken — it starts and then kind of cancels; while
// dragging we are highlighting stuff"; round 2, same day: "we are not able to drag on a card, we
// have to place the cursor between cards ... if it's a clickable entry we should cancel the click
// ... if we swipe over some offset. That way the click stays functional but we can still swipe.").
// happy-dom (the unit test environment) has no real layout or native scroll-snap/touch-action
// behaviour, so the drag-without-fighting-scroll-smooth fix, the touch-action fix, the
// no-text-selection fix and the drag-starts-on-a-card fix can only be proven against a real
// Chromium build of Storybook — this is that proof, not a replacement for the Vitest specs in
// `src/components/carousel/__tests__/carousel.spec.ts` and
// `src/components/lightbox/__tests__/lightbox.spec.ts`, which cover the same behaviour at the
// DOM-event level.
//
// Usage (after `pnpm --filter @eldrajs/ui build-storybook`):
//   ELDRA_SCREENSHOTS_PORT=0 pnpm --filter @eldrajs/ui drag-smoke
//
// Serves the already-built `storybook-static` the same way `scripts/screenshots.mjs` does (a
// plain static file server on a free port), drives real pointer/touch input against the built
// `ProductRow` Carousel story and the `Default` Lightbox story, and asserts:
//   (a) a mouse drag moves `scrollLeft`/the active slide and leaves `window.getSelection()` empty
//       throughout, on both Carousel and Lightbox, starting from the gap between two slides;
//   (b) a touch swipe (`hasTouch: true`, raw CDP `Input.dispatchTouchEvent`) advances the active
//       slide through native scroll-snap panning, proving the `touch-action: pan-x pan-y` fix;
//   (c) a mouse drag starting directly ON a product card's own title link still drags the track
//       (proving the round-2 fix), never navigates the page, and never selects text;
//   (d) a plain click on a product card's title link, with no pointer movement at all, still
//       reaches the link with its default untouched — the click is only ever cancelled after a
//       real drag.
// Exits non-zero on any failed assertion, printing every observed number either way.
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const staticDir = join(rootDir, 'storybook-static');
const PORT = Number(process.env.ELDRA_SCREENSHOTS_PORT ?? 0);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function serveStatic(dir, port) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const filePath = join(dir, pathname);
      if (!filePath.startsWith(dir) || !existsSync(filePath)) {
        res.writeHead(filePath.startsWith(dir) ? 404 : 403);
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      });
      createReadStream(filePath).pipe(res);
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(() => resolve()));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gotoStory(page, baseUrl, id) {
  await page.goto(`${baseUrl}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(
    () => (document.getElementById('storybook-root')?.childElementCount ?? 0) > 0
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
  await page.waitForTimeout(400);
}

/** The slide whose left edge is closest to the track's own left edge — the same "nearest slide"
 *  question `useCarousel`'s own `closestChildIndex` answers, read back from the real DOM instead of
 *  a stub. */
async function activeIndex(page) {
  return page.evaluate(() => {
    const track = document.querySelector('[data-part="track"]');
    const trackLeft = track.getBoundingClientRect().left;
    const slides = Array.from(track.children);
    let closest = 0;
    let closestDistance = Infinity;
    slides.forEach((slide, i) => {
      const distance = Math.abs(slide.getBoundingClientRect().left - trackLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = i;
      }
    });
    return closest;
  });
}

async function trackScrollLeft(page) {
  return page.evaluate(() => document.querySelector('[data-part="track"]').scrollLeft);
}

async function trackDragging(page) {
  return page.evaluate(() =>
    document.querySelector('[data-part="track"]').getAttribute('data-dragging')
  );
}

async function selectionText(page) {
  return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

/** A point inside the track that is not over any of a slide's own content — used to prove a drag
 *  still works starting from plain track background, distinct from `productCardLinkPoint` below,
 *  which deliberately targets a slide's own stretched link (operator fix, 2026-09-26, round 2: a
 *  drag must also start ON a card, not only in the gap between cards). Two shapes of track exist in
 *  this package: `Carousel`'s own "peek" tracks (several partial slides visible, `ProductCard`'s
 *  whole card is a stretched link) need the *gap* between two slides; `Lightbox`'s track is always
 *  one 100%-width slide per view (`carouselPerViewStyle({ base: 1 })` — every image `<div>`
 *  wrapper stays mounted per that component's own comment, so `children.length` is the image
 *  *count*, not the per-view count, and slide 1's real position is off-screen, not beside slide 0)
 *  with no interactive element of its own inside the track (the prev/next arrows and thumbnails sit
 *  outside `trackRef`), so its own centre is always safe. Told apart by whether the first slide's
 *  own width already fills the track. */
async function dragStartPoint(page) {
  return page.evaluate(() => {
    const track = document.querySelector('[data-part="track"]');
    const trackRect = track.getBoundingClientRect();
    const slides = Array.from(track.children);
    const first = slides[0]?.getBoundingClientRect();
    const isFullWidthPerView = first !== undefined && first.width >= trackRect.width * 0.9;
    if (slides.length >= 2 && !isFullWidthPerView) {
      const a = first;
      const b = slides[1].getBoundingClientRect();
      return { x: (a.right + b.left) / 2, y: trackRect.top + trackRect.height / 2 };
    }
    return { x: trackRect.left + trackRect.width / 2, y: trackRect.top + trackRect.height / 2 };
  });
}

/** The bounding-box centre of the *first* slide's own title link (`ProductCard`'s stretched
 *  `[data-part="link"]`, spec "Product card" → Anatomy) — the exact point the operator's round-2
 *  complaint names: "we are not able to drag on a card, we have to place the cursor between
 *  cards." `dragStartPoint` above deliberately avoids this same point (to keep proving a drag
 *  starting elsewhere on the track still works); this proves the fix's whole point, that starting
 *  directly on the card's own link now works too. */
async function productCardLinkPoint(page) {
  return page.evaluate(() => {
    const link = document.querySelector('[data-part="track"] [data-part="link"]');
    const rect = link.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

/** `startOverride` lets a caller drag from a specific point (`productCardLinkPoint` above) instead
 *  of the plain-background `dragStartPoint`; `page.url()` before/after proves the link's own
 *  navigation never fired (operator ruling: "the click stays functional but we can still swipe" —
 *  a real drag must resolve as a drag, never as a navigation). */
async function mouseDragSmoke(page, label, startOverride) {
  const before = { scrollLeft: await trackScrollLeft(page), index: await activeIndex(page) };
  const beforeHref = page.url();
  const start = startOverride ?? (await dragStartPoint(page));
  const steps = 10;
  const totalDx = 300;

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  let midDragging;
  let midSelection;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(start.x - (totalDx * i) / steps, start.y, { steps: 1 });
    await sleep(12);
    if (i === Math.ceil(steps / 2)) {
      midDragging = await trackDragging(page);
      midSelection = await selectionText(page);
    }
  }
  const duringScrollLeft = await trackScrollLeft(page);
  await page.mouse.up();
  await page.waitForTimeout(500); // let the release snap settle
  const after = { scrollLeft: await trackScrollLeft(page), index: await activeIndex(page) };
  const afterHref = page.url();
  const afterSelection = await selectionText(page);
  const afterDragging = await trackDragging(page);

  console.log(`[drag-smoke] ${label}: mouse drag`);
  console.log(`  before  scrollLeft=${before.scrollLeft} index=${before.index} href=${beforeHref}`);
  console.log(
    `  mid-drag scrollLeft=${duringScrollLeft} data-dragging=${midDragging} selection=${JSON.stringify(midSelection)}`
  );
  console.log(
    `  after   scrollLeft=${after.scrollLeft} index=${after.index} href=${afterHref} data-dragging=${afterDragging} selection=${JSON.stringify(afterSelection)}`
  );

  const failures = [];
  if (midDragging !== 'true') failures.push('data-dragging was not "true" mid-drag');
  if (midSelection !== '')
    failures.push(`text got selected mid-drag: ${JSON.stringify(midSelection)}`);
  if (!(duringScrollLeft > before.scrollLeft)) {
    failures.push(
      `scrollLeft did not advance during the drag (${before.scrollLeft} -> ${duringScrollLeft})`
    );
  }
  if (afterDragging !== null) failures.push('data-dragging was not cleared after release');
  if (afterSelection !== '')
    failures.push(`text stayed selected after release: ${JSON.stringify(afterSelection)}`);
  if (!(after.index > before.index)) {
    failures.push(`active index did not advance (${before.index} -> ${after.index})`);
  }
  if (afterHref !== beforeHref) {
    failures.push(`the page navigated during the drag (${beforeHref} -> ${afterHref})`);
  }
  return failures;
}

/**
 * The other half of the round-2 ruling: "if it's a clickable entry we should cancel the click ...
 * if we swipe over some offset. That way the click stays functional but we can still swipe." A
 * plain click on the card's title link, with no pointer movement at all, must never have already
 * had its default prevented by the drag machinery — it is only ever cancelled *after* a real drag
 * (proven separately by `mouseDragSmoke` on this exact link, above). The listener records
 * `event.defaultPrevented` as read at the moment it runs, then prevents the click itself so the
 * assertion never actually navigates this page away from the story regardless of the outcome.
 */
async function cardLinkClickSmoke(page, label) {
  const point = await productCardLinkPoint(page);
  await page.evaluate(() => {
    window.__eldraLinkClickDefaultPrevented = undefined;
    const link = document.querySelector('[data-part="track"] [data-part="link"]');
    link.addEventListener(
      'click',
      (event) => {
        window.__eldraLinkClickDefaultPrevented = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true }
    );
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(50);
  const defaultPrevented = await page.evaluate(() => window.__eldraLinkClickDefaultPrevented);

  console.log(`[drag-smoke] ${label}: plain click on card title link (no movement)`);
  console.log(`  click defaultPrevented=${defaultPrevented}`);

  const failures = [];
  if (defaultPrevented !== false) {
    failures.push(
      `a plain click on the card title link had its default already prevented (expected false, got ${defaultPrevented})`
    );
  }
  return failures;
}

async function touchSwipeSmoke(context, page, label) {
  const before = { scrollLeft: await trackScrollLeft(page), index: await activeIndex(page) };
  const start = await dragStartPoint(page);
  const client = await context.newCDPSession(page);
  const steps = 10;
  const totalDx = 300;

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: start.x, y: start.y }],
  });
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: start.x - (totalDx * i) / steps, y: start.y }],
    });
    await sleep(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Native scroll-snap panning + its own release settle, not a JS animation this script drives.
  await page.waitForTimeout(700);
  const after = { scrollLeft: await trackScrollLeft(page), index: await activeIndex(page) };

  console.log(`[drag-smoke] ${label}: touch swipe`);
  console.log(`  before  scrollLeft=${before.scrollLeft} index=${before.index}`);
  console.log(`  after   scrollLeft=${after.scrollLeft} index=${after.index}`);

  const failures = [];
  if (!(after.index > before.index)) {
    failures.push(
      `touch swipe did not advance the active index (${before.index} -> ${after.index})`
    );
  }
  return failures;
}

async function main() {
  if (!existsSync(join(staticDir, 'index.json'))) {
    throw new Error(`[drag-smoke] ${staticDir} has no index.json — run build-storybook first`);
  }
  const server = await serveStatic(staticDir, PORT);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`[drag-smoke] serving ${staticDir} at ${baseUrl}`);

  const failures = [];
  const browser = await chromium.launch();
  try {
    // (a) Carousel ProductRow — mouse drag.
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await gotoStory(page, baseUrl, 'navigation-carousel--product-row');
      failures.push(
        ...(await mouseDragSmoke(page, 'Carousel ProductRow')).map((f) => `Carousel mouse: ${f}`)
      );
      await context.close();
    }

    // (b) Carousel ProductRow — touch swipe, hasTouch context.
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 800 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      await gotoStory(page, baseUrl, 'navigation-carousel--product-row');
      failures.push(
        ...(await touchSwipeSmoke(context, page, 'Carousel ProductRow')).map(
          (f) => `Carousel touch: ${f}`
        )
      );
      await context.close();
    }

    // (c) Lightbox Default — mouse drag.
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await gotoStory(page, baseUrl, 'overlays-lightbox--default');
      failures.push(
        ...(await mouseDragSmoke(page, 'Lightbox Default')).map((f) => `Lightbox mouse: ${f}`)
      );
      await context.close();
    }

    // (d) Carousel ProductRow — a mouse drag starting directly ON a product card's own title link
    // (operator fix, 2026-09-26, round 2: "we are not able to drag on a card, we have to place the
    // cursor between cards").
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await gotoStory(page, baseUrl, 'navigation-carousel--product-row');
      failures.push(
        ...(
          await mouseDragSmoke(
            page,
            'Carousel ProductRow (drag starting on the card link)',
            await productCardLinkPoint(page)
          )
        ).map((f) => `Carousel link drag: ${f}`)
      );
      await context.close();
    }

    // (e) Carousel ProductRow — a plain click on the card's title link, no movement at all, keeps
    // its own default: the click is only ever cancelled after a real drag.
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await gotoStory(page, baseUrl, 'navigation-carousel--product-row');
      failures.push(
        ...(await cardLinkClickSmoke(page, 'Carousel ProductRow')).map(
          (f) => `Carousel link click: ${f}`
        )
      );
      await context.close();
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }

  if (failures.length > 0) {
    console.log(`\n[drag-smoke] ${failures.length} check(s) failed:`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\n[drag-smoke] all checks passed');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
