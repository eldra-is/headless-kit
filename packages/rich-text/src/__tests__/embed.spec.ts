import { describe, expect, it } from 'vitest';
import { extractSupportedEmbedUrl, isTrustedEmbedSource, normalizeEmbedInput } from '../embed';

describe('normalizeEmbedInput', () => {
  it('normalises the common YouTube forms to the embed URL', () => {
    for (const input of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(normalizeEmbedInput(input), input).toMatchObject({
        provider: 'youtube',
        render: 'iframe',
        src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        width: 640,
        height: 360,
        title: 'YouTube video',
      });
    }
  });

  it('keeps a start time and the nocookie host', () => {
    expect(normalizeEmbedInput('https://www.youtube-nocookie.com/watch?v=abc&t=42')?.src).toBe(
      'https://www.youtube-nocookie.com/embed/abc?start=42'
    );
  });

  it('reads dimensions, title and allow from a pasted iframe snippet', () => {
    const normalized = normalizeEmbedInput(
      '<iframe width="300" height="200" src="https://player.vimeo.com/video/76979871" title="My film" allow="autoplay"></iframe>'
    );

    expect(normalized).toMatchObject({
      provider: 'vimeo',
      src: 'https://player.vimeo.com/video/76979871',
      width: 300,
      height: 200,
      title: 'My film',
      allow: 'autoplay',
    });
  });

  it('gives a Spotify track its own compact height', () => {
    expect(
      normalizeEmbedInput('https://open.spotify.com/track/7yNK27ZTpHew0c55VvIJgm')
    ).toMatchObject({ provider: 'spotify', variant: 'track', width: '100%', height: 152 });
  });

  it('marks providers that need their own script as script embeds', () => {
    expect(normalizeEmbedInput('https://x.com/Interior/status/463440424141459456')).toMatchObject({
      provider: 'x',
      render: 'script',
      src: 'https://x.com/Interior/status/463440424141459456',
    });
    expect(normalizeEmbedInput('https://www.instagram.com/p/abc123/')).toMatchObject({
      provider: 'instagram',
      render: 'script',
    });
  });

  it('returns null for an unsupported or empty input', () => {
    expect(normalizeEmbedInput('https://example.com/video')).toBeNull();
    expect(normalizeEmbedInput('   ')).toBeNull();
    expect(normalizeEmbedInput('not a url at all')).toBeNull();
  });

  it('finds the first supported URL inside surrounding text', () => {
    expect(extractSupportedEmbedUrl('watch this https://youtu.be/abc and this')).toBe(
      'https://youtu.be/abc'
    );
    expect(extractSupportedEmbedUrl('nothing here')).toBeNull();
  });
});

describe('isTrustedEmbedSource', () => {
  it('accepts every host the normalisers emit, over https only', () => {
    expect(isTrustedEmbedSource('https://www.youtube.com/embed/abc')).toBe(true);
    expect(isTrustedEmbedSource('https://embed.reddit.com/r/x')).toBe(true);
    expect(isTrustedEmbedSource('http://www.youtube.com/embed/abc')).toBe(false);
  });

  it('refuses anything else', () => {
    expect(isTrustedEmbedSource('https://evil.example/youtube.com')).toBe(false);
    expect(isTrustedEmbedSource('https://youtube.com.evil.example/')).toBe(false);
    expect(isTrustedEmbedSource('javascript:alert(1)')).toBe(false);
    expect(isTrustedEmbedSource(undefined)).toBe(false);
    expect(isTrustedEmbedSource('')).toBe(false);
  });
});
