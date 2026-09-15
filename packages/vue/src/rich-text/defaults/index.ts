import type { RichTextMarkOverrides, RichTextNodeOverrides } from '../types';

import Paragraph from './nodes/Paragraph.vue';
import Heading from './nodes/Heading.vue';
import Blockquote from './nodes/Blockquote.vue';
import BulletList from './nodes/BulletList.vue';
import OrderedList from './nodes/OrderedList.vue';
import ListItem from './nodes/ListItem.vue';
import HorizontalRule from './nodes/HorizontalRule.vue';
import HardBreak from './nodes/HardBreak.vue';
import CodeBlock from './nodes/CodeBlock.vue';
import Table from './nodes/Table.vue';
import TableRow from './nodes/TableRow.vue';
import TableHeader from './nodes/TableHeader.vue';
import TableCell from './nodes/TableCell.vue';
import Image from './nodes/Image.vue';
import Embed from './nodes/Embed.vue';

import Bold from './marks/Bold.vue';
import Italic from './marks/Italic.vue';
import Strike from './marks/Strike.vue';
import Underline from './marks/Underline.vue';
import Code from './marks/Code.vue';
import Highlight from './marks/Highlight.vue';
import TextStyle from './marks/TextStyle.vue';
import Link from './marks/Link.vue';

export const defaultNodeComponents: RichTextNodeOverrides = {
  paragraph: Paragraph,
  heading: Heading,
  blockquote: Blockquote,
  bulletList: BulletList,
  orderedList: OrderedList,
  listItem: ListItem,
  horizontalRule: HorizontalRule,
  hardBreak: HardBreak,
  codeBlock: CodeBlock,
  table: Table,
  tableRow: TableRow,
  tableHeader: TableHeader,
  tableCell: TableCell,
  image: Image,
  embed: Embed,
};

export const defaultMarkComponents: RichTextMarkOverrides = {
  bold: Bold,
  italic: Italic,
  strike: Strike,
  underline: Underline,
  code: Code,
  highlight: Highlight,
  textStyle: TextStyle,
  link: Link,
};
