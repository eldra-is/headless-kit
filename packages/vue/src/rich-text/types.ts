import type { Component } from 'vue';
import type {
  RichTextMark,
  RichTextNode,
  RichTextOverride as CoreOverride,
} from '@eldrajs/rich-text';

export type {
  RichTextDocument,
  RichTextMark,
  RichTextNode,
  StyledTagOverride,
} from '@eldrajs/rich-text';

export interface NodeComponentProps {
  node: RichTextNode;
  attrs: Record<string, any>;
}

export interface MarkComponentProps {
  mark: RichTextMark;
  attrs: Record<string, any>;
}

export type RichTextOverride = CoreOverride<Component>;
export type RichTextNodeOverrides = Partial<Record<string, RichTextOverride>>;
export type RichTextMarkOverrides = Partial<Record<string, RichTextOverride>>;

// The value handed to a `reveal` directive the host app may have registered. The renderer never
// interprets it; `false` means no reveal.
export type RevealDirectiveValue = Record<string, unknown> | string | boolean | undefined;
