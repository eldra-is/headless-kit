import { isTrustedEmbedSource } from './embed';
import { isStringTag, isStyledOverride, type StyledTagOverride } from './overrides';
import type { RichTextDocument, RichTextMark, RichTextNode } from './types';
import { safeCssColor, safeHref, safeImageSrc } from './url';

export interface HtmlRenderContext {
  render: (node: RichTextNode) => string;
  escape: (text: string) => string;
  element: typeof element;
}

export type HtmlNodeRenderer = (
  node: RichTextNode,
  children: string,
  context: HtmlRenderContext
) => string;

export type HtmlMarkRenderer = (
  mark: RichTextMark,
  children: string,
  context: HtmlRenderContext
) => string;

export type HtmlOverride<TRenderer> = string | StyledTagOverride | TRenderer | null;

export interface ToHtmlOptions {
  nodes?: Partial<Record<string, HtmlOverride<HtmlNodeRenderer>>>;
  marks?: Partial<Record<string, HtmlOverride<HtmlMarkRenderer>>>;
}

type Attributes = Record<string, string | number | boolean | null | undefined>;
type Extra = Pick<StyledTagOverride, 'class' | 'style'>;
type DefaultNodeRenderer = (
  node: RichTextNode,
  children: string,
  context: HtmlRenderContext,
  extra: Extra
) => string;
type DefaultMarkRenderer = (
  mark: RichTextMark,
  children: string,
  context: HtmlRenderContext,
  extra: Extra
) => string;

const VOID_TAGS = new Set(['br', 'hr', 'img', 'iframe-placeholder']);

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function classString(value: StyledTagOverride['class']): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).join(' ') || undefined;
  const names = Object.entries(value)
    .filter(([, on]) => on)
    .map(([name]) => name);
  return names.length > 0 ? names.join(' ') : undefined;
}

function styleString(value: StyledTagOverride['style']): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  const declarations = Object.entries(value).map(([property, propertyValue]) => {
    const name = property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
    return `${name}: ${propertyValue}`;
  });
  return declarations.length > 0 ? `${declarations.join('; ')};` : undefined;
}

function joinStyles(...values: Array<string | undefined>): string | undefined {
  const parts = values.filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function element(tag: string, attributes: Attributes, children = '', extra?: Extra): string {
  const merged: Attributes = { ...attributes };
  const extraClass = classString(extra?.class);
  const extraStyle = styleString(extra?.style);
  if (extraClass) merged.class = [merged.class, extraClass].filter(Boolean).join(' ');
  if (extraStyle) merged.style = joinStyles(merged.style as string | undefined, extraStyle);

  let html = `<${tag}`;
  for (const [name, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === false) continue;
    html += value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
  }
  if (VOID_TAGS.has(tag)) return `${html}>`;
  return `${html}>${children}</${tag}>`;
}

const wrap =
  (tag: string): DefaultNodeRenderer =>
  (_node, children, _context, extra) =>
    element(tag, {}, children, extra);

const wrapMark =
  (tag: string): DefaultMarkRenderer =>
  (_mark, children, _context, extra) =>
    element(tag, {}, children, extra);

const isHeaderRow = (row: RichTextNode) =>
  row.type === 'tableRow' &&
  Array.isArray(row.content) &&
  row.content.length > 0 &&
  row.content.every((cell) => cell.type === 'tableHeader');

const MIN_EMBED_HEIGHT = 120;

const renderEmbed: DefaultNodeRenderer = (node, _children, _context, extra) => {
  const attrs = node.attrs ?? {};
  const source = isTrustedEmbedSource(attrs.src) ? attrs.src : undefined;
  if (!source) return '';

  const provider = typeof attrs.provider === 'string' ? attrs.provider : undefined;
  const title = typeof attrs.title === 'string' && attrs.title ? attrs.title : 'Embedded content';

  if (attrs.render === 'script') {
    const link = element(
      'a',
      { href: source, rel: 'noopener noreferrer', target: '_blank' },
      escapeHtml(title)
    );
    return element('div', { 'data-embed': true, 'data-embed-provider': provider }, link, extra);
  }

  const height = Math.max(MIN_EMBED_HEIGHT, Number(attrs.height) || 360);
  const width = attrs.width === '100%' ? '100%' : `${Number(attrs.width) || 640}px`;
  const iframe = element(
    'iframe',
    {
      src: source,
      width: attrs.width || undefined,
      height: attrs.height || undefined,
      style: `display: block; width: 100%; height: ${height}px; border: 0;`,
      allow: typeof attrs.allow === 'string' ? attrs.allow : undefined,
      title,
      loading: 'lazy',
      referrerpolicy: 'strict-origin-when-cross-origin',
    },
    ''
  );
  return element(
    'div',
    {
      'data-embed': true,
      'data-embed-provider': provider,
      style: `width: ${width}; max-width: 100%; height: ${height}px; overflow: hidden;`,
    },
    iframe,
    extra
  );
};

const defaultNodes: Record<string, DefaultNodeRenderer> = {
  paragraph: wrap('p'),
  heading: (node, children, _context, extra) => {
    const raw = Number(node.attrs?.level);
    const level = Number.isInteger(raw) && raw >= 1 && raw <= 6 ? raw : 2;
    return element(`h${level}`, {}, children, extra);
  },
  blockquote: wrap('blockquote'),
  bulletList: wrap('ul'),
  orderedList: (node, children, _context, extra) =>
    element(
      'ol',
      { start: typeof node.attrs?.start === 'number' ? node.attrs.start : undefined },
      children,
      extra
    ),
  listItem: wrap('li'),
  horizontalRule: (_node, _children, _context, extra) => element('hr', {}, '', extra),
  hardBreak: () => '<br>',
  codeBlock: (node, children, _context, extra) => {
    const language = node.attrs?.language;
    const code = element(
      'code',
      { class: typeof language === 'string' && language ? `language-${language}` : undefined },
      children
    );
    return element('pre', {}, code, extra);
  },
  table: (node, _children, context, extra) => {
    const rows = node.content ?? [];
    let headerCount = 0;
    for (const row of rows) {
      if (!isHeaderRow(row)) break;
      headerCount += 1;
    }
    const head = rows.slice(0, headerCount).map(context.render).join('');
    const body = rows.slice(headerCount).map(context.render).join('');
    const sections =
      (head ? element('thead', {}, head) : '') + (body ? element('tbody', {}, body) : '');
    return element('table', {}, sections, extra);
  },
  tableRow: wrap('tr'),
  tableHeader: wrap('th'),
  tableCell: wrap('td'),
  image: (node, _children, _context, extra) => {
    const attrs = node.attrs ?? {};
    const src = safeImageSrc(attrs.src);
    if (!src) return '';
    return element(
      'img',
      {
        src,
        alt: typeof attrs.alt === 'string' ? attrs.alt : '',
        title: typeof attrs.title === 'string' && attrs.title ? attrs.title : undefined,
        'data-asset-id': attrs.assetId || undefined,
        loading: 'lazy',
        decoding: 'async',
      },
      '',
      extra
    );
  },
  embed: renderEmbed,
};

const defaultMarks: Record<string, DefaultMarkRenderer> = {
  bold: wrapMark('strong'),
  italic: wrapMark('em'),
  strike: wrapMark('s'),
  underline: wrapMark('u'),
  code: wrapMark('code'),
  highlight: wrapMark('mark'),
  textStyle: (mark, children, _context, extra) => {
    const color = safeCssColor(mark.attrs?.color);
    if (!color && !extra.class && !extra.style) return children;
    return element('span', { style: color ? `color: ${color};` : undefined }, children, extra);
  },
  link: (mark, children, _context, extra) => {
    const attrs = mark.attrs ?? {};
    const href = safeHref(attrs.href);
    const external = typeof href === 'string' && /^https?:\/\//i.test(href);
    const rel =
      typeof attrs.rel === 'string' ? attrs.rel : external ? 'noopener noreferrer' : undefined;
    return element(
      'a',
      { href, rel, target: typeof attrs.target === 'string' ? attrs.target : undefined },
      children,
      extra
    );
  },
};

function renderWithOverride<TRenderer extends (...args: any[]) => string>(
  override: HtmlOverride<TRenderer> | undefined,
  fallback: ((extra: Extra) => string) | null,
  children: string,
  custom: (renderer: TRenderer) => string
): string {
  if (override === undefined) return fallback ? fallback({}) : children;
  if (override === null) return children;
  if (isStringTag(override)) return element(override, {}, children);
  if (isStyledOverride(override)) {
    const extra = { class: override.class, style: override.style };
    if (override.tag) return element(override.tag, {}, children, extra);
    return fallback ? fallback(extra) : element('span', {}, children, extra);
  }
  return custom(override as TRenderer);
}

// Serialises a stored document to an HTML string. Text and every attribute value are escaped;
// link and image URLs are limited to safe schemes; an embed renders only from a source the
// editor's normaliser could have produced. Nothing in the document reaches the output verbatim.
export function toHtml(
  content: RichTextDocument | null | undefined,
  options: ToHtmlOptions = {}
): string {
  if (!content) return '';
  const nodes = options.nodes ?? {};
  const marks = options.marks ?? {};

  const context: HtmlRenderContext = {
    render: (node) => renderNode(node),
    escape: escapeHtml,
    element,
  };

  function renderMarks(markList: RichTextMark[], text: string): string {
    return markList.reduceRight((inner, mark) => {
      const fallback = defaultMarks[mark.type];
      return renderWithOverride(
        marks[mark.type],
        (extra) => (fallback ?? wrapMark('span'))(mark, inner, context, extra),
        inner,
        (renderer) => renderer(mark, inner, context)
      );
    }, text);
  }

  function renderNode(node: RichTextNode): string {
    if (node.type === 'text') {
      return renderMarks(node.marks ?? [], escapeHtml(node.text ?? ''));
    }
    if (node.type === 'doc' || !node.type) {
      return (node.content ?? []).map(renderNode).join('');
    }

    const fallback = defaultNodes[node.type];
    const children = () => (node.content ?? []).map(renderNode).join('');
    const override = nodes[node.type];

    if (override === undefined && !fallback) return children();
    return renderWithOverride(
      override,
      fallback ? (extra) => fallback(node, children(), context, extra) : null,
      children(),
      (renderer) => renderer(node, children(), context)
    );
  }

  return renderNode(content);
}
