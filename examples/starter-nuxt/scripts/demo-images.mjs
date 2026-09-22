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

// --- image manifest -----------------------------------------------------------

const avatarNames = ['Avery Kim', 'Priya Nair', 'Sam Osei', 'Jordan Lee'];

const images = [
  { name: 'hero', width: 1600, height: 1000, render: () => heroOrGallerySvg('hero', 1600, 1000) },
  ...Array.from({ length: 6 }, (_, i) => {
    const name = `product-${i + 1}`;
    return { name, width: 1200, height: 1200, render: () => productSvg(name, 1200, 1200) };
  }),
  ...Array.from({ length: 4 }, (_, i) => {
    const name = `avatar-${i + 1}`;
    return {
      name,
      width: 256,
      height: 256,
      render: () => avatarSvg(name, 256, 256, avatarNames[i]),
    };
  }),
  ...Array.from({ length: 6 }, (_, i) => {
    const name = `gallery-${i + 1}`;
    return { name, width: 1600, height: 1000, render: () => heroOrGallerySvg(name, 1600, 1000) };
  }),
  { name: 'logo', width: 480, height: 160, render: () => logoSvg('logo', 480, 160) },
  ...Array.from({ length: 4 }, (_, i) => {
    const name = `feature-${i + 1}`;
    return { name, width: 800, height: 600, render: () => featureSvg(name, 800, 600) };
  }),
];

for (const image of images) {
  const svg = image.render();
  writeFileSync(join(outDir, `${image.name}.svg`), svg);
}

console.log(`Generated ${images.length} demo SVGs in ${outDir}`);
