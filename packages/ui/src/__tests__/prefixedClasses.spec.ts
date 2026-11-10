import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme; Node's own resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parse } from 'vue/compiler-sfc';

/**
 * Every class a component authors carries the `eldra:` prefix, because the kit's stylesheet is
 * compiled with `prefix(eldra)`: an unprefixed class in a component is styled by nothing the
 * package ships, only by whatever an app's own utilities happen to call that name. This reads every
 * static `class="…"` in a template, every string literal in a `:class` binding, and every class
 * string in script code (see `scriptClasses`), and fails on any token without the prefix. What a
 * story actually renders is checked by `renderedClasses.spec.ts`.
 */
interface TemplateNode {
  type: number;
  props?: Array<{
    type: number;
    name: string;
    value?: { content: string };
    arg?: { content: string };
    exp?: { content: string };
  }>;
  children?: TemplateNode[];
  branches?: TemplateNode[];
}

const ELEMENT = 1;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;

const src = fileURLToPath(new NodeURL('../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    if (entry.name.endsWith('.vue')) return [path];
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.stories.ts') ? [path] : [];
  });
}

const files = [...sourceFiles(join(src, 'components')), ...sourceFiles(join(src, 'composables'))];

function templateClasses(nodes: TemplateNode[] = [], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === ELEMENT) {
      for (const prop of node.props ?? []) {
        if (prop.type === ATTRIBUTE && prop.name === 'class') {
          out.push(...(prop.value?.content ?? '').split(/\s+/));
        } else if (
          prop.type === DIRECTIVE &&
          prop.name === 'bind' &&
          prop.arg?.content === 'class'
        ) {
          const expression = ts.createSourceFile(
            'x.ts',
            `(${prop.exp?.content ?? ''})`,
            ts.ScriptTarget.Latest,
            true
          ).statements[0];
          if (expression && ts.isExpressionStatement(expression))
            classTokens(expression.expression, out);
        }
      }
    }
    templateClasses(node.children, out);
    templateClasses(node.branches, out);
  }
  return out;
}

/** The whole tokens of a template literal's text: a token touching a `${}` is only part of one. */
function wholeTokens(text: string, openStart: boolean, openEnd: boolean): string[] {
  const tokens = text.split(/\s+/);
  if (openStart && !/^\s/.test(text)) tokens.shift();
  if (openEnd && !/\s$/.test(text)) tokens.pop();
  return tokens;
}

/** The class tokens an expression evaluates to where its value is a class list. */
function classTokens(node: ts.Node, out: string[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(...node.text.split(/\s+/));
  } else if (ts.isTemplateExpression(node)) {
    out.push(...wholeTokens(node.head.text, false, true));
    node.templateSpans.forEach((span, index) =>
      out.push(...wholeTokens(span.literal.text, true, index < node.templateSpans.length - 1))
    );
  } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    classTokens(node.expression, out);
  } else if (ts.isConditionalExpression(node)) {
    classTokens(node.whenTrue, out);
    classTokens(node.whenFalse, out);
  } else if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.BarBarToken) {
      classTokens(node.left, out);
      classTokens(node.right, out);
    } else if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    ) {
      classTokens(node.right, out);
    }
  } else if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((element) => classTokens(element, out));
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (property.name && (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name))) {
        out.push(...property.name.text.split(/\s+/));
      }
    }
  }
}

/**
 * In script code a class list is a string with no marker of its own, so a string is read as one
 * when any of its tokens is `eldra:`-prefixed, or when it is handed to Vue's `normalizeClass`.
 */
function scriptClasses(code: string): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'normalizeClass'
    ) {
      node.arguments.forEach((argument) => classTokens(argument, out));
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      const tokens: string[] = [];
      classTokens(node, tokens);
      if (tokens.some((token) => token.startsWith('eldra:'))) out.push(...tokens);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true));
  return out;
}

function authoredClasses(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  if (!file.endsWith('.vue')) return scriptClasses(source);
  const { descriptor } = parse(source);
  const ast = descriptor.template?.ast as TemplateNode | undefined;
  return [
    ...templateClasses(ast?.children),
    ...scriptClasses(descriptor.script?.content ?? ''),
    ...scriptClasses(descriptor.scriptSetup?.content ?? ''),
  ];
}

const scanned = files.map((file) => ({ file: relative(src, file), tokens: authoredClasses(file) }));

describe('every class a component authors is eldra:-prefixed', () => {
  it('finds the classes to check', () => {
    expect(files.length).toBeGreaterThan(70);
    expect(scanned.flatMap(({ tokens }) => tokens).filter(Boolean).length).toBeGreaterThan(1000);
  });

  it('has no unprefixed class token', () => {
    const unprefixed = scanned.flatMap(({ file, tokens }) =>
      tokens
        .filter((token) => token && !token.startsWith('eldra:'))
        .map((token) => `${file}: ${token}`)
    );
    expect(unprefixed).toEqual([]);
  });
});
