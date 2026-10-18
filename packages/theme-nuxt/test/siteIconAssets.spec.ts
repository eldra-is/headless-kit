import { describe, expect, it } from 'vitest';
import { buildSiteIconOutput } from '../src/runtime/siteIconAssets';

const ICONS = {
  favicon32: 'https://cdn.example.test/public/o/assets/a/icon-32',
  appleTouch180: 'https://cdn.example.test/public/o/assets/a/icon-180?bg=112233',
  icon192: 'https://cdn.example.test/public/o/assets/a/icon-192',
  icon512: 'https://cdn.example.test/public/o/assets/a/icon-512',
  maskable512: 'https://cdn.example.test/public/o/assets/a/icon-maskable-512?bg=112233',
};
const SETTING = {
  icons: ICONS,
  backgroundColor: '#112233',
  themeColor: '#ff6600' as string | null,
  shortName: 'Sóley' as string | null,
  name: 'Sóley Store' as string | null,
};

describe('buildSiteIconOutput', () => {
  it('writes only the manifest, pointing its icons at the media URLs', () => {
    const out = buildSiteIconOutput(SETTING);

    expect(out.files.map((file) => file.name)).toEqual(['site.webmanifest']);
    expect(JSON.parse(out.files[0]!.data.toString('utf8'))).toEqual({
      name: 'Sóley Store',
      short_name: 'Sóley',
      icons: [
        { src: ICONS.icon192, sizes: '192x192', type: 'image/png' },
        { src: ICONS.icon512, sizes: '512x512', type: 'image/png' },
        { src: ICONS.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      theme_color: '#ff6600',
      background_color: '#112233',
      display: 'standalone',
      start_url: '/',
    });
  });

  it('tags the media URLs and the same-origin manifest', () => {
    const out = buildSiteIconOutput(SETTING, '/shop');

    expect(out.link).toEqual([
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: ICONS.favicon32 },
      { rel: 'apple-touch-icon', href: ICONS.appleTouch180 },
      { rel: 'manifest', href: '/shop/site.webmanifest' },
    ]);
    expect(out.meta).toEqual([{ name: 'theme-color', content: '#ff6600' }]);
    expect(JSON.parse(out.files[0]!.data.toString('utf8')).start_url).toBe('/shop/');
  });

  it('omits names and the theme colour when there are none', () => {
    const out = buildSiteIconOutput({ ...SETTING, themeColor: null, shortName: null, name: null });

    expect(out.meta).toEqual([]);
    const manifest = JSON.parse(out.files[0]!.data.toString('utf8'));
    expect(manifest).not.toHaveProperty('name');
    expect(manifest).not.toHaveProperty('short_name');
    expect(manifest).not.toHaveProperty('theme_color');
  });
});
