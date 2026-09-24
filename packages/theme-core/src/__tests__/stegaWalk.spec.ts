import { afterEach, describe, expect, it } from 'vitest';
import { registerBlockFields } from '../blockFields';
import { decodeStega } from '../stega';
import { encodeEntryDataStega, projectEntryDataLocale } from '../stegaWalk';

afterEach(() => {
  registerBlockFields({});
});

// Registered fields for the 'cta' schema shared by the select-gating tests
// below: a top-level select ('variant'), a select nested inside a list's
// composite item ('items.*.variant'), and a composite field whose
// sub-fields are literally named 'value'/'label' ('metric') — the same
// shape a real select produces, but not a select.
const CTA_FIELDS = {
  cta: [
    { fieldId: 'variant', type: 'select' },
    { fieldId: 'heading', type: 'string' },
    {
      fieldId: 'items',
      type: 'list',
      metadata: {
        item: {
          type: 'composite',
          metadata: {
            fields: [
              { fieldId: 'title', type: 'string' },
              { fieldId: 'variant', type: 'select' },
            ],
          },
        },
      },
    },
    {
      fieldId: 'metric',
      type: 'composite',
      metadata: {
        fields: [
          { fieldId: 'value', type: 'string' },
          { fieldId: 'label', type: 'string' },
        ],
      },
    },
  ],
};

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

  it('unwraps a resolved select field ({value,label}) into its plain value, top-level and nested in a list item', () => {
    // Same public-read shape as client.ts's projectLocalizedValue guards
    // against: web-studio-core's resolveSelectLabels wraps a select field's
    // stored string as {value,label}. The live-editing draft this function
    // projects must not leave that wrapper in place, or a variant switch
    // never matches a Block.vue's plain-string comparison while editing.
    // Gated on the registered field type, not the shape alone — see the
    // "does not unwrap" tests below.
    registerBlockFields(CTA_FIELDS);
    const withVariant = {
      heading: 'CTA',
      variant: { value: 'subtle', label: 'Subtle' },
      items: [{ title: 'A', variant: { value: 'plain', label: 'Plain' } }],
      link: { href: '/news', label: 'Go' },
    };

    const projected = projectEntryDataLocale(withVariant, 'en-US', 'cta');

    expect(projected.variant).toBe('subtle');
    expect((projected.items as Array<{ variant: string }>)[0]!.variant).toBe('plain');
    // {href,label} has no "value" key, so it is an ordinary composite, not a
    // select wrapper, and must survive unchanged.
    expect(projected.link).toEqual({ href: '/news', label: 'Go' });
  });

  it("re-derives apiId from a nested resolved entry doc, unwrapping the block's own select field even though the outer entry (a page) has none registered", () => {
    // Reproduces the shape a page fetch embeds its blocks[] in: the outer
    // entry is a "page" (never registered as a block), but each item in
    // `blocks` is itself an entry doc with its own schemaApiId. Without the
    // apiId re-derivation, threading the page's apiId straight through
    // leaves every nested block's variant permanently un-unwrapped — the
    // "non-block entry" case above, but for every block a page renders.
    registerBlockFields(CTA_FIELDS);
    const page = {
      title: 'Home',
      blocks: [
        {
          id: 'block-1',
          schemaApiId: 'cta',
          data: { heading: 'Sale', variant: { value: 'split', label: 'Split' } },
        },
      ],
    };

    // No apiId passed for the page itself — only the nested block declares one.
    const projected = projectEntryDataLocale(page, 'en-US');

    const block = (projected.blocks as Array<{ data: { variant: string; heading: string } }>)[0]!;
    expect(block.data.variant).toBe('split');
    expect(block.data.heading).toBe('Sale');
  });

  it('leaves a composite field whose sub-fields are literally "value"/"label" untouched, even though the registry has a real select elsewhere', () => {
    // Same two-string-key shape resolveSelectLabels produces for a real
    // select, but 'metric' is registered as type "composite", not "select" —
    // the unwrap must be gated on the registered type, not the key names.
    registerBlockFields(CTA_FIELDS);
    const projected = projectEntryDataLocale(
      { metric: { value: '42', label: 'Active users' } },
      'en-US',
      'cta'
    );
    expect(projected.metric).toEqual({ value: '42', label: 'Active users' });
  });

  it('does not unwrap a {value,label} shape when the schema has no registered block fields at all (e.g. a non-block entry such as a page)', () => {
    // No registerBlockFields call for this schema: the block-fields registry
    // simply has no entry for it (pages, and any other non-block schema,
    // are never registered). Absence of a registration must never be read
    // as permission to unwrap.
    const projected = projectEntryDataLocale(
      { variant: { value: 'subtle', label: 'Subtle' } },
      'en-US',
      'page'
    );
    expect(projected.variant).toEqual({ value: 'subtle', label: 'Subtle' });
  });

  it('does not unwrap a {value,label} shape when no apiId is passed at all', () => {
    const projected = projectEntryDataLocale(
      { variant: { value: 'subtle', label: 'Subtle' } },
      'en-US'
    );
    expect(projected.variant).toEqual({ value: 'subtle', label: 'Subtle' });
  });

  it('leaves a top-level select field value byte-for-byte, not stega-encoded', () => {
    // A Block.vue compares a select field's value (e.g. "variant") with
    // === against literal option strings. Stega's invisible tracking
    // characters, appended to every other string leaf so the preview
    // overlay can map rendered DOM text back to its field, break that
    // comparison silently and permanently if applied here too.
    registerBlockFields({ cta: [{ fieldId: 'variant', type: 'select' }] });
    const encoded = encodeEntryDataStega(
      'block-1',
      { heading: 'Sale', variant: 'split' },
      'en-US',
      'cta'
    );
    expect(encoded.variant).toBe('split'); // exact match: no stega suffix at all
    expect(decodeStega(encoded.heading as string).meta?.fieldPath).toBe('heading');
  });

  it('re-derives apiId from a nested resolved entry doc to protect its own select fields', () => {
    registerBlockFields({ cta: [{ fieldId: 'variant', type: 'select' }] });
    const page = {
      title: 'Home',
      blocks: [
        {
          id: 'block-1',
          schemaApiId: 'cta',
          data: { heading: 'Sale', variant: 'split' },
        },
      ],
    };
    // No apiId passed for the page itself — only the nested block declares one.
    const encoded = encodeEntryDataStega('page-1', page, 'en-US');
    const block = (encoded.blocks as Array<{ data: { variant: string; heading: string } }>)[0]!;
    expect(block.data.variant).toBe('split');
    expect(decodeStega(block.data.heading).meta?.fieldPath).toBe('heading');
  });

  it('still stega-encodes a select-named field when the registry does not mark it select', () => {
    // Without a registration (or a mismatched type), the old behavior holds:
    // nothing is silently exempted just because a field is named "variant".
    const encoded = encodeEntryDataStega('block-1', { variant: 'split' }, 'en-US', 'cta');
    expect(decodeStega(encoded.variant as string).cleaned).toBe('split');
  });

  it('leaves a select field nested inside a list item byte-for-byte, not stega-encoded (residual gap closed)', () => {
    // Core's resolveSelectLabels never wraps a nested-list select today
    // (it only ever recurses a schema's own top-level Fields), so this is
    // a forward guard: the day a block declares one, editing it must not
    // silently break the block's own ===-comparison the same way a
    // top-level select field would.
    registerBlockFields(CTA_FIELDS);
    const encoded = encodeEntryDataStega(
      'block-1',
      { items: [{ title: 'A', variant: 'split' }] },
      'en-US',
      'cta'
    );
    const item = (encoded.items as Array<{ title: string; variant: string }>)[0]!;
    expect(item.variant).toBe('split'); // exact match: no stega suffix at all
    expect(decodeStega(item.title).meta?.fieldPath).toBe('items.0.title');
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
