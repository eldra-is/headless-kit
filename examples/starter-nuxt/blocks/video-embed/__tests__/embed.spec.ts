import { describe, expect, it } from 'vitest';
import { resolveVideoEmbed } from '../embed';

describe('resolveVideoEmbed', () => {
  it('rewrites a youtube.com/watch url to the nocookie embed host, with autoplay added', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/watch?v=northwind-latte-mug')).toEqual({
      kind: 'youtube',
      src: 'https://www.youtube-nocookie.com/embed/northwind-latte-mug?autoplay=1',
    });
  });

  it('resolves a youtu.be short link the same way', () => {
    expect(resolveVideoEmbed('https://youtu.be/northwind-latte-mug')).toEqual({
      kind: 'youtube',
      src: 'https://www.youtube-nocookie.com/embed/northwind-latte-mug?autoplay=1',
    });
  });

  it('resolves an already-embed youtube url, still adding autoplay only now', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/embed/northwind-latte-mug')).toEqual({
      kind: 'youtube',
      src: 'https://www.youtube-nocookie.com/embed/northwind-latte-mug?autoplay=1',
    });
  });

  it('keeps extra query params off a watch url from leaking into the id', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/watch?v=northwind-latte-mug&t=10s')).toEqual({
      kind: 'youtube',
      src: 'https://www.youtube-nocookie.com/embed/northwind-latte-mug?autoplay=1',
    });
  });

  it('rewrites a vimeo.com url to the player host, with autoplay added', () => {
    expect(resolveVideoEmbed('https://vimeo.com/76979871')).toEqual({
      kind: 'vimeo',
      src: 'https://player.vimeo.com/video/76979871?autoplay=1',
    });
  });

  it('resolves an mp4 url to the video kind, unchanged', () => {
    const url = 'https://cdn.northwindgoods.example/videos/latte-mug.mp4';
    expect(resolveVideoEmbed(url)).toEqual({ kind: 'mp4', src: url });
  });

  it('resolves an mp4 url with a query string', () => {
    const url = 'https://cdn.northwindgoods.example/videos/latte-mug.mp4?token=abc';
    expect(resolveVideoEmbed(url)).toEqual({ kind: 'mp4', src: url });
  });

  it('returns null for an unsupported host', () => {
    expect(resolveVideoEmbed('https://example.com/watch?v=abc')).toBeNull();
  });

  it('returns null for a youtube watch url with no id', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/watch')).toBeNull();
  });

  it('returns null for a vimeo url with no numeric id', () => {
    expect(resolveVideoEmbed('https://vimeo.com/')).toBeNull();
  });

  it('returns null for a malformed url', () => {
    expect(resolveVideoEmbed('not a url')).toBeNull();
  });

  it('returns null for a non-http(s) protocol, as defence in depth beyond safeHref', () => {
    expect(resolveVideoEmbed('javascript:alert(1)')).toBeNull();
  });
});
