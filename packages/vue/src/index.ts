export { default as RichText } from './rich-text/RichText.vue';
export { default as TextRenderer } from './rich-text/TextRenderer.vue';
export { default as RenderNode } from './rich-text/RenderNode.vue';
export { defaultMarkComponents, defaultNodeComponents } from './rich-text/defaults';

export type {
  MarkComponentProps,
  NodeComponentProps,
  RevealDirectiveValue,
  RichTextDocument,
  RichTextMark,
  RichTextMarkOverrides,
  RichTextNode,
  RichTextNodeOverrides,
  RichTextOverride,
  StyledTagOverride,
} from './rich-text/types';
