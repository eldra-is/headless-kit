import { describe, expect, it } from 'vitest';
import { toHtml } from '../html';
import type { RichTextDocument } from '../types';

const doc = (...content: RichTextDocument[]): RichTextDocument => ({ type: 'doc', content });
const text = (value: string, marks?: RichTextDocument['marks']) => ({
  type: 'text',
  text: value,
  marks,
});
const paragraph = (...content: RichTextDocument[]) => ({ type: 'paragraph', content });

describe('toHtml defaults', () => {
  it('renders every default node', () => {
    const html = toHtml(
      doc(
        { type: 'heading', attrs: { level: 3 }, content: [text('Title')] },
        paragraph(text('Body')),
        { type: 'blockquote', content: [paragraph(text('Quote'))] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('a'))] }] },
        {
          type: 'orderedList',
          attrs: { start: 4 },
          content: [{ type: 'listItem', content: [paragraph(text('b'))] }],
        },
        { type: 'horizontalRule' },
        paragraph(text('one'), { type: 'hardBreak' }, text('two')),
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1;')] }
      )
    );

    expect(html).toBe(
      '<h3>Title</h3><p>Body</p><blockquote><p>Quote</p></blockquote><ul><li><p>a</p></li></ul>' +
        '<ol start="4"><li><p>b</p></li></ol><hr><p>one<br>two</p>' +
        '<pre><code class="language-ts">const a = 1;</code></pre>'
    );
  });

  it('clamps heading levels to h1–h6 and defaults to h2', () => {
    expect(toHtml(doc({ type: 'heading', attrs: { level: 9 }, content: [text('x')] }))).toBe(
      '<h2>x</h2>'
    );
    expect(toHtml(doc({ type: 'heading', content: [text('x')] }))).toBe('<h2>x</h2>');
  });

  it('renders every default mark, outermost first', () => {
    const html = toHtml(
      doc(
        paragraph(
          text('b', [{ type: 'bold' }, { type: 'italic' }]),
          text('s', [{ type: 'strike' }]),
          text('u', [{ type: 'underline' }]),
          text('c', [{ type: 'code' }]),
          text('h', [{ type: 'highlight' }]),
          text('t', [{ type: 'textStyle', attrs: { color: '#ff0000' } }]),
          text('n', [{ type: 'textStyle' }])
        )
      )
    );

    expect(html).toBe(
      '<p><strong><em>b</em></strong><s>s</s><u>u</u><code>c</code><mark>h</mark>' +
        '<span style="color: #ff0000;">t</span>n</p>'
    );
  });

  it('splits table rows into thead and tbody', () => {
    const cell = (type: string, value: string) => ({ type, content: [paragraph(text(value))] });
    const html = toHtml(
      doc({
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'Name'), cell('tableHeader', 'Role')] },
          { type: 'tableRow', content: [cell('tableCell', 'Ada'), cell('tableCell', 'Engineer')] },
        ],
      })
    );

    expect(html).toBe(
      '<table><thead><tr><th><p>Name</p></th><th><p>Role</p></th></tr></thead>' +
        '<tbody><tr><td><p>Ada</p></td><td><p>Engineer</p></td></tr></tbody></table>'
    );
  });

  it('renders images with lazy loading and the asset id', () => {
    const html = toHtml(
      doc({
        type: 'image',
        attrs: { src: 'https://cdn.example/a.jpg', alt: 'A', title: 'T', assetId: 'asset-1' },
      })
    );

    expect(html).toBe(
      '<img src="https://cdn.example/a.jpg" alt="A" title="T" data-asset-id="asset-1" loading="lazy" decoding="async">'
    );
  });

  it('renders an iframe embed from a trusted source', () => {
    const html = toHtml(
      doc({
        type: 'embed',
        attrs: {
          provider: 'vimeo',
          render: 'iframe',
          src: 'https://player.vimeo.com/video/76979871',
          width: 640,
          height: 360,
          title: 'Vimeo video',
          allow: 'autoplay; fullscreen',
        },
      })
    );

    expect(html).toContain('<div data-embed data-embed-provider="vimeo"');
    expect(html).toContain('width: 640px; max-width: 100%; height: 360px; overflow: hidden;');
    expect(html).toContain(
      '<iframe src="https://player.vimeo.com/video/76979871" width="640" height="360"'
    );
    expect(html).toContain('allow="autoplay; fullscreen" title="Vimeo video" loading="lazy"');
  });

  it('renders a script embed as a link card, never as a script', () => {
    const html = toHtml(
      doc({
        type: 'embed',
        attrs: {
          provider: 'x',
          render: 'script',
          src: 'https://x.com/Interior/status/463440424141459456',
          title: 'X post',
        },
      })
    );

    expect(html).toBe(
      '<div data-embed data-embed-provider="x"><a href="https://x.com/Interior/status/463440424141459456" rel="noopener noreferrer" target="_blank">X post</a></div>'
    );
    expect(html).not.toContain('<script');
  });

  it('links get noopener on external hrefs and keep an explicit rel', () => {
    const html = toHtml(
      doc(
        paragraph(
          text('ext', [{ type: 'link', attrs: { href: 'https://tiptap.dev', target: '_blank' } }]),
          text('rel', [{ type: 'link', attrs: { href: 'https://a.b', rel: 'me' } }]),
          text('int', [{ type: 'link', attrs: { href: '/about' } }])
        )
      )
    );

    expect(html).toBe(
      '<p><a href="https://tiptap.dev" rel="noopener noreferrer" target="_blank">ext</a>' +
        '<a href="https://a.b" rel="me">rel</a><a href="/about">int</a></p>'
    );
  });

  it('renders unknown nodes as their children and unknown marks as a span', () => {
    const html = toHtml(
      doc({ type: 'productEmbed', content: [paragraph(text('child', [{ type: 'glow' }]))] })
    );

    expect(html).toBe('<p><span>child</span></p>');
  });

  it('returns an empty string for missing content', () => {
    expect(toHtml(null)).toBe('');
    expect(toHtml(undefined)).toBe('');
  });
});

describe('toHtml escaping', () => {
  it('escapes text, so a stored script tag is inert', () => {
    const html = toHtml(doc(paragraph(text('<script>alert(1)</script> & "quotes"'))));

    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;</p>');
  });

  it('escapes attribute values, so a stored alt cannot close the tag', () => {
    const html = toHtml(
      doc({ type: 'image', attrs: { src: '/a.png', alt: '" onerror="alert(1)' } })
    );

    expect(html).toBe(
      '<img src="/a.png" alt="&quot; onerror=&quot;alert(1)" loading="lazy" decoding="async">'
    );
  });

  it('drops javascript: and data: hrefs, including ones hidden with control characters', () => {
    const cases = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      ' javascript:alert(1)',
      'java\nscript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
    ];
    for (const href of cases) {
      const html = toHtml(doc(paragraph(text('x', [{ type: 'link', attrs: { href } }]))));
      expect(html, href).toBe('<p><a>x</a></p>');
    }
  });

  it('keeps http, https, mailto, tel and relative hrefs', () => {
    for (const href of ['https://a.b/', 'http://a.b/', 'mailto:a@b.c', 'tel:+354', '/x', '#y']) {
      const html = toHtml(doc(paragraph(text('x', [{ type: 'link', attrs: { href } }]))));
      expect(html, href).toContain(`href="${href}"`);
    }
  });

  it('drops an image whose src is not http, https, a data image, or relative', () => {
    expect(toHtml(doc({ type: 'image', attrs: { src: 'javascript:alert(1)' } }))).toBe('');
    expect(toHtml(doc({ type: 'image', attrs: { src: 'data:text/html,x' } }))).toBe('');
    expect(toHtml(doc({ type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } }))).toContain(
      'src="data:image/png;base64,AAAA"'
    );
  });

  it('drops an embed whose source the editor could not have produced', () => {
    for (const src of [
      'https://evil.example/embed',
      'http://www.youtube.com/embed/abc',
      'javascript:alert(1)',
    ]) {
      const html = toHtml(
        doc({ type: 'embed', attrs: { provider: 'youtube', render: 'iframe', src } })
      );
      expect(html, src).toBe('');
    }
  });

  it('accepts only a colour value in textStyle, never a second declaration', () => {
    const html = toHtml(
      doc(
        paragraph(
          text('a', [
            { type: 'textStyle', attrs: { color: 'red; background: url(javascript:alert(1))' } },
          ]),
          text('b', [{ type: 'textStyle', attrs: { color: 'rgb(1, 2, 3)' } }])
        )
      )
    );

    expect(html).toBe('<p>a<span style="color: rgb(1, 2, 3);">b</span></p>');
  });
});

describe('toHtml overrides', () => {
  const content = doc(paragraph(text('Hello ', undefined), text('world', [{ type: 'bold' }])));

  it('renders a string override as that tag', () => {
    expect(toHtml(content, { nodes: { paragraph: 'div' }, marks: { bold: 'b' } })).toBe(
      '<div>Hello <b>world</b></div>'
    );
  });

  it('renders a styled override on the default tag, or on the given one', () => {
    expect(
      toHtml(content, {
        nodes: { paragraph: { class: ['lead', 'x'], style: { marginTop: 0 } } },
        marks: { bold: { tag: 'span', class: { strong: true, off: false } } },
      })
    ).toBe('<p class="lead x" style="margin-top: 0;">Hello <span class="strong">world</span></p>');
  });

  it('renders children only for a null override', () => {
    expect(toHtml(content, { nodes: { paragraph: null }, marks: { bold: null } })).toBe(
      'Hello world'
    );
  });

  it('calls a function override with the node, its rendered children and the context', () => {
    const html = toHtml(content, {
      nodes: {
        paragraph: (node, children, context) =>
          context.element('section', { 'data-type': node.type }, children),
      },
      marks: {
        bold: (mark, children) => `[${mark.type}:${children}]`,
      },
    });

    expect(html).toBe('<section data-type="paragraph">Hello [bold:world]</section>');
  });

  it('escapes what a function override receives, so an override cannot un-escape by accident', () => {
    const html = toHtml(doc(paragraph(text('<b>'))), {
      nodes: { paragraph: (_node, children) => children },
    });

    expect(html).toBe('&lt;b&gt;');
  });

  it('gives an unknown node an override too', () => {
    const html = toHtml(doc({ type: 'callout', content: [paragraph(text('x'))] }), {
      nodes: { callout: { tag: 'aside', class: 'callout' } },
    });

    expect(html).toBe('<aside class="callout"><p>x</p></aside>');
  });
});
