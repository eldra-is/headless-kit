// The ProseMirror JSON shape TipTap stores and the CMS delivers. Declared here so no consumer
// needs TipTap or Vue installed to typecheck.
export interface RichTextMark {
  type: string;
  attrs?: Record<string, any>;
  [key: string]: any;
}

export interface RichTextNode {
  type?: string;
  attrs?: Record<string, any>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
  [key: string]: any;
}

export type RichTextDocument = RichTextNode;
