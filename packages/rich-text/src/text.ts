import type { RichTextDocument, RichTextNode } from './types';

const blockNodeTypes = new Set([
  'blockquote',
  'bulletList',
  'codeBlock',
  'doc',
  'heading',
  'listItem',
  'orderedList',
  'paragraph',
  'table',
  'tableCell',
  'tableHeader',
  'tableRow',
]);

export interface TextRendererOptions {
  wordCount?: number;
  ellipsis?: string;
}

export interface TextRendererResult {
  text: string;
  truncated: boolean;
}

export function normalizeTipTapText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function appendNodeText(node: RichTextNode, parts: string[]) {
  if (node.type === 'text') {
    if (typeof node.text === 'string') {
      parts.push(node.text);
    }

    return;
  }

  if (node.type === 'hardBreak') {
    parts.push(' ');
    return;
  }

  const childPartsLength = parts.length;

  for (const child of node.content ?? []) {
    appendNodeText(child, parts);
  }

  if (parts.length > childPartsLength && node.type && blockNodeTypes.has(node.type)) {
    parts.push(' ');
  }
}

export function extractTipTapText(content: RichTextDocument | null | undefined) {
  if (!content) {
    return '';
  }

  const parts: string[] = [];
  appendNodeText(content, parts);

  return normalizeTipTapText(parts.join(''));
}

export function truncateTipTapText(
  text: string,
  wordCount: number | null | undefined,
  ellipsis = '...'
): TextRendererResult {
  const normalizedText = normalizeTipTapText(text);

  if (wordCount == null || !Number.isFinite(wordCount) || wordCount < 0) {
    return {
      text: normalizedText,
      truncated: false,
    };
  }

  const words = normalizedText.match(/\S+/g) ?? [];
  const maxWords = Math.floor(wordCount);

  if (words.length <= maxWords) {
    return {
      text: normalizedText,
      truncated: false,
    };
  }

  return {
    text: `${words.slice(0, maxWords).join(' ')}${ellipsis}`.trim(),
    truncated: true,
  };
}

export function renderTipTapText(
  content: RichTextDocument | null | undefined,
  options: TextRendererOptions = {}
): TextRendererResult {
  return truncateTipTapText(extractTipTapText(content), options.wordCount, options.ellipsis);
}
