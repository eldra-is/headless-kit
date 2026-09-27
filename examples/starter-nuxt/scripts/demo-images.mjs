#!/usr/bin/env node
// Generates deterministic placeholder SVGs for the starter's mock content
// into public/demo/. No third-party media assets and no randomness: every
// image is seeded by its own file name, so re-running this script produces
// byte-identical output. Palette is the starter's own design tokens
// (primary #1d4ed8, accent #0f766e, surface #f6f7f9, surface-strong
// #e9ecf1) so the placeholders already look at home next to the real
// theme colors.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../public/demo', import.meta.url));
mkdirSync(outDir, { recursive: true });

const PRIMARY = '#1d4ed8';
const ACCENT = '#0f766e';
const SURFACE = '#f6f7f9';
const SURFACE_STRONG = '#e9ecf1';
const INK = '#14181f';

// --- deterministic PRNG, seeded from the image's own name -----------------

function seedFromName(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32
function makeRng(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

// --- shared building blocks -------------------------------------------------

function gradientDef(id, angleDeg, stops) {
  const rad = (angleDeg * Math.PI) / 180;
  const x1 = round(50 - Math.cos(rad) * 50);
  const y1 = round(50 - Math.sin(rad) * 50);
  const x2 = round(50 + Math.cos(rad) * 50);
  const y2 = round(50 + Math.sin(rad) * 50);
  const stopEls = stops
    .map(
      ([offset, color, opacity]) =>
        `<stop offset="${offset}%" stop-color="${color}"${
          opacity === undefined ? '' : ` stop-opacity="${opacity}"`
        }/>`
    )
    .join('');
  return `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopEls}</linearGradient>`;
}

function blurredCircle(rng, w, h, opts = {}) {
  const {
    color = PRIMARY,
    opacity = 0.35,
    minR = Math.min(w, h) * 0.12,
    maxR = Math.min(w, h) * 0.32,
    blur = Math.min(w, h) * 0.06,
  } = opts;
  const cx = round(w * (0.15 + rng() * 0.7));
  const cy = round(h * (0.15 + rng() * 0.7));
  const r = round(minR + rng() * (maxR - minR));
  return { cx, cy, r, color, opacity, blur };
}

function circleEl(c, filterId) {
  return `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${c.color}" fill-opacity="${c.opacity}" filter="url(#${filterId})"/>`;
}

function blurFilter(id, stdDeviation) {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${stdDeviation}"/></filter>`;
}

function svgWrap(name, width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(
    name
  )}">${body}</svg>\n`;
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A layered gradient backdrop with two soft blurred circles, used by hero,
// gallery and feature images.
function backdrop(rng, w, h, label) {
  const gradId = `${label}-grad`;
  const blurA = `${label}-blur-a`;
  const blurB = `${label}-blur-b`;
  const angle = round(rng() * 360);
  const gradient = gradientDef(gradId, angle, [
    [0, SURFACE],
    [55, SURFACE_STRONG],
    [100, '#dfe4ea'],
  ]);
  const circleA = blurredCircle(rng, w, h, { color: PRIMARY, opacity: 0.28 });
  const circleB = blurredCircle(rng, w, h, { color: ACCENT, opacity: 0.24 });
  const defs = `<defs>${gradient}${blurFilter(blurA, Math.min(w, h) * 0.08)}${blurFilter(
    blurB,
    Math.min(w, h) * 0.1
  )}</defs>`;
  const rect = `<rect width="${w}" height="${h}" fill="url(#${gradId})"/>`;
  return `${defs}${rect}${circleEl(circleA, blurA)}${circleEl(circleB, blurB)}`;
}

// --- generators --------------------------------------------------------------

function heroOrGallerySvg(name, width, height) {
  const rng = makeRng(seedFromName(name));
  const body = backdrop(rng, width, height, name.replace(/[^a-z0-9]/gi, ''));
  return svgWrap(name, width, height, body);
}

function productSvg(name, width, height) {
  const rng = makeRng(seedFromName(name));
  const label = name.replace(/[^a-z0-9]/gi, '');
  const body = backdrop(rng, width, height, label);
  const bodyW = round(width * 0.46);
  const bodyH = round(height * 0.4);
  const bodyX = round((width - bodyW) / 2);
  const bodyY = round(height * 0.42);
  const radius = round(bodyW * 0.12);
  const lidRx = round(bodyW * 0.56);
  const lidRy = round(bodyH * 0.14);
  const lidCx = round(width / 2);
  const lidCy = bodyY;
  const silhouette = `<g fill="${INK}" fill-opacity="0.82">
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${radius}"/>
    <ellipse cx="${lidCx}" cy="${lidCy}" rx="${lidRx}" ry="${lidRy}"/>
  </g>`;
  return svgWrap(name, width, height, `${body}${silhouette}`);
}

function initialsFor(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function avatarSvg(name, width, height, displayName) {
  const rng = makeRng(seedFromName(name));
  const label = name.replace(/[^a-z0-9]/gi, '');
  const gradId = `${label}-grad`;
  const angle = round(rng() * 360);
  const gradient = gradientDef(gradId, angle, [
    [0, PRIMARY],
    [100, ACCENT],
  ]);
  const initials = initialsFor(displayName);
  const fontSize = round(width * 0.34);
  const body = `<defs>${gradient}</defs>
    <circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" fill="url(#${gradId})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${fontSize}" font-weight="600" fill="#ffffff">${escapeXml(
      initials
    )}</text>`;
  return svgWrap(name, width, height, body);
}

function logoSvg(name, width, height) {
  const rng = makeRng(seedFromName(name));
  const markR = round(height * 0.28);
  const markCx = round(height * 0.5);
  const markCy = round(height * 0.5);
  const angle = round(rng() * 360);
  const gradId = 'logo-grad';
  const gradient = gradientDef(gradId, angle, [
    [0, PRIMARY],
    [100, ACCENT],
  ]);
  const textX = round(markCx + markR + height * 0.28);
  const fontSize = round(height * 0.34);
  const body = `<defs>${gradient}</defs>
    <circle cx="${markCx}" cy="${markCy}" r="${markR}" fill="url(#${gradId})"/>
    <text x="${textX}" y="50%" dominant-baseline="central" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${fontSize}" font-weight="700" fill="${INK}">Northwind</text>`;
  return svgWrap(name, width, height, body);
}

function featureSvg(name, width, height) {
  const rng = makeRng(seedFromName(name));
  const label = name.replace(/[^a-z0-9]/gi, '');
  const body = backdrop(rng, width, height, label);
  const r = round(Math.min(width, height) * 0.16);
  const cx = round(width / 2);
  const cy = round(height * 0.44);
  const mark = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PRIMARY}" fill-opacity="0.85"/>`;
  return svgWrap(name, width, height, `${body}${mark}`);
}

// A backdrop with a simple person silhouette (head + shoulders), used by the
// `team` block's member photos and `quote`'s portrait variant — both want a
// "photo of a person" placeholder, distinct from the small circular
// initials `avatarSvg` draws for byline/reviewer avatars.
function personSvg(name, width, height) {
  const rng = makeRng(seedFromName(name));
  const label = name.replace(/[^a-z0-9]/gi, '');
  const body = backdrop(rng, width, height, label);
  const headR = round(width * 0.16);
  const headCx = round(width / 2);
  const headCy = round(height * (0.3 + rng() * 0.06));
  const shoulderW = round(width * 0.72);
  const shoulderH = round(height * 0.46);
  const shoulderX = round((width - shoulderW) / 2);
  const shoulderY = round(height * 0.6);
  const shoulderRx = round(shoulderW * 0.32);
  const silhouette = `<g fill="${INK}" fill-opacity="0.82">
    <circle cx="${headCx}" cy="${headCy}" r="${headR}"/>
    <rect x="${shoulderX}" y="${shoulderY}" width="${shoulderW}" height="${shoulderH}" rx="${shoulderRx}"/>
  </g>`;
  return svgWrap(name, width, height, `${body}${silhouette}`);
}

// An abstract mark-plus-wordmark shape (a gradient mark beside two tapered
// bars standing in for a company name and tagline) — deliberately not a
// real or invented brand name, just a coloured shape in the spirit of this
// script's placeholders, for the `logo-cloud` block's partner-logo strip.
function wordmarkSvg(name, width, height) {
  const rng = makeRng(seedFromName(name));
  const label = name.replace(/[^a-z0-9]/gi, '');
  const gradId = `${label}-grad`;
  const markR = round(height * 0.28);
  const markCx = round(height * 0.5);
  const markCy = round(height * 0.5);
  const angle = round(rng() * 360);
  const gradient = gradientDef(gradId, angle, [
    [0, PRIMARY],
    [100, ACCENT],
  ]);
  const textX = round(markCx + markR + height * 0.3);
  const barH = round(height * 0.16);
  const gap = round(height * 0.12);
  const bar1Y = round(height * 0.34);
  const bar2Y = round(bar1Y + barH + gap);
  const bar1W = round(width * (0.32 + rng() * 0.14));
  const bar2W = round(bar1W * (0.5 + rng() * 0.3));
  const body = `<defs>${gradient}</defs>
    <circle cx="${markCx}" cy="${markCy}" r="${markR}" fill="url(#${gradId})"/>
    <rect x="${textX}" y="${bar1Y}" width="${bar1W}" height="${barH}" rx="${round(barH / 2)}" fill="${INK}" fill-opacity="0.82"/>
    <rect x="${textX}" y="${bar2Y}" width="${bar2W}" height="${barH}" rx="${round(barH / 2)}" fill="${INK}" fill-opacity="0.5"/>`;
  return svgWrap(name, width, height, body);
}

// A stylised map placeholder (a light grid of "roads" plus one pin) for the
// `contact` block's map slot — a flat shape standing in for an embedded
// map, the same way every other generator stands in for a photo.
function mapSvg(name, width, height) {
  const rng = makeRng(seedFromName(name));
  const parts = [`<rect width="${width}" height="${height}" fill="${SURFACE}"/>`];
  const vLines = 6;
  const hLines = 3;
  for (let i = 1; i < vLines; i++) {
    const x = round((width / vLines) * i + (rng() - 0.5) * 20);
    parts.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${SURFACE_STRONG}" stroke-width="3"/>`
    );
  }
  for (let i = 1; i < hLines; i++) {
    const y = round((height / hLines) * i + (rng() - 0.5) * 10);
    parts.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${SURFACE_STRONG}" stroke-width="3"/>`
    );
  }
  const pinX = round(width * (0.4 + rng() * 0.2));
  const pinY = round(height * (0.35 + rng() * 0.25));
  const pinR = round(Math.min(width, height) * 0.06);
  parts.push(`<circle cx="${pinX}" cy="${pinY}" r="${pinR}" fill="${ACCENT}"/>`);
  parts.push(`<circle cx="${pinX}" cy="${pinY}" r="${round(pinR * 0.4)}" fill="${SURFACE}"/>`);
  return svgWrap(name, width, height, parts.join(''));
}

// --- image manifest -----------------------------------------------------------
//
// Every name here is a `mock.json`/`preview.json` media source across the 33
// blocks: generic photographic backdrops
// (`heroOrGallerySvg`) for hero/gallery/collection/split/article/poster/cta
// imagery, product silhouettes (`productSvg`) at both the portrait and
// square crops product cards use, person placeholders (`personSvg`) for
// team photos and the quote block's portrait variant, initials avatars
// (`avatarSvg`) for bylines and reviews, abstract wordmarks (`wordmarkSvg`)
// for the logo cloud, and one map (`mapSvg`) for the contact block.

// One name per `avatar-N.svg`, in order, and each one is the name the mock that *uses* that avatar
// prints beside it — `avatarSvg` draws the initials from this list, so a mismatch renders
// "Hannah Reeve — AK" on the home and article sample pages, in Storybook and in the shipped
// `preview.png`. Keep this list and the mocks in step: change a reviewer's name in
// `blocks/testimonials/{mock,preview}.json` and change it here in the same edit, then rerun
// `pnpm --filter starter-nuxt demo-images` and `previews`.
const avatarNames = [
  'Hannah Reeve', // avatar-1 — blocks/testimonials items[0]
  'Marcus Bell', // avatar-2 — blocks/testimonials items[1]
  'Priya Nair', // avatar-3 — blocks/testimonials items[2]
  'Sofia Lind', // avatar-4 — blocks/testimonials items[3]
  'The Larder Journal', // avatar-5 — blocks/quote's attribution
  'Ingrid Moe', // avatar-6 — blocks/article's byline
  'Joel Mercer', // avatar-7 — blocks/testimonials items[4], which carries no avatar today
  'Casey Novak', // avatar-8 — spare, used by no mock yet
];

function seriesOf(prefix, count, width, height, render) {
  return Array.from({ length: count }, (_, i) => {
    const name = `${prefix}-${i + 1}`;
    return { name, width, height, render: () => render(name, width, height) };
  });
}

const images = [
  { name: 'hero', width: 1600, height: 1000, render: () => heroOrGallerySvg('hero', 1600, 1000) },
  {
    name: 'hero-wide',
    width: 2400,
    height: 800,
    render: () => heroOrGallerySvg('hero-wide', 2400, 800),
  },
  ...seriesOf('hero-slide', 4, 1200, 1500, heroOrGallerySvg),
  ...seriesOf('product', 12, 1200, 1500, productSvg),
  ...seriesOf('product-square', 6, 1200, 1200, productSvg),
  ...seriesOf('collection', 2, 1600, 1067, heroOrGallerySvg),
  ...seriesOf('split', 4, 1600, 1200, heroOrGallerySvg),
  ...seriesOf('feature', 4, 800, 600, featureSvg),
  ...seriesOf('gallery', 8, 1600, 1000, heroOrGallerySvg),
  ...seriesOf('team', 4, 1000, 1250, personSvg),
  { name: 'logo', width: 480, height: 160, render: () => logoSvg('logo', 480, 160) },
  ...seriesOf('logo', 8, 480, 160, wordmarkSvg),
  ...Array.from({ length: 8 }, (_, i) => {
    const name = `avatar-${i + 1}`;
    return {
      name,
      width: 256,
      height: 256,
      render: () => avatarSvg(name, 256, 256, avatarNames[i]),
    };
  }),
  {
    name: 'article-cover',
    width: 1920,
    height: 1080,
    render: () => heroOrGallerySvg('article-cover', 1920, 1080),
  },
  {
    name: 'article-figure',
    width: 1600,
    height: 1000,
    render: () => heroOrGallerySvg('article-figure', 1600, 1000),
  },
  {
    name: 'quote-portrait',
    width: 1000,
    height: 1250,
    render: () => personSvg('quote-portrait', 1000, 1250),
  },
  {
    name: 'poster',
    width: 1920,
    height: 1080,
    render: () => heroOrGallerySvg('poster', 1920, 1080),
  },
  { name: 'map', width: 1600, height: 500, render: () => mapSvg('map', 1600, 500) },
  {
    name: 'cta-split',
    width: 1200,
    height: 900,
    render: () => heroOrGallerySvg('cta-split', 1200, 900),
  },
];

for (const image of images) {
  const svg = image.render();
  writeFileSync(join(outDir, `${image.name}.svg`), svg);
}

console.log(`Generated ${images.length} demo SVGs in ${outDir}`);
