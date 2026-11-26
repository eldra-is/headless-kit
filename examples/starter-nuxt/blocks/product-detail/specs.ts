/**
 * **A tab body that is a list of facts, read as label/value pairs.**
 *
 * The design draws the Details row as a two-column definition list (Capacity · 350 ml, Material ·
 * Stoneware). The tab's body is rich text, and a merchant writes facts in it the way they would in
 * any editor: a bullet list, each item starting with its label in bold — "**Material** Stoneware",
 * or "**Material:** Stoneware". When the whole body is exactly that, this answers the pairs and the
 * block draws them as `<dl>`; anything else (a paragraph, a list item without a bold label, a link
 * in the value, a second list) answers `null` and the body renders as the rich text it is, so no
 * merchant content is ever dropped or reshaped into something it was not.
 *
 * Content, not a field: the tab schema is unchanged, so no stored tab needs migrating.
 */
/** The slice of the stored ProseMirror JSON this reads. */
interface RichTextNode {
  type?: string;
  text?: string;
  marks?: Array<{ type: string }>;
  content?: RichTextNode[];
}

export interface TabSpec {
  label: string;
  value: string;
}

function isBold(node: RichTextNode): boolean {
  return (node.marks ?? []).some((mark) => mark.type === 'bold');
}

/** Plain text only: a link (or any node that is not text) in the value cannot survive a `<dd>`. */
function isPlainText(node: RichTextNode): boolean {
  return node.type === 'text' && (node.marks ?? []).every((mark) => mark.type !== 'link');
}

function specFromItem(item: RichTextNode): TabSpec | null {
  if (item.type !== 'listItem') return null;
  const [paragraph, ...rest] = item.content ?? [];
  if (paragraph === undefined || rest.length > 0 || paragraph.type !== 'paragraph') return null;
  const runs = paragraph.content ?? [];
  if (runs.length === 0 || !runs.every(isPlainText)) return null;

  // The label is the leading bold run (which may be split across nodes by other marks); the value
  // is everything after it.
  let index = 0;
  let label = '';
  while (index < runs.length && isBold(runs[index]!)) {
    label += runs[index]!.text ?? '';
    index += 1;
  }
  const value = runs
    .slice(index)
    .map((run) => run.text ?? '')
    .join('')
    .trim();
  label = label.trim().replace(/:$/, '').trim();
  if (label === '' || value === '') return null;
  return { label, value };
}

export function specsFromBody(body: { content?: unknown[] } | null | undefined): TabSpec[] | null {
  const content = (body?.content ?? []) as RichTextNode[];
  if (content.length !== 1) return null;
  const [list] = content;
  if (list!.type !== 'bulletList') return null;
  const items = list!.content ?? [];
  if (items.length === 0) return null;
  const specs: TabSpec[] = [];
  for (const item of items) {
    const spec = specFromItem(item);
    if (spec === null) return null;
    specs.push(spec);
  }
  return specs;
}
