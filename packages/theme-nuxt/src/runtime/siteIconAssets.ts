import type { ResolvedSiteIcons } from './siteIcons';

/** One file the build writes into the static output. */
export interface GeneratedIconFile {
  /** Path relative to the site root. */
  name: string;
  data: Buffer;
}

export interface SiteIconOutput {
  /** Only `site.webmanifest`: every image is linked straight from the media CDN. */
  files: GeneratedIconFile[];
  link: Record<string, string>[];
  meta: Record<string, string>[];
}

/**
 * The web manifest and head tags for a resolved site icon setting. Pure and in-memory — no image
 * is fetched or processed here: the media worker renders every size (always PNG), Core builds the
 * URLs, and this only points at them. The manifest is same-origin JSON (a browser requires it).
 */
export function buildSiteIconOutput(
  setting: Pick<
    ResolvedSiteIcons,
    'icons' | 'backgroundColor' | 'themeColor' | 'shortName' | 'name'
  >,
  baseURL = '/'
): SiteIconOutput {
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  const { icons } = setting;
  const name = setting.name ?? setting.shortName;
  const manifest: Record<string, unknown> = {
    ...(name === null ? {} : { name }),
    ...(setting.shortName === null ? {} : { short_name: setting.shortName }),
    icons: [
      { src: icons.icon192, sizes: '192x192', type: 'image/png' },
      { src: icons.icon512, sizes: '512x512', type: 'image/png' },
      { src: icons.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    ...(setting.themeColor === null ? {} : { theme_color: setting.themeColor }),
    background_color: setting.backgroundColor,
    display: 'standalone',
    start_url: base,
  };
  return {
    files: [
      { name: 'site.webmanifest', data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
    ],
    link: [
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: icons.favicon32 },
      { rel: 'apple-touch-icon', href: icons.appleTouch180 },
      { rel: 'manifest', href: `${base}site.webmanifest` },
    ],
    meta: setting.themeColor === null ? [] : [{ name: 'theme-color', content: setting.themeColor }],
  };
}
