export type { RichTextDocument, RichTextMark, RichTextNode } from './types';

export {
  extractTipTapText,
  normalizeTipTapText,
  renderTipTapText,
  truncateTipTapText,
} from './text';
export type { TextRendererOptions, TextRendererResult } from './text';

export { escapeHtml, element, toHtml } from './html';
export type {
  HtmlMarkRenderer,
  HtmlNodeRenderer,
  HtmlOverride,
  HtmlRenderContext,
  ToHtmlOptions,
} from './html';

export { isStringTag, isStyledOverride, resolveOverride } from './overrides';
export type { ResolvedOverride, RichTextOverride, StyledTagOverride } from './overrides';

export { safeCssColor, safeHref, safeImageSrc } from './url';

export {
  EMBED_SOURCE_HOSTS,
  SUPPORTED_EMBED_URL_REGEX_GLOBAL,
  extractSupportedEmbedUrl,
  isTrustedEmbedSource,
  normalizeEmbedInput,
} from './embed';
export type {
  EmbedRenderMode,
  EmbedWidth,
  NormalizedEmbedAttributes,
  SupportedEmbedProvider,
} from './embed';
