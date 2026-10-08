import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  imageSrcset,
  imageUrl,
  imageVariantFor,
  isEldraImage,
  responsiveImage,
  type EldraImageSource,
} from '../image';

const ASSET =
  'https://media.eldra.app/public/6ace9a70-fb78-43f3-87a8-c8adffadcf36/assets/52a99a52-50a2-4e0f-ba14-d0a769e7eede';

describe('imageUrl', () => {
  it('appends the variant to a bare asset url', () => {
    expect(imageUrl(ASSET, 'xl')).toBe(`${ASSET}/xl`);
    expect(imageUrl(ASSET, 'original')).toBe(`${ASSET}/original`);
  });

  it('switches a url that already names a variant instead of stacking a second one', () => {
    expect(imageUrl(`${ASSET}/md`, 'lg')).toBe(`${ASSET}/lg`);
    expect(imageUrl(`${ASSET}/original/`, 'sm')).toBe(`${ASSET}/sm`);
  });

  it('reads the url off an api object', () => {
    expect(imageUrl({ url: ASSET, contentType: 'image/jpeg' }, 'sm')).toBe(`${ASSET}/sm`);
  });

  it('works for any media host and for a relative proxy path', () => {
    const local =
      'http://media.eldra.test:8787/public/6ace9a70-fb78-43f3-87a8-c8adffadcf36/assets/52a99a52-50a2-4e0f-ba14-d0a769e7eede';
    expect(imageUrl(local, 'lg')).toBe(`${local}/lg`);
    const proxied = `/media${new URL(ASSET).pathname}`;
    expect(imageUrl(proxied, 'lg')).toBe(`${proxied}/lg`);
  });

  it('returns any other url untouched', () => {
    for (const url of [
      'https://cdn.example.com/hero.jpg',
      `${ASSET}?w=200`,
      `${ASSET}/thumbnail`,
      'https://media.eldra.app/public/not-a-uuid/assets/also-not',
    ]) {
      expect(imageUrl(url, 'xl')).toBe(url);
    }
  });

  it('leaves formats the host serves as uploaded alone', () => {
    expect(imageUrl({ url: ASSET, contentType: 'image/svg+xml' }, 'xl')).toBe(ASSET);
    expect(imageUrl({ url: ASSET, contentType: 'image/gif' }, 'xl')).toBe(ASSET);
  });

  it('returns undefined when there is no url', () => {
    expect(imageUrl(null, 'md')).toBeUndefined();
    expect(imageUrl({ url: null }, 'md')).toBeUndefined();
    expect(imageUrl('', 'md')).toBeUndefined();
  });

  it('keeps a string in, string out at the type level', () => {
    expectTypeOf(imageUrl(ASSET, 'md')).toEqualTypeOf<string>();
    expectTypeOf(imageUrl({ url: ASSET } as EldraImageSource, 'md')).toEqualTypeOf<
      string | undefined
    >();
  });
});

describe('isEldraImage', () => {
  it('accepts a resizable asset and refuses everything else', () => {
    expect(isEldraImage(ASSET)).toBe(true);
    expect(isEldraImage({ url: ASSET, contentType: 'IMAGE/PNG' })).toBe(true);
    expect(isEldraImage({ url: ASSET, contentType: 'application/pdf' })).toBe(false);
    expect(isEldraImage('https://cdn.example.com/hero.jpg')).toBe(false);
    expect(isEldraImage(undefined)).toBe(false);
  });
});

describe('imageVariantFor', () => {
  it('picks the narrowest variant at least as wide as needed', () => {
    expect(imageVariantFor(96)).toBe('sm');
    expect(imageVariantFor(400)).toBe('sm');
    expect(imageVariantFor(401)).toBe('md');
    expect(imageVariantFor(360, 3)).toBe('lg');
    expect(imageVariantFor(1440, 2)).toBe('full');
  });

  it('refuses a width that is not a positive number', () => {
    expect(() => imageVariantFor(0)).toThrow(RangeError);
    expect(() => imageVariantFor(Number.NaN)).toThrow(RangeError);
  });
});

describe('imageSrcset', () => {
  it('lists every resized variant by its maximum width', () => {
    expect(imageSrcset(ASSET)).toBe(
      `${ASSET}/sm 400w, ${ASSET}/md 800w, ${ASSET}/lg 1200w, ${ASSET}/xl 1920w, ${ASSET}/full 2560w`
    );
  });

  it('stops at the original width and describes the last variant truthfully', () => {
    expect(imageSrcset(ASSET, { originalWidth: 1856 })).toBe(
      `${ASSET}/sm 400w, ${ASSET}/md 800w, ${ASSET}/lg 1200w, ${ASSET}/xl 1856w`
    );
    expect(imageSrcset(ASSET, { originalWidth: 1200 })).toBe(
      `${ASSET}/sm 400w, ${ASSET}/md 800w, ${ASSET}/lg 1200w`
    );
    expect(imageSrcset(ASSET, { originalWidth: 300 })).toBe(`${ASSET}/sm 300w`);
  });

  it('builds from the asset base when given a variant url', () => {
    expect(imageSrcset(`${ASSET}/md`)?.startsWith(`${ASSET}/sm 400w`)).toBe(true);
  });

  it('is undefined for anything it cannot resize', () => {
    expect(imageSrcset('https://cdn.example.com/hero.jpg')).toBeUndefined();
    expect(imageSrcset({ url: ASSET, contentType: 'image/svg+xml' })).toBeUndefined();
    expect(imageSrcset(null)).toBeUndefined();
  });

  it('refuses a url that would add a candidate of its own', () => {
    const path = new URL(ASSET).pathname;
    for (const url of [
      `https://evil.example/x.png 1w, https://media.eldra.app${path}`,
      `https://media.eldra.app/a,b${path}`,
      `https://media.eldra.app/a b${path}`,
      `javascript://%0Aalert(1)${path}`,
    ]) {
      expect(imageSrcset(url)).toBeUndefined();
      expect(imageUrl(url, 'lg')).toBe(url);
    }
  });
});

describe('responsiveImage', () => {
  it('gives src, srcset and sizes for an asset, with md as the fallback src', () => {
    expect(responsiveImage(ASSET, { sizes: '100vw' })).toEqual({
      src: `${ASSET}/md`,
      srcset: imageSrcset(ASSET),
      sizes: '100vw',
    });
  });

  it('uses the chosen fallback variant', () => {
    expect(responsiveImage(ASSET, { sizes: '100vw', variant: 'xl' })?.src).toBe(`${ASSET}/xl`);
  });

  it('turns an aspect ratio into width and height attributes', () => {
    expect(responsiveImage(ASSET, { sizes: '50vw', aspectRatio: 4 / 5 })).toMatchObject({
      width: 800,
      height: 1000,
    });
    expect(
      responsiveImage(ASSET, { sizes: '50vw', aspectRatio: 16 / 9, width: 1600, height: 900 })
    ).toMatchObject({ width: 1600, height: 900 });
  });

  it('passes an external image through with no srcset or sizes', () => {
    expect(
      responsiveImage('https://cdn.example.com/hero.jpg', { sizes: '100vw', aspectRatio: 2 })
    ).toEqual({ src: 'https://cdn.example.com/hero.jpg', width: 800, height: 400 });
  });

  it('is undefined with no url', () => {
    expect(responsiveImage({ url: null }, { sizes: '100vw' })).toBeUndefined();
  });
});
