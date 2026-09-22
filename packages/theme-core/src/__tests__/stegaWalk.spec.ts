import { describe, expect, it } from 'vitest';
import { decodeStega } from '../stega';
import { encodeEntryDataStega, projectEntryDataLocale } from '../stegaWalk';

describe('localized preview draft projection', () => {
  const draft = {
    title: { 'en-US': 'Announcement', 'is-IS': 'Tilkynning' },
    cta: {
      'en-US': { label: 'Read more', href: '/news' },
      'is-IS': { label: 'Lesa meira', href: '/frettir' },
    },
    images: [
      {
        src: '/one.jpg',
        caption: { 'en-US': 'One', 'is-IS': 'Eitt' },
      },
    ],
  };

  it('projects scalar, composite, and nested list localization without mutating the draft', () => {
    const projected = projectEntryDataLocale(draft, 'en-US');

    expect(projected).toEqual({
      title: 'Announcement',
      cta: { label: 'Read more', href: '/news' },
      images: [{ src: '/one.jpg', caption: 'One' }],
    });
    expect(draft.title).toEqual({ 'en-US': 'Announcement', 'is-IS': 'Tilkynning' });
    expect(projectEntryDataLocale(draft, 'is-IS')).toMatchObject({
      title: 'Tilkynning',
      cta: { label: 'Lesa meira' },
      images: [{ caption: 'Eitt' }],
    });
  });

  it('stega-encodes projected leaves with persistence-compatible paths and locale metadata', () => {
    const encoded = encodeEntryDataStega(
      'block-1',
      projectEntryDataLocale(draft, 'en-US'),
      'en-US'
    );

    expect(decodeStega(encoded.title as string)).toMatchObject({
      cleaned: 'Announcement',
      meta: { entryId: 'block-1', fieldPath: 'title', locale: 'en-US' },
    });
    const caption = (encoded.images as Array<{ caption: string }>)[0]!.caption;
    expect(decodeStega(caption).meta).toMatchObject({
      fieldPath: 'images.0.caption',
      locale: 'en-US',
    });
  });

  it('keeps non-localized layout structure free of stega metadata', () => {
    const layout = {
      version: 1,
      root: {
        id: 'root-layout',
        type: 'flex',
        children: [
          {
            id: 'hero-placement',
            type: 'block',
            entryId: '11111111-1111-4111-8111-111111111111',
          },
        ],
        layout: { direction: { normal: 'column' }, gap: { normal: '16px' } },
      },
    };

    const encoded = encodeEntryDataStega('page-1', { title: 'Home', layout }, 'en-US');

    expect(encoded.layout).toBe(layout);
    expect(decodeStega(encoded.title as string).meta?.fieldPath).toBe('title');
  });

  it('keeps ordered Core entry-reference mirrors free of stega metadata', () => {
    const reference = {
      position: 0,
      type: 'entry' as const,
      value: '11111111-1111-4111-8111-111111111111',
    };

    const encoded = encodeEntryDataStega('page-1', { blocks: [reference] }, 'en-US');

    expect(encoded.blocks).toEqual([reference]);
    expect(decodeStega((encoded.blocks as Array<typeof reference>)[0]!.value).meta).toBeNull();
  });

  it('keeps hydrated single and multiple media metadata free of stega', () => {
    const cover = {
      assetId: '411ed16c-acd9-449c-84a0-37aa4c0f68a5',
      url: 'https://media.example/assets/411ed16c-acd9-449c-84a0-37aa4c0f68a5',
      fileName: 'cover.jpg',
      contentType: 'image/jpeg',
      altText: { 'en-US': 'Cover' },
      isDefault: false,
    };

    const encoded = encodeEntryDataStega(
      'block-1',
      { title: 'Article', coverImage: cover, gallery: [cover] },
      'en-US'
    );

    expect(encoded.coverImage).toEqual(cover);
    expect(encoded.gallery).toEqual([cover]);
    expect(decodeStega((encoded.coverImage as typeof cover).url).meta).toBeNull();
    expect(decodeStega(encoded.title as string).meta?.fieldPath).toBe('title');
  });

  it('preserves rich-text structure while encoding only visible text leaves', () => {
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'left' },
          content: [
            {
              type: 'text',
              text: 'Draft body',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
            { type: 'hardBreak' },
          ],
        },
      ],
    };

    const encoded = encodeEntryDataStega(
      'block-1',
      projectEntryDataLocale({ body: { 'en-US': body } }, 'en-US'),
      'en-US'
    );
    const richText = encoded.body as typeof body;
    const textNode = richText.content[0]!.content[0]!;

    expect(richText.type).toBe('doc');
    expect(richText.content[0]!.type).toBe('paragraph');
    expect(richText.content[0]!.content[1]!.type).toBe('hardBreak');
    expect(textNode.marks).toEqual([{ type: 'link', attrs: { href: 'https://example.com' } }]);
    expect(decodeStega(textNode.text!).cleaned).toBe('Draft body');
    expect(decodeStega(textNode.text!).meta).toMatchObject({
      entryId: 'block-1',
      fieldPath: 'body.content.0.content.0.text',
      locale: 'en-US',
    });
    expect(body.content[0]!.content[0]!.text).toBe('Draft body');
  });
});
