// Responsive images from Eldra media, for a renderer without a component: a product card, a hero and a share image.
import { imageUrl, imageVariantFor, responsiveImage, type EldraImageSource } from '@eldrajs/sdk';

type Thumbnail = { url: string; altText?: string | null };

const escapeAttribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

function img(attributes: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${escapeAttribute(String(value))}"`);
  return `<img ${pairs.join(' ')}>`;
}

// Four across on desktop, two on phones; the card box is 4:5.
export function productCardImage(thumbnail: Thumbnail | null, title: string): string {
  const image = responsiveImage(thumbnail, {
    sizes: '(min-width: 1024px) 25vw, 50vw',
    aspectRatio: 4 / 5,
  });
  if (!image) return '';
  return img({ ...image, alt: thumbnail?.altText || title, loading: 'lazy', decoding: 'async' });
}

// Above the fold: load it now, and fall back to a wide variant.
export function heroImage(source: EldraImageSource, alt: string): string {
  const image = responsiveImage(source, { sizes: '100vw', variant: 'xl', aspectRatio: 16 / 7 });
  if (!image) return '';
  return img({ ...image, alt, fetchpriority: 'high', decoding: 'async' });
}

// One URL, no srcset: Open Graph cards are shown at about 1200 px wide.
export function shareImageUrl(source: EldraImageSource): string | undefined {
  return imageUrl(source, imageVariantFor(1200));
}
