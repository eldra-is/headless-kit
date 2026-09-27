import { describe, expect, it, vi } from 'vitest';
import {
  createLayoutRenderModel,
  DEFAULT_LAYOUT_BREAKPOINTS,
  generateLayoutCss,
  layoutNodeClass,
  normalizeLayoutDocument,
  resolveLayoutBreakpoints,
  resolveLayoutDocument,
  validateLayoutDocument,
  type BlockSlotDefinition,
  type LayoutDocument,
  type SlotValidationContext,
  type WidthLength,
} from '../layout';

const ENTRY_A = '123e4567-e89b-42d3-a456-426614174000';
const ENTRY_B = '223e4567-e89b-42d3-a456-426614174000';

function validLayout(): LayoutDocument {
  return {
    version: 1,
    root: {
      id: 'Root',
      type: 'flex',
      children: [
        {
          id: 'Grid',
          type: 'grid',
          children: [
            { id: 'BlockA', type: 'block', entryId: ENTRY_A },
            { id: 'BlockB', type: 'block', entryId: ENTRY_B },
            { id: 'BlockARepeat', type: 'block', entryId: ENTRY_A },
          ],
          layout: {
            columns: { normal: 2, mobile: 1 },
            rows: { normal: 'auto', tablet: 2 },
            columnGap: { normal: '16.0000px', mobile: '1rem' },
            rowGap: { normal: '0.0000px' },
          },
        },
      ],
      style: {
        padding: {
          normal: { top: '2rem', right: '16px', bottom: '2rem', left: '16px' },
          tablet: { right: '12px' },
          mobile: { top: '1rem', left: '12px' },
        },
        visible: { normal: true, tablet: false, mobile: true },
      },
      layout: { direction: { normal: 'row', mobile: 'column' }, gap: { normal: '16px' } },
    },
  };
}

describe('responsive layout contract', () => {
  it('normalizes canonical lengths without mutation and preserves repeated leaf order', () => {
    const input = validLayout();
    const snapshot = structuredClone(input);
    const result = normalizeLayoutDocument(input, new Set([ENTRY_A, ENTRY_B]));
    expect(input).toEqual(snapshot);
    expect(result.blockEntryIds).toEqual([ENTRY_A, ENTRY_B, ENTRY_A]);
    const grid = result.document.root.children[0];
    expect(grid?.type).toBe('grid');
    if (grid?.type === 'grid') {
      expect(grid.layout.columnGap?.normal).toBe('16px');
      expect(grid.layout.rowGap?.normal).toBe('0px');
    }
    expect(JSON.parse(JSON.stringify(result.document))).toEqual(result.document);
  });

  it('resolves scalar and per-side spacing inheritance independently', () => {
    const tablet = resolveLayoutDocument(validLayout(), 'tablet');
    expect(tablet.root.type).toBe('flex');
    if (tablet.root.type === 'flex') expect(tablet.root.layout.direction).toBe('row');
    expect(tablet.root.style.padding).toEqual({
      top: '2rem',
      right: '12px',
      bottom: '2rem',
      left: '16px',
    });
    expect(tablet.root.style.visible).toBe(false);

    const mobile = resolveLayoutDocument(validLayout(), 'mobile');
    expect(mobile.root.type).toBe('flex');
    if (mobile.root.type === 'flex') expect(mobile.root.layout.direction).toBe('column');
    expect(mobile.root.style.padding).toEqual({
      top: '1rem',
      right: '12px',
      bottom: '2rem',
      left: '12px',
    });
    expect(mobile.root.style.visible).toBe(true);
  });

  it('returns stable closed issues and escaped JSON pointers', () => {
    const cases: Array<[unknown, string, string]> = [
      [null, '', 'INVALID_TYPE'],
      [{ root: validLayout().root }, '/version', 'REQUIRED'],
      [{ ...validLayout(), 'a/b~c': true }, '/a~1b~0c', 'UNKNOWN_KEY'],
      [{ ...validLayout(), version: 4 }, '/version', 'INVALID_VALUE'],
    ];
    for (const [value, path, code] of cases) {
      expect(validateLayoutDocument(value)).toEqual({ path, code });
    }
  });

  it.each([
    ['-1px', 'INVALID_VALUE'],
    ['01px', 'INVALID_VALUE'],
    ['1.00000rem', 'INVALID_VALUE'],
    ['4096.0001px', 'INVALID_VALUE'],
    ['256.0001rem', 'INVALID_VALUE'],
    ['100.0001%', 'INVALID_VALUE'],
    ['calc(1px + 1rem)', 'INVALID_VALUE'],
    ['var(--gap)', 'INVALID_VALUE'],
    ['1px;display:none', 'INVALID_VALUE'],
  ])('rejects unsafe or out-of-contract length %s', (length, code) => {
    const layout = validLayout() as unknown as Record<string, unknown>;
    const root = layout.root as Record<string, unknown>;
    root.style = { padding: { normal: { top: length } } };
    expect(validateLayoutDocument(layout)).toEqual({
      path: '/root/style/padding/normal/top',
      code,
    });
  });

  it('distinguishes integer bounds, duplicate ids, malformed UUIDs, and missing blocks', () => {
    const bound = validLayout();
    const grid = bound.root.children[0]!;
    if (grid.type !== 'grid') throw new Error('fixture');
    grid.layout.columns.normal = 25;
    expect(validateLayoutDocument(bound)).toEqual({
      path: '/root/children/0/layout/columns/normal',
      code: 'LIMIT_EXCEEDED',
    });

    const duplicate = validLayout();
    duplicate.root.children.push({ id: 'Grid', type: 'block', entryId: ENTRY_A });
    expect(validateLayoutDocument(duplicate)).toEqual({
      path: '/root/children/1/id',
      code: 'DUPLICATE_ID',
    });

    const malformed = validLayout();
    const first = (
      malformed.root.children[0] as Extract<
        LayoutDocument['root']['children'][number],
        { type: 'grid' }
      >
    ).children[0]!;
    if (first.type !== 'block') throw new Error('fixture');
    first.entryId = ENTRY_A.toUpperCase();
    expect(validateLayoutDocument(malformed)?.code).toBe('INVALID_VALUE');
    expect(validateLayoutDocument(validLayout(), new Set())).toEqual({
      path: '/root/children/0/children/0/entryId',
      code: 'BLOCK_NOT_FOUND',
    });
  });

  it('rejects cycles, depth 13, and node 501 at deterministic paths', () => {
    const cyclic = validLayout() as unknown as Record<string, unknown>;
    cyclic.root = cyclic;
    expect(validateLayoutDocument(cyclic)).toEqual({ path: '/root', code: 'INVALID_VALUE' });

    const deep = validLayout();
    let container = deep.root;
    for (let depth = 2; depth <= 13; depth += 1) {
      const next: LayoutDocument['root'] = {
        id: `Node${depth}`,
        type: 'flex',
        children: [],
        layout: { direction: { normal: 'column' } },
      };
      container.children = [next];
      container = next;
    }
    expect(validateLayoutDocument(deep)).toEqual({
      path: `/root${'/children/0'.repeat(12)}`,
      code: 'LIMIT_EXCEEDED',
    });

    const wide = validLayout();
    wide.root.children = Array.from({ length: 500 }, (_, index) => ({
      id: `Block${index}`,
      type: 'block' as const,
      entryId: ENTRY_A,
    }));
    expect(validateLayoutDocument(wide)).toEqual({
      path: '/root/children/499',
      code: 'LIMIT_EXCEEDED',
    });
  });

  it('rejects unsafe array properties and canonical documents over 262144 UTF-8 bytes', () => {
    const property = validLayout();
    Object.defineProperty(property.root.children, 'constructor', {
      value: 'unsafe',
      enumerable: true,
      configurable: true,
    });
    expect(validateLayoutDocument(property)).toEqual({
      path: '/root/children/constructor',
      code: 'UNKNOWN_KEY',
    });

    const oversized = validLayout();
    const spacing = {
      normal: {
        top: '4096.0000px',
        right: '4096.0000px',
        bottom: '4096.0000px',
        left: '4096.0000px',
      },
      tablet: {
        top: '4096.0000px',
        right: '4096.0000px',
        bottom: '4096.0000px',
        left: '4096.0000px',
      },
      mobile: {
        top: '4096.0000px',
        right: '4096.0000px',
        bottom: '4096.0000px',
        left: '4096.0000px',
      },
    } as const;
    oversized.root.children = Array.from({ length: 499 }, (_, index) => ({
      id: `N${String(index).padStart(94, '0')}`,
      type: 'block' as const,
      entryId: ENTRY_A,
      style: {
        margin: spacing,
        padding: spacing,
        width: {
          normal: '4096.0000px' as const,
          tablet: '256.0000rem' as const,
          mobile: '100.0000%' as const,
        },
        minWidth: {
          normal: '4096.0000px' as const,
          tablet: '256.0000rem' as const,
          mobile: '100.0000%' as const,
        },
        maxWidth: {
          normal: '4096.0000px' as const,
          tablet: '256.0000rem' as const,
          mobile: '100.0000%' as const,
        },
        minHeight: {
          normal: '4096.0000px' as const,
          tablet: '256.0000rem' as const,
          mobile: '100.0000%' as const,
        },
        alignSelf: {
          normal: 'stretch' as const,
          tablet: 'center' as const,
          mobile: 'auto' as const,
        },
        visible: { normal: true, tablet: false, mobile: true },
      },
    }));
    expect(validateLayoutDocument(oversized)).toEqual({ path: '', code: 'LIMIT_EXCEEDED' });
  });

  it('uses the full standard SHA-256 digest and keeps identity stable across reorder', () => {
    expect(layoutNodeClass('abc')).toBe(
      'eldra-layout-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    const before = createLayoutRenderModel(validLayout());
    const reordered = validLayout();
    const grid = reordered.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    grid.children.reverse();
    const after = createLayoutRenderModel(reordered);
    expect(after.root.children[0]?.className).toBe(before.root.children[0]?.className);
  });

  it('inherits container presets and lets explicit layout declarations win per breakpoint', () => {
    const layout = validLayout();
    layout.root.style = {
      container: { normal: 'content', tablet: 'narrow', mobile: 'full' },
      width: { normal: '80%', mobile: '100%' },
      maxWidth: { normal: '60rem' },
      margin: { normal: { left: '1rem' }, mobile: { right: '2rem' } },
      padding: { normal: { left: '3rem' } },
    };
    const ids = new Set(['narrow', 'content', 'wide', 'full']);
    const css = generateLayoutCss(layout, undefined, ids);
    expect(css).toContain('max-width:60rem;');
    expect(css).toContain('margin-left:1rem;');
    expect(css).toContain('padding-left:3rem;');
    expect(css).toContain('var(--eldra-container-narrow-gutter-tablet)');
    expect(css).toContain('var(--eldra-container-full-gutter-mobile)');
    expect(resolveLayoutDocument(layout, 'mobile', undefined, ids).root.style.container).toBe(
      'full'
    );
    expect(validateLayoutDocument(layout, undefined, new Set(['content']))).toEqual({
      path: '/root/style/container/tablet',
      code: 'INVALID_VALUE',
    });
  });

  it('emits only enumerated declarations in scoped rules for all fixed ranges', () => {
    const css = generateLayoutCss(validLayout());
    expect(css).toContain('@media (min-width:1024px)');
    expect(css).toContain('@media (min-width:768px) and (max-width:1023px)');
    expect(css).toContain('@media (max-width:767px)');
    expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr));');
    expect(css).toContain('grid-template-columns:repeat(1,minmax(0,1fr));');
    expect(css).toContain('padding-right:12px;');
    expect(css).toContain('display:none;');
    expect(css).not.toMatch(/calc|var\(|url\(|<|>|javascript|position:/);
  });
});

describe('width keywords (fill / fit-content)', () => {
  /** Every `.class{…}` rule body in a given `@media` section of `css`
   * (`cssForDocument`'s output: at most three concatenated `@media` blocks,
   * normal/tablet/mobile in that order, each wrapping a flat run of
   * `.class{prop:val;…}` rules with no nested braces). */
  function mediaSections(css: string): string[] {
    return css
      .split('@media ')
      .filter((part) => part.length > 0)
      .map((part) => {
        const open = part.indexOf('{');
        return part.slice(open + 1, -1);
      });
  }

  function ruleBody(section: string, className: string): string {
    return new RegExp(`\\.${className}\\{([^}]*)\\}`).exec(section)?.[1] ?? '';
  }

  it('accepts fill and fit-content on width at every breakpoint', () => {
    const layout = validLayout();
    layout.root.style = {
      ...layout.root.style,
      width: { normal: 'fill', tablet: 'fit-content', mobile: 'fill' },
    };
    expect(validateLayoutDocument(layout)).toBeNull();
  });

  it('rejects fill and fit-content on minWidth, maxWidth, and minHeight', () => {
    for (const key of ['minWidth', 'maxWidth', 'minHeight'] as const) {
      for (const keyword of ['fill', 'fit-content'] as const) {
        const layout = validLayout();
        layout.root.style = { ...layout.root.style, [key]: { normal: keyword } };
        expect(validateLayoutDocument(layout)).toEqual({
          path: `/root/style/${key}/normal`,
          code: 'INVALID_VALUE',
        });
      }
    }
  });

  it('rejects anything else on width that is not a length, auto, fill, or fit-content', () => {
    const layout = validLayout();
    // deliberately invalid at runtime — asserting the validator's own rejection, not the type system's.
    layout.root.style = {
      ...layout.root.style,
      width: { normal: 'filled' as unknown as WidthLength },
    };
    expect(validateLayoutDocument(layout)).toEqual({
      path: '/root/style/width/normal',
      code: 'INVALID_VALUE',
    });
  });

  it('a plain length/auto width still emits width:<value> unchanged, regardless of parent context', () => {
    // validLayout's root already carries width:80%/100% coverage via the
    // "inherits container presets" test above; this asserts the literal
    // property text itself, under a flex-row parent (Grid, child of the
    // row-direction root) — the one context that now behaves differently
    // for the two new keywords — to prove a length is unaffected by that.
    const layout = validLayout();
    const grid = layout.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    grid.style = { width: { normal: '42rem' } };
    const css = generateLayoutCss(layout);
    const [normalSection] = mediaSections(css);
    expect(ruleBody(normalSection!, layoutNodeClass(grid.id))).toContain('width:42rem;');
  });

  it('fill under a flex-row parent: flex:1 1 0%;min-width:0, and no width property at all', () => {
    // root's direction is {normal:'row', mobile:'column'}; tablet falls back
    // to normal ('row'), so both sections exercise the flex-row branch.
    const layout = validLayout();
    const grid = layout.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    grid.style = { width: { normal: 'fill' } };
    const css = generateLayoutCss(layout);
    const [normalSection, tabletSection] = mediaSections(css);
    const className = layoutNodeClass(grid.id);
    for (const section of [normalSection!, tabletSection!]) {
      const rule = ruleBody(section, className);
      expect(rule).toContain('flex:1 1 0%;');
      expect(rule).toContain('min-width:0;');
      expect(rule.replace('min-width:0;', '')).not.toContain('width:');
    }
  });

  it('fill under a flex-column parent: width:100%, no flex shorthand', () => {
    // root's direction at mobile is 'column' — same node (Grid) as the
    // flex-row test above, different breakpoint, per the resolved-per-
    // breakpoint parent direction.
    const layout = validLayout();
    const grid = layout.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    grid.style = { width: { normal: 'fill' } };
    const css = generateLayoutCss(layout);
    const [, , mobileSection] = mediaSections(css);
    const rule = ruleBody(mobileSection!, layoutNodeClass(grid.id));
    expect(rule).toContain('width:100%;');
    expect(rule).not.toContain('flex:');
    expect(rule).not.toContain('justify-self');
  });

  it('fill with no flex parent at all (the document root): width:100%', () => {
    const layout = validLayout();
    layout.root.style = { ...layout.root.style, width: { normal: 'fill' } };
    const css = generateLayoutCss(layout);
    const [normalSection] = mediaSections(css);
    const rule = ruleBody(normalSection!, layoutNodeClass(layout.root.id));
    expect(rule).toContain('width:100%;');
    expect(rule).not.toContain('justify-self');
  });

  it('fill under a grid parent: justify-self:stretch;width:100%', () => {
    const layout = validLayout();
    const grid = layout.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    const blockA = grid.children[0];
    if (blockA?.type !== 'block') throw new Error('fixture');
    blockA.style = { width: { normal: 'fill' } };
    const css = generateLayoutCss(layout);
    const [normalSection] = mediaSections(css);
    const rule = ruleBody(normalSection!, layoutNodeClass(blockA.id));
    expect(rule).toContain('justify-self:stretch;');
    expect(rule).toContain('width:100%;');
    expect(rule).not.toContain('flex:');
  });

  it('fit-content under a flex-row parent: flex:0 0 auto;width:fit-content', () => {
    const layout = validLayout();
    const grid = layout.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    grid.style = { width: { normal: 'fit-content' } };
    const css = generateLayoutCss(layout);
    const [normalSection, tabletSection] = mediaSections(css);
    const className = layoutNodeClass(grid.id);
    for (const section of [normalSection!, tabletSection!]) {
      const rule = ruleBody(section, className);
      expect(rule).toContain('flex:0 0 auto;');
      expect(rule).toContain('width:fit-content;');
    }
  });

  it('fit-content under a flex-column parent: width:fit-content, no flex shorthand', () => {
    const layout = validLayout();
    const grid = layout.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    grid.style = { width: { normal: 'fit-content' } };
    const css = generateLayoutCss(layout);
    const [, , mobileSection] = mediaSections(css);
    const rule = ruleBody(mobileSection!, layoutNodeClass(grid.id));
    expect(rule).toContain('width:fit-content;');
    expect(rule).not.toContain('flex:');
    expect(rule).not.toContain('justify-self');
  });

  it('fit-content with no flex parent at all (the document root): width:fit-content', () => {
    const layout = validLayout();
    layout.root.style = { ...layout.root.style, width: { normal: 'fit-content' } };
    const css = generateLayoutCss(layout);
    const [normalSection] = mediaSections(css);
    const rule = ruleBody(normalSection!, layoutNodeClass(layout.root.id));
    expect(rule).toContain('width:fit-content;');
    expect(rule).not.toContain('justify-self');
  });

  it('fit-content under a grid parent: justify-self:start;width:fit-content', () => {
    // A container child, not a block — a block under a grid parent now
    // aliases fit-content to fill (see the block-specific describe below),
    // so this exercises the container branch that must stay unchanged.
    const layout = validLayout();
    const grid = layout.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    const nested: LayoutDocument['root'] = {
      id: 'NestedFlex',
      type: 'flex',
      children: [],
      layout: { direction: { normal: 'row' } },
      style: { width: { normal: 'fit-content' } },
    };
    grid.children.push(nested);
    const css = generateLayoutCss(layout);
    const [normalSection] = mediaSections(css);
    const rule = ruleBody(normalSection!, layoutNodeClass(nested.id));
    expect(rule).toContain('justify-self:start;');
    expect(rule).toContain('width:fit-content;');
  });

  it('an explicit minWidth on the same node still wins over the implicit min-width:0 a flex-row fill sets', () => {
    const layout = validLayout();
    const grid = layout.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    grid.style = { width: { normal: 'fill' }, minWidth: { normal: '10rem' } };
    const css = generateLayoutCss(layout);
    const [normalSection] = mediaSections(css);
    const rule = ruleBody(normalSection!, layoutNodeClass(grid.id));
    expect(rule).toContain('min-width:10rem;');
    expect(rule).not.toContain('min-width:0;');
  });

  it('a slot child is never treated as a flex/grid item of the outer block\'s own parent — it gets the same "no flex parent" width treatment as the document root', () => {
    const hostEntry = '123e4567-e89b-42d3-a456-426614174000';
    const childEntry = '223e4567-e89b-42d3-a456-426614174000';
    const apiHost = 'hero-block';
    const apiChild = 'text-block';
    const slotContext: SlotValidationContext = {
      slotCatalog: {
        [apiHost]: [{ id: 'body', label: 'Body', maxItems: 5 } satisfies BlockSlotDefinition],
      },
      entryApiId: (entryId) =>
        entryId === hostEntry ? apiHost : entryId === childEntry ? apiChild : undefined,
    };
    const doc = {
      version: 3 as const,
      root: {
        id: 'Root',
        type: 'flex' as const,
        // A flex ROW parent — the context that would give the child
        // flex:1 1 0%/min-width:0 if it (wrongly) inherited it through the
        // Host block it is nested inside.
        layout: { direction: { normal: 'row' as const } },
        children: [
          {
            id: 'Host',
            type: 'block' as const,
            entryId: hostEntry,
            slots: {
              body: [
                {
                  id: 'Child',
                  type: 'block' as const,
                  entryId: childEntry,
                  style: { width: { normal: 'fill' as const } },
                },
              ],
            },
          },
        ],
      },
    };
    const model = createLayoutRenderModel(doc, undefined, undefined, slotContext);
    const [normalSection] = mediaSections(model.css);
    const rule = ruleBody(normalSection!, layoutNodeClass('Child'));
    expect(rule).toContain('width:100%;');
    expect(rule).not.toContain('flex:');
  });

  // Every block root is a `container-type: inline-size` query container, so
  // a block node has no intrinsic inline size under CSS size containment —
  // it collapses to 0px wherever the generated CSS would otherwise leave it
  // sized by its own content (see `widthDeclarations`'s doc comment).
  // Container (flex/grid) nodes are never affected; the cases above stay
  // green unchanged.

  it('a block with no width under a flex-row parent gets flex:1 1 0%;min-width:0 — and nothing extra where that parent is a column', () => {
    // root direction is {normal:'row', mobile:'column'}; tablet falls back
    // to normal ('row'). A bare block, second child of the root itself (not
    // the Grid), so its parent context flips row->column exactly where the
    // root's own direction does.
    const layout = validLayout();
    layout.root.children.push({ id: 'BlockRoot', type: 'block', entryId: ENTRY_A });
    const css = generateLayoutCss(layout);
    const [normalSection, tabletSection, mobileSection] = mediaSections(css);
    const className = layoutNodeClass('BlockRoot');
    for (const section of [normalSection!, tabletSection!]) {
      const rule = ruleBody(section, className);
      expect(rule).toContain('flex:1 1 0%;');
      expect(rule).toContain('min-width:0;');
    }
    const mobileRule = ruleBody(mobileSection!, className);
    expect(mobileRule).not.toContain('flex:');
    expect(mobileRule).not.toContain('min-width:');
  });

  it('a block with fit-content under a flex-row parent gets fill declarations, never width:fit-content', () => {
    const layout = validLayout();
    layout.root.children.push({
      id: 'BlockRoot',
      type: 'block',
      entryId: ENTRY_A,
      style: { width: { normal: 'fit-content' } },
    });
    const css = generateLayoutCss(layout);
    const [normalSection, tabletSection] = mediaSections(css);
    const className = layoutNodeClass('BlockRoot');
    for (const section of [normalSection!, tabletSection!]) {
      const rule = ruleBody(section, className);
      expect(rule).toContain('flex:1 1 0%;');
      expect(rule).toContain('min-width:0;');
      expect(rule).not.toContain('fit-content');
    }
  });

  it('a block with fit-content under a grid parent gets justify-self:stretch;width:100%', () => {
    const layout = validLayout();
    const grid = layout.root.children[0];
    if (grid?.type !== 'grid') throw new Error('fixture');
    const blockA = grid.children[0];
    if (blockA?.type !== 'block') throw new Error('fixture');
    blockA.style = { width: { normal: 'fit-content' } };
    const css = generateLayoutCss(layout);
    const [normalSection] = mediaSections(css);
    const rule = ruleBody(normalSection!, layoutNodeClass(blockA.id));
    expect(rule).toContain('justify-self:stretch;');
    expect(rule).toContain('width:100%;');
    expect(rule).not.toContain('fit-content');
    expect(rule).not.toContain('flex:');
  });

  it('a block with fit-content under a flex-column parent, or with no flex/grid parent at all, gets width:100%', () => {
    // Column: root direction at mobile is 'column' — same BlockRoot node as
    // above, reused with fit-content instead of no width.
    const layout = validLayout();
    layout.root.children.push({
      id: 'BlockRoot',
      type: 'block',
      entryId: ENTRY_A,
      style: { width: { normal: 'fit-content' } },
    });
    const columnCss = generateLayoutCss(layout);
    const [, , mobileSection] = mediaSections(columnCss);
    const columnRule = ruleBody(mobileSection!, layoutNodeClass('BlockRoot'));
    expect(columnRule).toContain('width:100%;');
    expect(columnRule).not.toContain('fit-content');
    expect(columnRule).not.toContain('flex:');
    expect(columnRule).not.toContain('justify-self');

    // No flex/grid parent at all: a block's slot child (parent is always
    // `null`/'none', regardless of what the outer block sits in — see the
    // slot test above).
    const hostEntry = '123e4567-e89b-42d3-a456-426614174000';
    const childEntry = '223e4567-e89b-42d3-a456-426614174000';
    const apiHost = 'hero-block';
    const apiChild = 'text-block';
    const slotContext: SlotValidationContext = {
      slotCatalog: {
        [apiHost]: [{ id: 'body', label: 'Body', maxItems: 5 } satisfies BlockSlotDefinition],
      },
      entryApiId: (entryId) =>
        entryId === hostEntry ? apiHost : entryId === childEntry ? apiChild : undefined,
    };
    const doc = {
      version: 3 as const,
      root: {
        id: 'Root',
        type: 'flex' as const,
        layout: { direction: { normal: 'row' as const } },
        children: [
          {
            id: 'Host',
            type: 'block' as const,
            entryId: hostEntry,
            slots: {
              body: [
                {
                  id: 'Child',
                  type: 'block' as const,
                  entryId: childEntry,
                  style: { width: { normal: 'fit-content' as const } },
                },
              ],
            },
          },
        ],
      },
    };
    const model = createLayoutRenderModel(doc, undefined, undefined, slotContext);
    const [normalSection] = mediaSections(model.css);
    const rule = ruleBody(normalSection!, layoutNodeClass('Child'));
    expect(rule).toContain('width:100%;');
    expect(rule).not.toContain('fit-content');
    expect(rule).not.toContain('flex:');
  });

  it('templateLayout route templates route through the same fix: a template-block with no width under a flex-row root gets flex:1 1 0%;min-width:0', async () => {
    const { createTemplateLayoutRenderModel } = await import('../templateLayout');
    const model = createTemplateLayoutRenderModel(
      {
        version: 1,
        root: {
          id: 'root',
          type: 'flex',
          layout: { direction: { normal: 'row' } },
          children: [{ id: 'hero-placement', type: 'template-block', apiId: 'hero' }],
        },
      },
      {
        entry: { id: 'entry-1', data: { title: 'Hello' } },
        blockCatalog: { hero: { apiId: 'hero', fields: [] } },
      }
    );
    const [normalSection] = mediaSections(model.css);
    const rule = ruleBody(normalSection!, layoutNodeClass('hero-placement'));
    expect(rule).toContain('flex:1 1 0%;');
    expect(rule).toContain('min-width:0;');
  });
});

describe('LayoutBreakpoints (breakpoints negotiation)', () => {
  it('generateLayoutCss/createLayoutRenderModel use a theme-configured breakpoints pair', () => {
    const breakpoints = { tablet: 600, normal: 900 };
    const css = generateLayoutCss(validLayout(), undefined, undefined, breakpoints);
    expect(css).toContain('@media (min-width:900px)');
    expect(css).toContain('@media (min-width:600px) and (max-width:899px)');
    expect(css).toContain('@media (max-width:599px)');
    expect(css).not.toContain('1024px');
    expect(css).not.toContain('768px');

    const model = createLayoutRenderModel(
      validLayout(),
      undefined,
      undefined,
      undefined,
      breakpoints
    );
    expect(model.css).toBe(css);
  });

  it('defaults to 768/1024 — byte-identical to the hardcoded output — when breakpoints is omitted', () => {
    const withDefaultsExplicit = generateLayoutCss(
      validLayout(),
      undefined,
      undefined,
      DEFAULT_LAYOUT_BREAKPOINTS
    );
    const withNoneGiven = generateLayoutCss(validLayout());
    expect(withNoneGiven).toBe(withDefaultsExplicit);
    expect(withNoneGiven).toContain('@media (min-width:1024px)');
    expect(withNoneGiven).toContain('@media (min-width:768px) and (max-width:1023px)');
    expect(withNoneGiven).toContain('@media (max-width:767px)');
  });

  describe('resolveLayoutBreakpoints', () => {
    it('resolves undefined/null to the defaults, silently', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(resolveLayoutBreakpoints(undefined)).toEqual(DEFAULT_LAYOUT_BREAKPOINTS);
      expect(resolveLayoutBreakpoints(null)).toEqual(DEFAULT_LAYOUT_BREAKPOINTS);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('accepts a valid custom pair unchanged', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(resolveLayoutBreakpoints({ tablet: 480, normal: 1280 })).toEqual({
        tablet: 480,
        normal: 1280,
      });
      // Bounds are inclusive at both ends.
      expect(resolveLayoutBreakpoints({ tablet: 320, normal: 4096 })).toEqual({
        tablet: 320,
        normal: 4096,
      });
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it.each([
      ['tablet below the 320 floor', { tablet: 319, normal: 1024 }],
      ['normal above the 4096 ceiling', { tablet: 768, normal: 4097 }],
      ['tablet not less than normal', { tablet: 1024, normal: 1024 }],
      ['tablet greater than normal', { tablet: 1200, normal: 1024 }],
      ['a non-integer', { tablet: 768.5, normal: 1024 }],
      ['a non-finite value', { tablet: 768, normal: Number.POSITIVE_INFINITY }],
    ])('falls back to the defaults with a console warning on nonsense: %s', (_label, nonsense) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(resolveLayoutBreakpoints(nonsense)).toEqual(DEFAULT_LAYOUT_BREAKPOINTS);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain('invalid layout breakpoints');
      warn.mockRestore();
    });
  });
});
