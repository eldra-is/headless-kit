import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  classifyBeforeInput,
  createOverlayRuntime,
  type OverlayRuntime,
  type OverlayRuntimeOptions,
} from '../overlay';
import type { BridgePayloads } from '../bridge';
import {
  computeRichTextPositions,
  resolveDomPosition,
  restampRichTextPositions,
} from '../richTextPositions';
import { buildRichTextTree, type RichTextRenderChild } from '../richTextTree';
import { safeHref } from '../richText';
import { encodeStega } from '../stega';

describe('createOverlayRuntime', () => {
  let post: Mock<OverlayRuntimeOptions['post']>;
  let runtime: OverlayRuntime;
  let rendererText: Text;

  beforeEach(() => {
    vi.useFakeTimers();
    // reposition() schedules reportBlocks() via requestAnimationFrame; jsdom
    // does not implement rAF, so every test that triggers reposition() (via
    // scroll/resize, setMode or setSelected) needs the same stub the framing
    // tests use.
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    post = vi.fn<OverlayRuntimeOptions['post']>();
    document.body.innerHTML = '';
    const section = document.createElement('section');
    section.setAttribute('data-eldra-block', 'block-1');
    section.setAttribute('data-eldra-schema', 'hero');
    section.setAttribute('data-eldra-layout-node', 'placement-1');
    const heading = document.createElement('h2');
    heading.textContent = encodeStega('Hello', {
      entryId: 'block-1',
      fieldPath: 'heading',
      locale: 'en-US',
    });
    rendererText = heading.firstChild as Text;
    section.appendChild(heading);
    document.body.appendChild(section);
    runtime = createOverlayRuntime({ post });
    runtime.start();
  });

  afterEach(() => {
    runtime.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('mounts a closed shadow-DOM overlay host', () => {
    const host = document.querySelector('[data-eldra-overlay-host]');
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).toBeNull();
  });

  it('decorates single-text render elements without changing their hierarchy', () => {
    const field = document.querySelector('[data-eldra-field="heading"]');
    expect(field).not.toBeNull();
    expect(field!.tagName).toBe('H2');
    expect(field!.textContent).toBe('Hello');
    expect(field!.firstChild).toBe(rendererText);
  });

  it('keeps renderer-owned text reactive after decoration', async () => {
    rendererText.data = encodeStega('Updated by renderer', {
      entryId: 'block-1',
      fieldPath: 'heading',
      locale: 'is-IS',
    });
    await Promise.resolve();
    const field = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    expect(field.firstChild).toBe(rendererText);
    expect(field.textContent).toBe('Updated by renderer');
    expect(field.getAttribute('data-eldra-locale')).toBe('is-IS');
  });

  it('emits block and field clicks with contract metadata and rectangles', () => {
    const block = document.querySelector('[data-eldra-block]') as HTMLElement;
    block.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(post).toHaveBeenCalledWith(
      'theme:block-clicked',
      expect.objectContaining({
        entryId: 'block-1',
        schemaApiId: 'hero',
        layoutNodeId: 'placement-1',
        rect: expect.objectContaining({ x: expect.any(Number), width: expect.any(Number) }),
      })
    );

    const field = document.querySelector('[data-eldra-field]') as HTMLElement;
    field.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(post).toHaveBeenCalledWith(
      'theme:field-clicked',
      expect.objectContaining({
        entryId: 'block-1',
        fieldPath: 'heading',
        locale: 'en-US',
      })
    );
  });

  it('makes fields editable only in edit mode and debounces text edits', () => {
    runtime.setMode('edit');
    const span = document.querySelector('[data-eldra-field]') as HTMLElement;
    expect(span.getAttribute('contenteditable')).toBe('true');
    span.textContent = 'Hello world';
    span.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(post).not.toHaveBeenCalledWith('theme:text-edited', expect.anything());
    vi.advanceTimersByTime(300);
    expect(post).toHaveBeenCalledWith('theme:text-edited', {
      entryId: 'block-1',
      fieldPath: 'heading',
      locale: 'en-US',
      value: 'Hello world',
      layoutNodeId: 'placement-1',
    });

    runtime.setMode('preview');
    expect(span.getAttribute('contenteditable')).toBeNull();
  });

  it('rescans stega nodes introduced by a render update', () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = encodeStega('New text', {
      entryId: 'block-1',
      fieldPath: 'body',
      locale: null,
    });
    document.querySelector('[data-eldra-block]')!.appendChild(paragraph);
    runtime.rescan();
    expect(document.querySelector('[data-eldra-field="body"]')?.textContent).toBe('New text');
    expect(post).toHaveBeenCalledWith('theme:blocks-rendered', {
      blocks: [expect.objectContaining({ entryId: 'block-1', layoutNodeId: 'placement-1' })],
    });
  });

  it('restores inline focus and caret when a renderer replaces the decorated field', () => {
    runtime.setMode('edit');
    const original = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    original.focus();
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(original.firstChild!, 3);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    original.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    const heading = document.createElement('h2');
    heading.textContent = encodeStega('Hello!', {
      entryId: 'block-1',
      fieldPath: 'heading',
      locale: 'is-IS',
    });
    original.replaceWith(heading);
    runtime.rescan();

    const replacement = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    expect(replacement).not.toBe(original);
    expect(document.activeElement).toBe(replacement);
    expect(replacement.textContent).toBe('Hello!');
    expect(document.getSelection()?.focusOffset).toBe(3);
  });

  it('preserves newer local text when a stale renderer echo replaces the active field', () => {
    runtime.setMode('edit');
    const original = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    original.focus();
    original.textContent = 'Hello xy';
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(original);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    original.dispatchEvent(new InputEvent('input', { bubbles: true }));

    const heading = document.createElement('h2');
    heading.textContent = encodeStega('Hello x', {
      entryId: 'block-1',
      fieldPath: 'heading',
      locale: 'en-US',
    });
    original.replaceWith(heading);
    runtime.rescan();

    const replacement = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    expect(replacement.textContent).toBe('Hello xy');
    expect(document.activeElement).toBe(replacement);
    expect(document.getSelection()?.focusOffset).toBe('Hello xy'.length);
  });

  it('accepts an authoritative external draft over inline text the editor has seen', () => {
    runtime.setMode('edit');
    const original = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    original.focus();
    original.textContent = 'Stale local text';
    original.dispatchEvent(new InputEvent('input', { bubbles: true }));
    // The editor can only hold an authoritative draft for text it has been
    // told about *and has answered*: flush the field's own theme:text-edited
    // debounce, then let the editor acknowledge it by echoing that value back.
    // Until that acknowledgement the local text is newer than anything the
    // editor can send — the round trip is bounded by nothing the theme
    // controls — and the test below proves it survives instead.
    vi.advanceTimersByTime(300);
    expect(post).toHaveBeenCalledWith(
      'theme:text-edited',
      expect.objectContaining({
        value: 'Stale local text',
      })
    );
    runtime.acceptExternalUpdate(['block-1']);
    runtime.reconcileExternalDrafts({ 'block-1': { heading: 'Stale local text' } }, ['block-1']);

    const heading = document.createElement('h2');
    heading.textContent = encodeStega('Accepted external draft', {
      entryId: 'block-1',
      fieldPath: 'heading',
      locale: 'en-US',
    });
    original.replaceWith(heading);
    runtime.rescan();

    expect(document.querySelector('[data-eldra-field="heading"]')?.textContent).toBe(
      'Accepted external draft'
    );
  });

  it('keeps every keystroke and the caret when the editor echoes a draft one key behind', () => {
    runtime.setMode('edit');
    const stega = (value: string): string =>
      encodeStega(value, { entryId: 'block-1', fieldPath: 'heading', locale: 'en-US' });
    const field = (): HTMLElement =>
      document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    const placeCaret = (offset: number): void => {
      const element = field();
      const selection = document.getSelection()!;
      const range = document.createRange();
      const text = element.firstChild;
      if (text?.nodeType === Node.TEXT_NODE)
        range.setStart(text, Math.min(offset, (text as Text).data.length));
      else range.selectNodeContents(element);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    };
    const caret = (): number => {
      const selection = document.getSelection()!;
      if (selection.rangeCount === 0) return -1;
      const live = selection.getRangeAt(0);
      const probe = document.createRange();
      probe.selectNodeContents(field());
      try {
        probe.setEnd(live.startContainer, live.startOffset);
      } catch {
        return -1;
      }
      return probe.toString().length;
    };
    // What the browser does for one typed character inside the contenteditable,
    // followed by the MutationObserver pass the overlay answers it with.
    const typeChar = (char: string): void => {
      const element = field();
      const at = caret();
      (element.firstChild as Text).insertData(at, char);
      placeCaret(at + char.length);
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
      runtime.rescan();
    };
    // One editor:content-update, exactly as theme-vue delivers it: release the
    // preservation, let the renderer redraw the field from the draft (which
    // replaces the text node the caret lives in), rescan, then reconcile.
    const echo = (value: string): void => {
      runtime.acceptExternalUpdate(['block-1']);
      field().textContent = stega(value);
      runtime.rescan();
      runtime.reconcileExternalDrafts({ 'block-1': { heading: stega(value) } }, ['block-1']);
    };

    field().focus();
    placeCaret('Hello'.length);
    field().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    const typed = ' probe';
    let seenByEditor = 'Hello';
    for (let index = 0; index < typed.length; index += 1) {
      typeChar(typed[index]!);
      const expected = `Hello${typed.slice(0, index + 1)}`;
      expect(field().textContent).toBe(expected);
      expect(caret()).toBe(expected.length);

      // The editor echoes the draft it last accepted — one keystroke behind,
      // because this keystroke's own debounce has not flushed yet. Neither the
      // character nor the caret may be lost to it.
      echo(seenByEditor);
      expect(field().textContent).toBe(expected);
      expect(caret()).toBe(expected.length);

      // The debounce flushes, the editor catches up, and its acknowledging
      // echo must not move the caret either.
      vi.advanceTimersByTime(300);
      expect(post).toHaveBeenCalledWith(
        'theme:text-edited',
        expect.objectContaining({ value: expected })
      );
      seenByEditor = expected;
      echo(seenByEditor);
      expect(field().textContent).toBe(expected);
      expect(caret()).toBe(expected.length);
    }

    expect(field().textContent).toBe('Hello probe');
  });

  /**
   * The overlay answers a keystroke from two places: its own `input` handler
   * and, through `decorateStegaTextNodes`, the MutationObserver that sees the
   * character land. Which runs first is not the overlay's to decide — a
   * microtask checkpoint is where queued observer records are delivered, and
   * anything else on the page that registered an `input` listener before the
   * overlay's own puts one between that listener and this one. These drive the
   * decorate pass first, which is the order the operator's session had.
   */
  describe('a decorate pass that runs before the overlay sees the keystroke', () => {
    const fieldOf = (): HTMLElement =>
      document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    const place = (offset: number): void => {
      const element = fieldOf();
      const selection = document.getSelection()!;
      const range = document.createRange();
      const text = element.firstChild as Text;
      range.setStart(text, Math.min(offset, text.data.length));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    };
    const caret = (): number => {
      const element = fieldOf();
      const selection = document.getSelection()!;
      if (selection.rangeCount === 0) return -1;
      const live = selection.getRangeAt(0);
      const probe = document.createRange();
      probe.selectNodeContents(element);
      try {
        probe.setEnd(live.startContainer, live.startOffset);
      } catch {
        return -1;
      }
      return probe.toString().length;
    };
    /** What the browser does for one typed character, with the observer pass
     * delivered before the overlay's `input` handler. */
    const typeAhead = (char: string): void => {
      const element = fieldOf();
      const at = caret();
      (element.firstChild as Text).insertData(at, char);
      place(at + char.length);
      runtime.rescan();
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    };

    beforeEach(() => {
      runtime.setMode('edit');
      const element = fieldOf();
      element.focus();
      place('Hello'.length);
      element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    it('leaves the character and the caret exactly where the browser put them', () => {
      typeAhead('!');
      expect(fieldOf().textContent).toBe('Hello!');
      expect(caret()).toBe('Hello!'.length);
      typeAhead('?');
      expect(fieldOf().textContent).toBe('Hello!?');
      expect(caret()).toBe('Hello!?'.length);
    });

    it('still leaves them alone once a value has been posted and not yet echoed', () => {
      typeAhead('!');
      // The debounce flushes: the editor has been told 'Hello!' and has not
      // answered yet, so the field is the overlay's until it does. That must
      // not turn into a licence to re-assert a snapshot over the operator's
      // newer typing.
      vi.advanceTimersByTime(300);
      expect(post).toHaveBeenCalledWith(
        'theme:text-edited',
        expect.objectContaining({ value: 'Hello!' })
      );
      typeAhead('?');
      expect(fieldOf().textContent).toBe('Hello!?');
      expect(caret()).toBe('Hello!?'.length);
    });

    it('survives an echo that arrives only after the next keystroke was posted', () => {
      const stega = (value: string): string =>
        encodeStega(value, { entryId: 'block-1', fieldPath: 'heading', locale: 'en-US' });
      typeAhead('!');
      vi.advanceTimersByTime(300); // posts 'Hello!'
      typeAhead('?');
      vi.advanceTimersByTime(300); // posts 'Hello!?'
      // Only now does the editor's content update for the *first* post arrive —
      // the round trip is bounded by nothing the theme controls, so waiting for
      // the debounce to flush is not enough on its own.
      runtime.acceptExternalUpdate(['block-1']);
      fieldOf().textContent = stega('Hello!');
      runtime.rescan();
      runtime.reconcileExternalDrafts({ 'block-1': { heading: stega('Hello!') } }, ['block-1']);
      expect(fieldOf().textContent).toBe('Hello!?');
      expect(caret()).toBe('Hello!?'.length);
    });
  });

  it('does not pull focus back into the frame when the operator is not in it', () => {
    runtime.setMode('edit');
    const original = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    original.focus();
    original.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    // The operator has moved to Studio's own sidebar: the preview document is
    // no longer the focused one, so a renderer pass that replaces the field
    // must place no focus at all — taking it would close whatever they opened.
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const heading = document.createElement('h2');
    heading.textContent = encodeStega('Hello', {
      entryId: 'block-1',
      fieldPath: 'heading',
      locale: 'en-US',
    });
    original.replaceWith(heading);
    runtime.rescan();

    const replacement = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    expect(replacement).not.toBe(original);
    expect(document.activeElement).not.toBe(replacement);
  });

  it('reconciles an authoritative external scalar into a decorated text node', () => {
    runtime.setMode('edit');
    const heading = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    const text = heading.firstChild;
    heading.focus();

    runtime.acceptExternalUpdate(['block-1']);
    runtime.reconcileExternalDrafts(
      {
        'block-1': {
          heading: encodeStega('Accepted external draft', {
            entryId: 'block-1',
            fieldPath: 'heading',
            locale: 'en-US',
          }),
        },
      },
      ['block-1']
    );

    expect(heading.textContent).toBe('Accepted external draft');
    expect(heading.firstChild).toBe(text);
  });

  it('preserves renderer-owned template text when reconciling its source entry', () => {
    const placement = document.createElement('div');
    placement.setAttribute('data-eldra-template-block', 'guide-hero');
    const heading = document.createElement('h1');
    heading.textContent = encodeStega('Explore Northern Lights', {
      entryId: 'guide-1',
      fieldPath: 'title',
      locale: 'en-US',
    });
    placement.append(heading);
    document.body.append(placement);
    runtime.rescan();

    runtime.reconcileExternalDrafts({ 'guide-1': { title: 'Northern Lights' } }, ['guide-1']);

    expect(heading.textContent).toBe('Explore Northern Lights');
    expect(heading.getAttribute('data-eldra-entry')).toBe('guide-1');
  });

  it('does not traverse prototype keys or replace structured field DOM', () => {
    const heading = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    heading.setAttribute('data-eldra-field', '__proto__.polluted');
    heading.append(document.createElement('strong'));

    runtime.reconcileExternalDrafts({ 'block-1': { heading: 'Unsafe' } }, ['block-1']);

    expect(heading.textContent).toBe('Hello');
    expect(heading.querySelector('strong')).not.toBeNull();
  });

  it('does not resolve an inherited draft entry', () => {
    const heading = document.querySelector('[data-eldra-field="heading"]') as HTMLElement;
    heading.setAttribute('data-eldra-entry', '__proto__');

    runtime.reconcileExternalDrafts({}, ['__proto__']);

    expect(heading.textContent).toBe('Hello');
  });

  it('tracks the selected block and is idempotent across start and stop', () => {
    runtime.start();
    runtime.setSelected('block-1');
    expect(document.querySelectorAll('[data-eldra-overlay-host]')).toHaveLength(1);
    runtime.stop();
    runtime.stop();
    expect(document.querySelector('[data-eldra-overlay-host]')).toBeNull();
  });

  it('selects an exact repeated placement before falling back to entry id', () => {
    const query = vi.spyOn(document, 'querySelector');
    runtime.setSelected('block-1', 'placement-1');
    expect(query).toHaveBeenCalledWith('[data-eldra-layout-node="placement-1"]');
  });

  it('round-trips reusable placement identity without exposing a component id', () => {
    const block = document.querySelector('[data-eldra-block]') as HTMLElement;
    block.setAttribute('data-eldra-layout-node', 'component-node');
    block.setAttribute('data-eldra-reusable-placement', 'footer-a');
    block.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(post).toHaveBeenCalledWith(
      'theme:block-clicked',
      expect.objectContaining({
        entryId: 'block-1',
        layoutNodeId: 'component-node',
        reusablePlacementId: 'footer-a',
      })
    );

    const field = document.querySelector('[data-eldra-field]') as HTMLElement;
    field.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(post).toHaveBeenCalledWith(
      'theme:field-clicked',
      expect.objectContaining({
        layoutNodeId: 'component-node',
        reusablePlacementId: 'footer-a',
      })
    );
    runtime.setMode('edit');
    field.textContent = 'Reusable edit';
    field.dispatchEvent(new InputEvent('input', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(post).toHaveBeenCalledWith(
      'theme:text-edited',
      expect.objectContaining({
        value: 'Reusable edit',
        layoutNodeId: 'component-node',
        reusablePlacementId: 'footer-a',
      })
    );

    const query = vi.spyOn(document, 'querySelector');
    runtime.setSelected('block-1', 'component-node', 'footer-a');
    expect(query).toHaveBeenCalledWith(
      '[data-eldra-layout-node="component-node"][data-eldra-reusable-placement="footer-a"]'
    );
  });

  it('uses Studio primary chrome and hides boxes outside edit mode', () => {
    const host = document.querySelector('[data-eldra-overlay-host]')!;
    // closed shadow root: assert through the runtime's exposed style text
    expect(runtime.chromeStyles()).toContain('#025df3');
    runtime.setMode('edit');
    runtime.setSelected('block-1', 'placement-1');
    expect(runtime.chromeState()).toEqual({
      hover: { display: 'none', rect: { x: 0, y: 0, width: 0, height: 0 } },
      selected: 'block',
      framing: 'none',
      frameRect: { x: 0, y: 0, width: 0, height: 0 },
    });

    // A hover left over from edit mode must not linger through preview, nor
    // resurrect itself when edit mode resumes, before a fresh pointerover.
    const block = document.querySelector('[data-eldra-block]') as HTMLElement;
    block.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(runtime.chromeState()).toEqual({
      hover: { display: 'block', rect: { x: 0, y: 0, width: 0, height: 0 } },
      selected: 'block',
      framing: 'none',
      frameRect: { x: 0, y: 0, width: 0, height: 0 },
    });

    runtime.setMode('preview');
    expect(runtime.chromeState()).toEqual({
      hover: { display: 'none', rect: { x: 0, y: 0, width: 0, height: 0 } },
      selected: 'none',
      framing: 'none',
      frameRect: { x: 0, y: 0, width: 0, height: 0 },
    });

    runtime.setMode('edit');
    expect(runtime.chromeState()).toEqual({
      hover: { display: 'none', rect: { x: 0, y: 0, width: 0, height: 0 } },
      selected: 'block',
      framing: 'none',
      frameRect: { x: 0, y: 0, width: 0, height: 0 },
    });
    expect(host).not.toBeNull();
  });

  it('re-anchors the hover box to the hovered block on scroll instead of leaving it at the pointerover position', () => {
    runtime.setMode('edit');
    const block = document.querySelector('[data-eldra-block]') as HTMLElement;
    block.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(runtime.chromeState().hover.display).toBe('block');

    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 240,
      width: 100,
      height: 40,
      top: 240,
      left: 0,
      right: 100,
      bottom: 280,
      toJSON: () => ({}),
    } as DOMRect);
    window.dispatchEvent(new Event('scroll'));

    expect(runtime.chromeState().hover.rect.y).toBe(240);
  });

  it('re-reports block geometry on scroll, coalescing bursts into one post per frame', () => {
    post.mockClear(); // start() already reported blocks-rendered once; isolate the scroll path
    const block = document.querySelector('[data-eldra-block]') as HTMLElement;
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 240,
      width: 100,
      height: 40,
      top: 240,
      left: 0,
      right: 100,
      bottom: 280,
      toJSON: () => ({}),
    } as DOMRect);

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll')); // second scroll within the same frame must not post again
    expect(post).not.toHaveBeenCalled();

    vi.advanceTimersByTime(16);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('theme:blocks-rendered', {
      blocks: [
        expect.objectContaining({ entryId: 'block-1', rect: expect.objectContaining({ y: 240 }) }),
      ],
    });
  });

  it('draws canvas chrome as an inset box-shadow instead of an outer border', () => {
    expect(runtime.chromeStyles()).toContain('inset 0 0 0 1px #025df3');
    expect(runtime.chromeStyles()).not.toContain('border: 2px');
  });

  it('draws the hover box as a visible dotted outline, not an occluded inset line', () => {
    const styles = runtime.chromeStyles();
    expect(styles).toContain('outline: 1px dotted');
    // The hover rule itself must not also draw the inset 1px line: it sits in
    // the same pixel band as a 1px dotted outline and would occlude the
    // dots, making hover indistinguishable from a solid line.
    const hoverRule = /\.box\.hover\s*\{[^}]*\}/.exec(styles)?.[0] ?? '';
    expect(hoverRule).not.toContain('inset 0 0 0 1px');
  });

  it('draws no glow anywhere — a solid (selected/framing) or dotted (hover) inset line only, so full-bleed chrome is never clipped at the iframe edge', () => {
    const styles = runtime.chromeStyles();
    // No rgba(...) glow color anywhere in the stylesheet.
    expect(styles).not.toMatch(/rgba\(/);
    // Every box-shadow declared is inset — none extends outside the block's
    // own rect (an outer box-shadow on a full-bleed block used to be cut off
    // at the iframe edge).
    const shadows = [...styles.matchAll(/box-shadow:\s*([^;]+);/g)].map((match) =>
      match[1]!.trim()
    );
    expect(shadows.length).toBeGreaterThan(0);
    for (const shadow of shadows) {
      expect(shadow === 'none' || shadow.startsWith('inset')).toBe(true);
    }
    expect(styles).toContain('outline: 1px dotted #025df3');
  });

  it('hides a stale hover box once a rerender detaches the hovered node, on the next scroll', () => {
    runtime.setMode('edit');
    const block = document.querySelector('[data-eldra-block]') as HTMLElement;
    block.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(runtime.chromeState().hover.display).toBe('block');

    const replacement = document.createElement('section');
    replacement.setAttribute('data-eldra-block', 'block-1');
    block.replaceWith(replacement);

    window.dispatchEvent(new Event('scroll'));
    expect(runtime.chromeState().hover.display).toBe('none');
  });

  it('hides the hover box in preview mode and keeps it hidden through a later scroll', () => {
    runtime.setMode('edit');
    const block = document.querySelector('[data-eldra-block]') as HTMLElement;
    block.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(runtime.chromeState().hover.display).toBe('block');

    runtime.setMode('preview');
    expect(runtime.chromeState().hover.display).toBe('none');

    window.dispatchEvent(new Event('scroll'));
    expect(runtime.chromeState().hover.display).toBe('none');
  });

  // --- navigation guard (Studio embed) --------------------------------------
  //
  // Live finding: clicking a navigation item (or any other link) in the
  // embedded preview actually navigated the iframe to the link's page —
  // Studio never sees that, so the operator loses the editor entirely.
  // While the preview bridge is connected (start() through stop()), the
  // theme's own link clicks and form submissions are never allowed to
  // navigate; Studio's own editor:navigate message is the only thing that
  // should move the embedded page.

  it('prevents navigation on a link click while the preview bridge is active, in edit mode', () => {
    runtime.setMode('edit');
    const nav = document.createElement('a');
    nav.href = '/about';
    document.body.appendChild(nav);
    post.mockClear();

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    nav.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(post).not.toHaveBeenCalledWith('theme:route-changed', expect.anything());
  });

  it('prevents navigation on a link click while the preview bridge is active, in preview mode', () => {
    // mode is 'preview' by default — the guard applies to both, not just edit.
    const nav = document.createElement('a');
    nav.href = '/about';
    document.body.appendChild(nav);
    post.mockClear();

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    nav.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(post).not.toHaveBeenCalledWith('theme:route-changed', expect.anything());
  });

  it('prevents navigation regardless of modifier keys or button — a middle click or a ctrl/cmd click included', () => {
    const nav = document.createElement('a');
    nav.href = '/about';
    document.body.appendChild(nav);

    const middleClick = new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 });
    nav.dispatchEvent(middleClick);
    expect(middleClick.defaultPrevented).toBe(true);

    const ctrlClick = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    nav.dispatchEvent(ctrlClick);
    expect(ctrlClick.defaultPrevented).toBe(true);

    const metaClick = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    nav.dispatchEvent(metaClick);
    expect(metaClick.defaultPrevented).toBe(true);
  });

  it('prevents navigation on a real middle click, which the browser fires as auxclick rather than click', () => {
    const nav = document.createElement('a');
    nav.href = '/about';
    document.body.appendChild(nav);

    const auxClick = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    nav.dispatchEvent(auxClick);

    expect(auxClick.defaultPrevented).toBe(true);
  });

  it('prevents navigation for a click on a descendant of a link, not just the anchor element itself', () => {
    const nav = document.createElement('a');
    nav.href = '/about';
    const label = document.createElement('span');
    label.textContent = 'About';
    nav.appendChild(label);
    document.body.appendChild(nav);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    label.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('prevents navigation for any element carrying an href attribute, not just <a> or <area>', () => {
    const weird = document.createElementNS('http://www.w3.org/2000/svg', 'a');
    weird.setAttribute('href', '/somewhere');
    document.body.appendChild(weird);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    weird.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('prevents navigation for a legacy SVG anchor authored with xlink:href instead of a plain href', () => {
    const legacy = document.createElementNS('http://www.w3.org/2000/svg', 'a');
    legacy.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '/legacy-svg-link');
    document.body.appendChild(legacy);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    legacy.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(debug).toHaveBeenCalledWith('[eldra] navigation prevented', '/legacy-svg-link');
    debug.mockRestore();
  });

  it('still posts theme:block-clicked for a click on a link inside a block, after preventing the navigation', () => {
    const block = document.querySelector('[data-eldra-block]') as HTMLElement;
    const link = document.createElement('a');
    link.href = '/wherever';
    link.textContent = 'Link';
    block.appendChild(link);
    post.mockClear();

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(post).toHaveBeenCalledWith(
      'theme:block-clicked',
      expect.objectContaining({ entryId: 'block-1' })
    );
  });

  it('logs which href it prevented, once per click, via console.debug', () => {
    const nav = document.createElement('a');
    nav.href = '/about';
    document.body.appendChild(nav);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    nav.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith('[eldra] navigation prevented', '/about');
    debug.mockRestore();
  });

  it('prevents form submission while the preview bridge is active', () => {
    const form = document.createElement('form');
    document.body.appendChild(form);

    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('does not intercept navigation once the preview bridge is stopped — a plain published page never starts it at all', () => {
    runtime.stop();
    const nav = document.createElement('a');
    nav.href = '/about';
    document.body.appendChild(nav);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    nav.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(false);

    const auxClickEvent = new MouseEvent('auxclick', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    nav.dispatchEvent(auxClickEvent);
    expect(auxClickEvent.defaultPrevented).toBe(false);

    const form = document.createElement('form');
    document.body.appendChild(form);
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(false);
  });
});

describe('rich-text roots (§4.2)', () => {
  let post: Mock<OverlayRuntimeOptions['post']>;
  let runtime: OverlayRuntime;
  let block: HTMLElement;
  let richTextRoot: HTMLElement;
  let paragraph: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    post = vi.fn<OverlayRuntimeOptions['post']>();
    document.body.innerHTML = '';
    block = document.createElement('section');
    block.setAttribute('data-eldra-block', 'block-1');
    block.setAttribute('data-eldra-schema', 'article');
    richTextRoot = document.createElement('div');
    richTextRoot.setAttribute('data-eldra-rich-text', '');
    richTextRoot.setAttribute('data-eldra-field', 'body');
    richTextRoot.setAttribute('data-eldra-entry', 'block-1');
    richTextRoot.setAttribute('data-eldra-locale', 'en-US');
    paragraph = document.createElement('p');
    paragraph.textContent = encodeStega('Rich paragraph', {
      entryId: 'block-1',
      fieldPath: 'body',
      locale: 'en-US',
    });
    richTextRoot.appendChild(paragraph);
    block.appendChild(richTextRoot);
    document.body.appendChild(block);
    runtime = createOverlayRuntime({ post });
    runtime.start();
  });

  afterEach(() => {
    runtime.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not decorate text nodes under a rich-text root or make them contenteditable', () => {
    runtime.setMode('edit');
    // The walker must never wrap the paragraph's stega leaf into its own
    // [data-eldra-field] span: the root is the only field element present.
    expect(richTextRoot.querySelectorAll('[data-eldra-field]')).toHaveLength(0);
    expect(richTextRoot.querySelectorAll('[contenteditable]')).toHaveLength(0);
    // The root itself must not gain contenteditable either, even though it
    // carries data-eldra-field and is swept by setMode's blanket query.
    expect(richTextRoot.getAttribute('contenteditable')).toBeNull();
  });

  it('leaves rich-text root content alone when reconciling external drafts', () => {
    const original = paragraph.textContent;
    runtime.reconcileExternalDrafts(
      {
        'block-1': { body: { type: 'doc', content: [] } as unknown as string },
      },
      ['block-1']
    );
    expect(paragraph.textContent).toBe(original);
  });

  it('mirrors the framing ownership rule: first click selects the block, second posts field-clicked', () => {
    runtime.setMode('edit');

    paragraph.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(post).toHaveBeenCalledWith(
      'theme:block-clicked',
      expect.objectContaining({ entryId: 'block-1' })
    );
    expect(post).not.toHaveBeenCalledWith('theme:field-clicked', expect.anything());

    post.mockClear();
    runtime.setSelected('block-1');
    vi.advanceTimersByTime(16); // flush reposition()'s coalesced reportBlocks()
    post.mockClear();

    paragraph.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(post).toHaveBeenCalledWith(
      'theme:field-clicked',
      expect.objectContaining({
        entryId: 'block-1',
        fieldPath: 'body',
        locale: 'en-US',
      })
    );
    expect(post).not.toHaveBeenCalledWith('theme:block-clicked', expect.anything());
  });

  it('prevents the default action so a link inside the body cannot navigate the iframe', () => {
    runtime.setMode('edit');
    runtime.setSelected('block-1');
    vi.advanceTimersByTime(16);
    const link = document.createElement('a');
    link.href = 'https://example.com/away';
    link.textContent = 'Away';
    paragraph.append(link);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(post).toHaveBeenCalledWith(
      'theme:field-clicked',
      expect.objectContaining({
        entryId: 'block-1',
        fieldPath: 'body',
      })
    );
  });

  it('posts field-clicked in preview mode without requiring selection', () => {
    paragraph.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(post).toHaveBeenCalledWith(
      'theme:field-clicked',
      expect.objectContaining({
        entryId: 'block-1',
        fieldPath: 'body',
        locale: 'en-US',
      })
    );
  });

  it('posts no theme:text-edited for typing inside a mounted editor', () => {
    runtime.setMode('edit');
    post.mockClear();

    paragraph.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(400);

    // The field's value is a TipTap document posted by the theme component as
    // theme:rich-text-edited; the overlay's flattened textContent path must
    // never speak for it.
    expect(post).not.toHaveBeenCalledWith('theme:text-edited', expect.anything());
  });

  it('never makes a rich-text root the activeEdit, so a rescan cannot overwrite the editor DOM', () => {
    runtime.setMode('edit');
    paragraph.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    paragraph.dispatchEvent(new Event('input', { bubbles: true }));

    // The editor keeps typing: its own DOM now differs from whatever the
    // overlay could have remembered.
    paragraph.textContent = 'Rich paragraph, edited';
    runtime.rescan();

    // With the root remembered as activeEdit, restoreEditingFocus would
    // assign `replacement.textContent`, flattening the whole editor subtree.
    expect(richTextRoot.querySelector('p')).toBe(paragraph);
    expect(paragraph.textContent).toBe('Rich paragraph, edited');
  });

  it('clears a stale plain-text edit when focus enters a rich-text root', () => {
    // A second, ordinary stega field in the same block — the sidebar-driven
    // inline-edit path the overlay does own.
    const heading = document.createElement('h2');
    heading.textContent = encodeStega('Headline', {
      entryId: 'block-1',
      fieldPath: 'heading',
      locale: 'en-US',
    });
    block.insertBefore(heading, richTextRoot);
    runtime.rescan();
    runtime.setMode('edit');
    const span = block.querySelector<HTMLElement>('[data-eldra-field="heading"]')!;

    // The operator edits the heading inline, then clicks into the rich-text
    // editor; meanwhile the renderer applies an accepted draft to the heading.
    span.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    span.dispatchEvent(new Event('input', { bubbles: true }));
    span.textContent = 'Headline from the sidebar';
    paragraph.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    runtime.rescan();

    // A surviving activeEdit would restore the remembered value here and pull
    // focus back out of ProseMirror.
    expect(span.textContent).toBe('Headline from the sidebar');
    expect(document.activeElement).not.toBe(span);
  });

  // A mounted in-theme editor rewrites its own subtree on every keystroke.
  // Those batches can never produce decoration work, so the observer must not
  // walk the whole document for them. `createTreeWalker` is the first thing
  // decorateStegaTextNodes does, which makes it an exact probe.
  it('skips the whole-document walk for mutations confined to a rich-text root', async () => {
    const walker = vi.spyOn(document, 'createTreeWalker');

    paragraph.textContent = 'typing inside the editor';
    await flushMutations();

    expect(walker).not.toHaveBeenCalled();
    walker.mockRestore();
  });

  it('still decorates when the same batch also touches something outside', async () => {
    const walker = vi.spyOn(document, 'createTreeWalker');

    paragraph.textContent = 'typing inside the editor';
    const heading = document.createElement('h2');
    heading.textContent = encodeStega('Outside', {
      entryId: 'block-1',
      fieldPath: 'heading',
      locale: 'en-US',
    });
    block.appendChild(heading);
    await flushMutations();

    expect(walker).toHaveBeenCalled();
    expect(heading.getAttribute('data-eldra-field')).toBe('heading');
    walker.mockRestore();
  });
});

/**
 * §18 v3: rich text is edited natively in the theme's own rendered DOM. The
 * theme owns the surface (`contenteditable`) and the reporting — selection as
 * document positions, native text edits it let the browser perform, and the
 * structural or formatting intents it refused — while Studio owns the
 * document, the editor and the toolbar. Everything here lives in theme-core so
 * no framework binding repeats it.
 */
describe('native rich-text editing (§18 v3)', () => {
  let post: Mock<OverlayRuntimeOptions['post']>;
  let runtime: OverlayRuntime;
  let block: HTMLElement;
  let richTextRoot: HTMLElement;
  let paragraph: HTMLElement;
  let heading: HTMLElement;

  /**
   * The body document the fixture renders, and the positions it implies:
   *
   *   heading    pos  0 .. 14   ("Rich heading" is 1..13)
   *   paragraph  pos 14 .. 30   ("Rich " is 15..20, bold "paragraph" 20..29)
   *
   * so the document's content size is 30.
   */
  const BODY_DOC = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Rich heading' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Rich ' },
          { type: 'text', text: 'paragraph', marks: [{ type: 'bold' }] },
        ],
      },
    ],
  };

  /** Every payload posted under `type`, in order. The overlay also posts
   * theme:blocks-rendered from reposition(), so tests filter. */
  function posted(type: string): Record<string, unknown>[] {
    return post.mock.calls
      .filter(([messageType]) => messageType === type)
      .map(([, payload]) => payload as Record<string, unknown>);
  }

  /** The renderer's own tree, as real DOM — the stamps the position helpers
   * read are the renderer's, not the test's invention. */
  function renderInto(parent: Element, children: RichTextRenderChild[]): void {
    for (const child of children) {
      if (typeof child === 'string') {
        parent.appendChild(document.createTextNode(child));
        continue;
      }
      const element = document.createElement(child.tag);
      for (const [name, value] of Object.entries(child.attrs)) element.setAttribute(name, value);
      renderInto(element, child.children);
      parent.appendChild(element);
    }
  }

  function textNodeFor(value: string): Text {
    const walker = document.createTreeWalker(richTextRoot, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node !== null) {
      if ((node as Text).data === value) return node as Text;
      node = walker.nextNode();
    }
    throw new Error(`no text node "${value}"`);
  }

  function select(node: Node, start: number, endNode: Node = node, end = start): void {
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(endNode, end);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /** One rAF-coalesced selection report. */
  function flushSelection(): void {
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(20);
  }

  /**
   * jsdom implements neither `getTargetRanges()` nor `dataTransfer` on an
   * InputEvent, and both are exactly what the classifier reads — so the test
   * supplies them, rather than letting the classifier silently fall back to
   * the document selection on every case.
   */
  function beforeInput(
    inputType: string,
    options: {
      target?: Node;
      ranges?: Array<{
        startContainer: Node;
        startOffset: number;
        endContainer: Node;
        endOffset: number;
      }>;
      data?: string;
      pasted?: string;
    } = {}
  ): InputEvent {
    const event = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType,
      data: options.data ?? null,
    });
    if (options.ranges !== undefined) {
      Object.defineProperty(event, 'getTargetRanges', { value: () => options.ranges });
    }
    if (options.pasted !== undefined) {
      Object.defineProperty(event, 'dataTransfer', {
        value: { getData: (type: string) => (type === 'text/plain' ? options.pasted : '') },
      });
    }
    (options.target ?? richTextRoot).dispatchEvent(event);
    return event;
  }

  function input(inputType: string, data: string | null, target: Node = richTextRoot): void {
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }));
  }

  /** A collapsed range at `offset` inside `node`, the shape getTargetRanges
   * reports for an insertion. */
  function at(
    node: Node,
    offset: number
  ): {
    startContainer: Node;
    startOffset: number;
    endContainer: Node;
    endOffset: number;
  } {
    return { startContainer: node, startOffset: offset, endContainer: node, endOffset: offset };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    post = vi.fn<OverlayRuntimeOptions['post']>();
    document.body.innerHTML = '';
    block = document.createElement('section');
    block.setAttribute('data-eldra-block', 'block-1');
    block.setAttribute('data-eldra-schema', 'article');
    block.setAttribute('data-eldra-layout-node', 'ArticleNode');
    richTextRoot = document.createElement('div');
    richTextRoot.setAttribute('data-eldra-rich-text', '');
    richTextRoot.setAttribute('data-eldra-field', 'body');
    richTextRoot.setAttribute('data-eldra-entry', 'block-1');
    richTextRoot.setAttribute('data-eldra-locale', 'en-US');
    renderInto(richTextRoot, buildRichTextTree(BODY_DOC, { safeHref }));
    heading = richTextRoot.querySelector('h2')!;
    paragraph = richTextRoot.querySelector('p')!;
    block.appendChild(richTextRoot);
    document.body.appendChild(block);
    runtime = createOverlayRuntime({ post });
    runtime.start();
    runtime.setMode('edit');
    runtime.setRichTextEnabled(true);
    runtime.setSelected('block-1', 'ArticleNode');
    // §18 v3: a root only accepts native input once Studio has activated it
    // (data-eldra-rich-text-editing). Every test below exercises the marked,
    // activated root — the "root Studio has not activated" gate itself is
    // covered by its own describe block, further down.
    runtime.setRichTextEditing(target, true);
    post.mockClear();
  });

  afterEach(() => {
    runtime.stop();
    document.getSelection()?.removeAllRanges();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const target = { entryId: 'block-1', fieldPath: 'body', locale: 'en-US' };
  const identity = {
    entryId: 'block-1',
    fieldPath: 'body',
    locale: 'en-US',
    layoutNodeId: 'ArticleNode',
  };
  // jsdom implements Element.getBoundingClientRect with no layout engine, so
  // every element's rect is this zero-filled box.
  const ZERO_ROOT_RECT = { x: 0, y: 0, width: 0, height: 0 };

  // --- the editing surface -------------------------------------------------

  it('makes a rich-text root contenteditable in edit mode with the capability', () => {
    expect(richTextRoot.getAttribute('contenteditable')).toBe('true');
    // The document is Studio's; the browser must not draw squiggles over
    // corrections the theme could never apply.
    expect(richTextRoot.getAttribute('spellcheck')).toBe('false');
  });

  it('never makes one editable without the negotiated capability', () => {
    runtime.setRichTextEnabled(false);

    expect(richTextRoot.hasAttribute('contenteditable')).toBe(false);
    expect(richTextRoot.hasAttribute('spellcheck')).toBe(false);
  });

  it('removes the editing surface when edit mode ends', () => {
    runtime.setMode('preview');

    expect(richTextRoot.hasAttribute('contenteditable')).toBe(false);
    expect(richTextRoot.hasAttribute('spellcheck')).toBe(false);
  });

  it('re-applies the surface to a root a rerender replaced', () => {
    const replacement = richTextRoot.cloneNode(false) as HTMLElement;
    replacement.removeAttribute('contenteditable');
    replacement.removeAttribute('spellcheck');
    renderInto(replacement, buildRichTextTree(BODY_DOC, { safeHref }));
    richTextRoot.replaceWith(replacement);
    richTextRoot = replacement;

    runtime.rescan();

    expect(richTextRoot.getAttribute('contenteditable')).toBe('true');
  });

  it('stop() gives the page back, so a torn-down bridge leaves nothing editable', () => {
    runtime.stop();

    expect(richTextRoot.hasAttribute('contenteditable')).toBe(false);
  });

  // --- edit-mode whitespace rendering (§18 v3 floating toolbar follow-up) --
  //
  // ProseMirror's own stylesheet sets `white-space: pre-wrap` and
  // `word-wrap: break-word` on its editable root so consecutive/trailing
  // spaces render (and take up a line box) exactly as the headless editor
  // sees them; without it, normal `white-space` collapsing let a
  // Backspace-join eat real content and a keystroke land in the previous
  // paragraph, because the DOM's caret position and the document's position
  // had quietly stopped agreeing.

  it('sets white-space: pre-wrap and word-wrap: break-word on an editable rich-text root', () => {
    expect(richTextRoot.style.getPropertyValue('white-space')).toBe('pre-wrap');
    expect(richTextRoot.style.getPropertyValue('word-wrap')).toBe('break-word');
  });

  it('removes exactly those two declarations when edit mode ends', () => {
    runtime.setMode('preview');

    expect(richTextRoot.style.getPropertyValue('white-space')).toBe('');
    expect(richTextRoot.style.getPropertyValue('word-wrap')).toBe('');
  });

  it('removes them when the capability is disabled', () => {
    runtime.setRichTextEnabled(false);

    expect(richTextRoot.style.getPropertyValue('white-space')).toBe('');
    expect(richTextRoot.style.getPropertyValue('word-wrap')).toBe('');
  });

  it('removes them on stop()', () => {
    runtime.stop();

    expect(richTextRoot.style.getPropertyValue('white-space')).toBe('');
    expect(richTextRoot.style.getPropertyValue('word-wrap')).toBe('');
  });

  it('re-applies them to a root a rerender replaced', () => {
    const replacement = richTextRoot.cloneNode(false) as HTMLElement;
    replacement.removeAttribute('contenteditable');
    replacement.removeAttribute('spellcheck');
    renderInto(replacement, buildRichTextTree(BODY_DOC, { safeHref }));
    richTextRoot.replaceWith(replacement);
    richTextRoot = replacement;

    runtime.rescan();

    expect(richTextRoot.style.getPropertyValue('white-space')).toBe('pre-wrap');
    expect(richTextRoot.style.getPropertyValue('word-wrap')).toBe('break-word');
  });

  it('captures and restores a prior inline white-space/word-wrap value, rather than just clearing it', () => {
    // A second placement that already carries its own inline values before
    // the runtime ever marks it editable — e.g. a theme's own styling.
    const second = block.cloneNode(true) as HTMLElement;
    second.setAttribute('data-eldra-layout-node', 'OtherNode');
    const secondRoot = second.querySelector<HTMLElement>('[data-eldra-rich-text]')!;
    secondRoot.style.setProperty('white-space', 'nowrap');
    secondRoot.style.setProperty('word-wrap', 'anywhere');
    document.body.appendChild(second);

    runtime.rescan();

    expect(secondRoot.style.getPropertyValue('white-space')).toBe('pre-wrap');
    expect(secondRoot.style.getPropertyValue('word-wrap')).toBe('break-word');

    runtime.setMode('preview');

    expect(secondRoot.style.getPropertyValue('white-space')).toBe('nowrap');
    expect(secondRoot.style.getPropertyValue('word-wrap')).toBe('anywhere');
  });

  it('does not re-capture the forced value as "prior" across repeated calls while still editable', () => {
    // rescan() (and therefore applyRichTextEditable()) runs again with
    // nothing structurally changed — the forced pre-wrap/break-word must not
    // itself become the "prior" value now stored for restoration.
    runtime.rescan();
    runtime.rescan();

    runtime.setMode('preview');

    expect(richTextRoot.style.getPropertyValue('white-space')).toBe('');
    expect(richTextRoot.style.getPropertyValue('word-wrap')).toBe('');
  });

  it('leaves selection position reporting unaffected by the inline whitespace style', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    expect(posted('theme:rich-text-selection')[0]).toMatchObject({ anchor: 17, head: 17 });
  });

  // --- selection reporting -------------------------------------------------

  it('reports a caret inside a root as document positions, with its block and marks', () => {
    select(textNodeFor('Rich '), 2);

    flushSelection();

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: 17,
        head: 17,
        // jsdom performs no layout and implements no Range.getBoundingClientRect,
        // so there is no caret rect to report; see the bounds test below for the
        // path a real engine takes.
        rect: null,
        // Element.getBoundingClientRect() *is* implemented (zero-filled, no
        // layout engine) — the toolbar's fallback anchor is still reported.
        rootRect: ZERO_ROOT_RECT,
        marks: [],
        block: { type: 'paragraph' },
        revision: 0,
      },
    ]);
  });

  it('reports the caret rect, and drops one a real engine could not have produced', () => {
    const range = document.createRange();
    const rect = { x: 12, y: 340, width: 2, height: 22 };
    vi.spyOn(document, 'createRange').mockReturnValue(range);
    select(textNodeFor('Rich '), 2);
    const selected = document.getSelection()!.getRangeAt(0);
    selected.getBoundingClientRect = () => rect as DOMRect;
    flushSelection();
    expect(posted('theme:rich-text-selection')[0]!.rect).toEqual(rect);

    // §4.3: a rect outside ±1e6 is one Studio would drop, so the theme never
    // sends it — the selection is still worth reporting without it.
    post.mockClear();
    selected.getBoundingClientRect = () => ({ x: 2e6, y: 0, width: 1, height: 1 }) as DOMRect;
    flushSelection();
    expect(posted('theme:rich-text-selection')[0]!.rect).toBeNull();
  });

  it('reports the marks under the caret and the heading level of its block', () => {
    select(textNodeFor('paragraph'), 1);
    flushSelection();
    expect(posted('theme:rich-text-selection')[0]).toMatchObject({
      anchor: 21,
      marks: ['bold'],
      block: { type: 'paragraph' },
    });

    post.mockClear();
    select(textNodeFor('Rich heading'), 0);
    flushSelection();
    expect(posted('theme:rich-text-selection')[0]).toMatchObject({
      anchor: 1,
      marks: [],
      block: { type: 'heading', attrs: { level: 2 } },
    });
  });

  it('reports a range selection as an anchor and a head', () => {
    select(textNodeFor('Rich '), 1, textNodeFor('paragraph'), 4);

    flushSelection();

    expect(posted('theme:rich-text-selection')[0]).toMatchObject({ anchor: 16, head: 24 });
  });

  it('coalesces a burst of selection changes into one report per frame', () => {
    select(textNodeFor('Rich '), 1);
    document.dispatchEvent(new Event('selectionchange'));
    select(textNodeFor('Rich '), 2);
    document.dispatchEvent(new Event('selectionchange'));
    select(textNodeFor('Rich '), 3);
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(20);

    // One report, carrying the selection as it settled.
    expect(posted('theme:rich-text-selection')).toHaveLength(1);
    expect(posted('theme:rich-text-selection')[0]).toMatchObject({ anchor: 18 });
  });

  it('posts exactly one blur when the selection leaves the root', () => {
    select(textNodeFor('Rich '), 1);
    flushSelection();
    post.mockClear();

    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    document.body.appendChild(outside);
    select(outside.firstChild!, 2);
    flushSelection();
    // A second change outside must not post a second blur.
    select(outside.firstChild!, 3);
    flushSelection();

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: null,
        head: null,
        rect: null,
        rootRect: null,
        marks: [],
        block: null,
        revision: 0,
      },
    ]);
  });

  // --- floating toolbar: retained focus with no DOM range -----------------

  it('reports the root at its last positions — not a blur — when the selection loses its range while the root still has focus', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    richTextRoot.focus();
    post.mockClear();

    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: 17,
        head: 17,
        rect: null,
        rootRect: ZERO_ROOT_RECT,
        marks: [],
        block: null,
        revision: 0,
      },
    ]);
  });

  it('reports 0/0 for a root that loses its range with focus before any position was ever reported', () => {
    richTextRoot.focus();
    post.mockClear();

    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: 0,
        head: 0,
        rect: null,
        rootRect: ZERO_ROOT_RECT,
        marks: [],
        block: null,
        revision: 0,
      },
    ]);
  });

  it('still blurs when the selection loses its range and the root does not have focus', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    post.mockClear();
    // Unlike the retained-focus tests above, nothing is focused here — the
    // root never received document focus, so losing the range is a real
    // departure.
    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: null,
        head: null,
        rect: null,
        rootRect: null,
        marks: [],
        block: null,
        revision: 0,
      },
    ]);
  });

  it('re-posts the retained-focus report on scroll, still with no caret rect', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    richTextRoot.focus();
    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(20);
    post.mockClear();

    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: 17,
        head: 17,
        rect: null,
        rootRect: ZERO_ROOT_RECT,
        marks: [],
        block: null,
        revision: 0,
      },
    ]);
  });

  it('re-posts the retained-focus report on scroll when the selection sits outside every root but the root is still focused', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    richTextRoot.focus();
    // The Selection API and document focus are independent: moving the
    // Range to a node outside every root (unlike removeAllRanges()) does
    // not itself move document.activeElement away from the root.
    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    document.body.appendChild(outside);
    select(outside.firstChild!, 2);
    flushSelection();
    expect(document.activeElement).toBe(richTextRoot);
    post.mockClear();

    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: 17,
        head: 17,
        rect: null,
        rootRect: ZERO_ROOT_RECT,
        marks: [],
        block: null,
        revision: 0,
      },
    ]);
  });

  it('reports nothing in preview mode or without the capability', () => {
    select(textNodeFor('Rich '), 1);
    runtime.setMode('preview');
    flushSelection();
    expect(posted('theme:rich-text-selection')).toHaveLength(0);

    runtime.setMode('edit');
    runtime.setRichTextEnabled(false);
    select(textNodeFor('Rich '), 1);
    flushSelection();
    expect(posted('theme:rich-text-selection')).toHaveLength(0);
  });

  // --- floating toolbar: re-post while editing on scroll/resize/rescan -----

  it('re-posts the selection on scroll while editing, coalesced to one post per frame, with unchanged positions/revision and current rects', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    post.mockClear();

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll')); // second scroll within the same frame must not post again
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: 17,
        head: 17,
        rect: null,
        rootRect: ZERO_ROOT_RECT,
        marks: [],
        block: { type: 'paragraph' },
        revision: 0,
      },
    ]);
  });

  it('re-posts the selection on resize while editing', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    post.mockClear();

    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toHaveLength(1);
  });

  it('re-posts the selection after rescan(), coalesced through the same frame as reposition()', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    post.mockClear();

    runtime.rescan();
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toHaveLength(1);
  });

  it('does not re-post on scroll when no root is being edited', () => {
    runtime.setRichTextEditing(target, false);
    select(textNodeFor('Rich '), 2);
    flushSelection();
    post.mockClear();

    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toHaveLength(0);
  });

  it('does not re-post on scroll when the current selection is outside the root being edited', () => {
    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    document.body.appendChild(outside);
    select(outside.firstChild!, 2);
    flushSelection();
    post.mockClear();

    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);

    expect(posted('theme:rich-text-selection')).toHaveLength(0);
  });

  // --- classification ------------------------------------------------------

  it('classifies a keystroke inside one text run as native', () => {
    const text = textNodeFor('Rich ');
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'a' });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [at(text, 2)] });

    expect(classifyBeforeInput(event, richTextRoot)).toEqual({ kind: 'native', from: 17, to: 17 });
  });

  it('classifies a deletion that crosses a block boundary as a command', () => {
    // Backspace at the start of the paragraph: the browser reports a target
    // range reaching back into the heading, which is a join, not a text edit.
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward' });
    Object.defineProperty(event, 'getTargetRanges', {
      value: () => [
        {
          startContainer: textNodeFor('Rich heading'),
          startOffset: 12,
          endContainer: textNodeFor('Rich '),
          endOffset: 0,
        },
      ],
    });

    expect(classifyBeforeInput(event, richTextRoot)).toEqual({
      kind: 'command',
      from: 13,
      to: 15,
      name: 'deleteContentBackward',
    });
  });

  it('classifies a selection spanning a mark boundary as a command, not a text edit', () => {
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x' });
    Object.defineProperty(event, 'getTargetRanges', {
      value: () => [
        {
          startContainer: textNodeFor('Rich '),
          startOffset: 1,
          endContainer: textNodeFor('paragraph'),
          endOffset: 3,
        },
      ],
    });

    // Same block, but replacing it natively would rewrite the mark structure
    // the theme cannot describe. §18 v3 has no `insertText` command, and the
    // one that means "replace from..to with this plain text" is insertFromPaste
    // — so the keystroke becomes that rather than being swallowed.
    expect(classifyBeforeInput(event, richTextRoot)).toEqual({
      kind: 'command',
      from: 16,
      to: 23,
      name: 'insertFromPaste',
    });
  });

  it('forwards a keystroke over a multi-run selection as an insertFromPaste of that character', () => {
    const event = beforeInput('insertText', {
      data: 'x',
      ranges: [
        {
          startContainer: textNodeFor('Rich '),
          startOffset: 1,
          endContainer: textNodeFor('paragraph'),
          endOffset: 3,
        },
      ],
    });

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toEqual([
      {
        ...identity,
        name: 'insertFromPaste',
        from: 16,
        to: 23,
        text: 'x',
        revision: 1,
      },
    ]);
  });

  it('ignores a range outside the root', () => {
    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    document.body.appendChild(outside);
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'a' });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [at(outside.firstChild!, 1)] });

    expect(classifyBeforeInput(event, richTextRoot)).toEqual({ kind: 'ignore', from: 0, to: 0 });
  });

  // --- native text ops -----------------------------------------------------

  it('lets a keystroke run natively and posts one input op on the following input event', () => {
    const text = textNodeFor('Rich ');
    const event = beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'a' });

    // The caret stays in the theme: nothing is prevented.
    expect(event.defaultPrevented).toBe(false);
    expect(posted('theme:rich-text-command')).toHaveLength(0);
    expect(posted('theme:rich-text-input')).toHaveLength(0);

    text.data = 'Rica h ';
    input('insertText', 'a', text);

    expect(posted('theme:rich-text-input')).toEqual([
      {
        ...identity,
        from: 17,
        to: 17,
        text: 'a',
        revision: 1,
      },
    ]);
  });

  it('posts a deletion with an empty text', () => {
    const text = textNodeFor('Rich ');
    beforeInput('deleteContentBackward', {
      target: text,
      ranges: [{ startContainer: text, startOffset: 1, endContainer: text, endOffset: 2 }],
    });
    input('deleteContentBackward', null, text);

    expect(posted('theme:rich-text-input')).toEqual([
      {
        ...identity,
        from: 16,
        to: 17,
        text: '',
        revision: 1,
      },
    ]);
  });

  it('increments the revision once per op', () => {
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { target: text, ranges: [at(text, 1)], data: 'a' });
    input('insertText', 'a', text);
    beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'b' });
    input('insertText', 'b', text);

    expect(posted('theme:rich-text-input').map((op) => op.revision)).toEqual([1, 2]);
  });

  it('posts nothing on an input event the classifier never accepted', () => {
    input('insertText', 'a', textNodeFor('Rich '));

    expect(posted('theme:rich-text-input')).toHaveLength(0);
  });

  it('posts a composition once, on compositionend, against the range it started from', () => {
    const text = textNodeFor('Rich ');
    select(text, 2);
    text.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    // Intermediate composition keystrokes must stay silent.
    beforeInput('insertCompositionText', { target: text, ranges: [at(text, 2)], data: 'に' });
    input('insertCompositionText', 'に', text);
    expect(posted('theme:rich-text-input')).toHaveLength(0);

    text.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'にほん' }));

    expect(posted('theme:rich-text-input')).toEqual([
      {
        ...identity,
        from: 17,
        to: 17,
        text: 'にほん',
        revision: 1,
      },
    ]);
  });

  // --- commands ------------------------------------------------------------

  it('prevents and forwards Enter as insertParagraph', () => {
    const text = textNodeFor('Rich ');
    const event = beforeInput('insertParagraph', { target: text, ranges: [at(text, 2)] });

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toEqual([
      {
        ...identity,
        name: 'insertParagraph',
        from: 17,
        to: 17,
        revision: 1,
      },
    ]);
    // A command is not a text op, so the input that never comes posts nothing.
    expect(posted('theme:rich-text-input')).toHaveLength(0);
  });

  it('prevents and forwards a mark shortcut', () => {
    const text = textNodeFor('Rich ');
    const event = beforeInput('formatBold', {
      target: text,
      ranges: [{ startContainer: text, startOffset: 0, endContainer: text, endOffset: 4 }],
    });

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toEqual([
      {
        ...identity,
        name: 'formatBold',
        from: 15,
        to: 19,
        revision: 1,
      },
    ]);
  });

  it('forwards a paste with its plain text and nothing else', () => {
    const text = textNodeFor('Rich ');
    const event = beforeInput('insertFromPaste', {
      target: text,
      ranges: [at(text, 2)],
      pasted: 'pasted copy',
    });

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toEqual([
      {
        ...identity,
        name: 'insertFromPaste',
        from: 17,
        to: 17,
        text: 'pasted copy',
        revision: 1,
      },
    ]);
  });

  it('forwards undo and redo rather than letting the browser do it', () => {
    const text = textNodeFor('Rich ');
    const undo = beforeInput('historyUndo', { target: text, ranges: [at(text, 2)] });
    const redo = beforeInput('historyRedo', { target: text, ranges: [at(text, 2)] });

    expect(undo.defaultPrevented).toBe(true);
    expect(redo.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command').map((command) => command.name)).toEqual([
      'historyUndo',
      'historyRedo',
    ]);
  });

  it('neither prevents nor posts without the capability', () => {
    runtime.setRichTextEnabled(false);
    const text = textNodeFor('Rich ');

    const event = beforeInput('insertParagraph', { target: text, ranges: [at(text, 2)] });

    expect(event.defaultPrevented).toBe(false);
    expect(posted('theme:rich-text-command')).toHaveLength(0);
  });

  // --- applied -------------------------------------------------------------

  /** The selection restore runs on a microtask, after a framework binding has
   * had its chance to re-render the field it was just handed back. */
  async function flushRestore(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('leaves the DOM and the caret alone when applied confirms its own native op', async () => {
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'a' });
    text.data = 'Riach ';
    input('insertText', 'a', text);
    select(text, 3);
    const markup = richTextRoot.innerHTML;

    runtime.acceptRichTextApplied({
      ...target,
      revision: 1,
      anchor: 18,
      head: 18,
      rerender: false,
    });
    await flushRestore();

    expect(richTextRoot.innerHTML).toBe(markup);
    const selection = document.getSelection()!;
    expect(selection.focusNode).toBe(text);
    expect(selection.focusOffset).toBe(3);
  });

  it('keeps the field deferred across a confirming ack, and across the later one', () => {
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'a' });
    input('insertText', 'a', text);
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);

    // Studio acks the op itself...
    runtime.acceptRichTextApplied({
      ...target,
      revision: 1,
      anchor: 18,
      head: 18,
      rerender: false,
    });
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);

    // ...and acks its debounced write's content update the same way, ~450ms
    // later. The theme's DOM is still the right one; the deferral has to
    // survive both or the binding would replace it mid-word.
    runtime.acceptRichTextApplied({
      ...target,
      revision: 1,
      anchor: 18,
      head: 18,
      rerender: false,
    });
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);
  });

  it('keeps the field deferred when a confirming ack lags behind a newer op', () => {
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { target: text, ranges: [at(text, 1)], data: 'a' });
    input('insertText', 'a', text);
    beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'b' });
    input('insertText', 'b', text);

    runtime.acceptRichTextApplied({
      ...target,
      revision: 1,
      anchor: 17,
      head: 17,
      rerender: false,
    });

    // Revision 2 is still in flight: releasing here would re-render the field
    // the operator is still typing into.
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);
  });

  it('releases the field and restores the selection when applied asks for a re-render', async () => {
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'a' });
    input('insertText', 'a', text);
    // A re-render replaced the nodes the caret lived in.
    select(heading.firstChild!, 0);

    runtime.acceptRichTextApplied({
      ...target,
      revision: 1,
      anchor: 17,
      head: 17,
      rerender: true,
    });
    expect(runtime.isRichTextRenderDeferred(target)).toBe(false);
    await flushRestore();

    const selection = document.getSelection()!;
    expect(selection.focusNode).toBe(textNodeFor('Rich '));
    expect(selection.focusOffset).toBe(2);
  });

  it('releases the field when Studio acks from ahead of the theme', async () => {
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'a' });
    input('insertText', 'a', text);
    select(heading.firstChild!, 0);

    // A revision the theme never posted: Studio re-seeded the document from
    // the draft (undo, conflict reload) and the theme's DOM is behind.
    runtime.acceptRichTextApplied({
      ...target,
      revision: 9,
      anchor: 21,
      head: 21,
      rerender: false,
    });
    expect(runtime.isRichTextRenderDeferred(target)).toBe(false);
    await flushRestore();

    expect(document.getSelection()!.focusNode).toBe(textNodeFor('paragraph'));
  });

  it('restores the selection for a field that was never deferred', async () => {
    select(heading.firstChild!, 0);

    runtime.acceptRichTextApplied({
      ...target,
      revision: 99,
      anchor: 21,
      head: 24,
      rerender: false,
    });
    await flushRestore();

    const selection = document.getSelection()!;
    expect(selection.anchorNode).toBe(textNodeFor('paragraph'));
    expect(selection.anchorOffset).toBe(1);
    expect(selection.focusOffset).toBe(4);
  });

  it('drops an applied whose positions are out of bounds or whose field is gone', async () => {
    select(heading.firstChild!, 0);

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: -1, head: 0, rerender: true });
    runtime.acceptRichTextApplied({
      ...target,
      revision: 1,
      anchor: 2e6,
      head: 2e6,
      rerender: true,
    });
    runtime.acceptRichTextApplied({
      ...target,
      fieldPath: 'gone',
      revision: 1,
      anchor: 1,
      head: 1,
      rerender: true,
    });
    await flushRestore();

    const selection = document.getSelection()!;
    expect(selection.focusNode).toBe(heading.firstChild);
    expect(selection.focusOffset).toBe(0);
  });

  // --- retained-focus beforeinput: queued intent (§18 v3 floating toolbar
  // follow-up) ---------------------------------------------------------------
  //
  // Live round 9 finding: an Enter (or any keystroke) that arrives between
  // the theme's own content-update re-render and Studio's
  // editor:rich-text-applied restoring the caret finds the root focused but
  // no resolvable selection at all — classifyBeforeInput returns the shared
  // IGNORED verdict, and the keystroke used to be silently lost. It is now
  // queued and flushed once restoreRichTextSelection actually places a
  // selection again.

  it('queues the command instead of losing it when the root is focused but the selection is unresolvable, and flushes it once the selection is restored', async () => {
    richTextRoot.focus();
    document.getSelection()!.removeAllRanges();

    const event = beforeInput('insertParagraph', {});

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toHaveLength(0);
    expect(posted('theme:rich-text-input')).toHaveLength(0);

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 14, head: 14, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toEqual([
      {
        ...identity,
        name: 'insertParagraph',
        from: 14,
        to: 14,
        revision: 1,
      },
    ]);
  });

  it('queues insertFromPaste with the typed character for a plain insertText in the same state', async () => {
    richTextRoot.focus();
    document.getSelection()!.removeAllRanges();

    const event = beforeInput('insertText', { data: 'Q' });

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toHaveLength(0);

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 14, head: 14, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toEqual([
      {
        ...identity,
        name: 'insertFromPaste',
        from: 14,
        to: 14,
        text: 'Q',
        revision: 1,
      },
    ]);
  });

  it('queues a native insertFromPaste with its dataTransfer text, not event.data, in the same state', async () => {
    richTextRoot.focus();
    document.getSelection()!.removeAllRanges();

    const event = beforeInput('insertFromPaste', { pasted: 'pasted text' });

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toHaveLength(0);

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 14, head: 14, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toEqual([
      {
        ...identity,
        name: 'insertFromPaste',
        from: 14,
        to: 14,
        text: 'pasted text',
        revision: 1,
      },
    ]);
  });

  it('queues nothing for an HTML-only paste (empty text/plain) in the same state, mirroring the ordinary guard', async () => {
    richTextRoot.focus();
    document.getSelection()!.removeAllRanges();

    const event = beforeInput('insertFromPaste', { pasted: '' });

    expect(event.defaultPrevented).toBe(true);

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 14, head: 14, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toHaveLength(0);
  });

  it('flushes two structural inputs from the retained-focus window one at a time, only after each is acked (round 11: serialized, not batched)', async () => {
    richTextRoot.focus();
    document.getSelection()!.removeAllRanges();

    beforeInput('insertParagraph', {});
    beforeInput('insertLineBreak', {});

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 14, head: 14, rerender: true });
    await flushRestore();

    // Only the first posts: Studio applies theme:rich-text-command literally
    // at from/to with no position tracking between messages, so a second one
    // at the same (by-then stale) position would land wrong.
    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertParagraph', from: 14, to: 14, revision: 1 },
    ]);

    // Studio's applied for the insertParagraph just posted (revision 1) —
    // the restore it triggers is what flushes the next queued entry, at the
    // positions *this* restore places the caret at.
    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 21, head: 21, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertParagraph', from: 14, to: 14, revision: 1 },
      { ...identity, name: 'insertLineBreak', from: 21, to: 21, revision: 2 },
    ]);
  });

  it('releases the next queued entry on an applied at or beyond the awaited revision, not just an exact match (round 12)', async () => {
    richTextRoot.focus();
    document.getSelection()!.removeAllRanges();

    // Six entries queued while retained-focus holds; the flushes below walk
    // the buffer down to awaitingRevision 5, with one entry (the sixth) left.
    beforeInput('insertParagraph', {});
    beforeInput('insertLineBreak', {});
    beforeInput('insertParagraph', {});
    beforeInput('insertLineBreak', {});
    beforeInput('insertParagraph', {});
    beforeInput('insertLineBreak', {});

    // Bootstrap: awaitingRevision is null, so any ack posts the first entry.
    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 14, head: 14, rerender: true });
    await flushRestore();
    // Exact-match acks walk the buffer down normally.
    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 16, head: 16, rerender: true });
    await flushRestore();
    runtime.acceptRichTextApplied({ ...target, revision: 2, anchor: 18, head: 18, rerender: true });
    await flushRestore();
    runtime.acceptRichTextApplied({ ...target, revision: 3, anchor: 20, head: 20, rerender: true });
    await flushRestore();
    runtime.acceptRichTextApplied({ ...target, revision: 4, anchor: 22, head: 22, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertParagraph', from: 14, to: 14, revision: 1 },
      { ...identity, name: 'insertLineBreak', from: 16, to: 16, revision: 2 },
      { ...identity, name: 'insertParagraph', from: 18, to: 18, revision: 3 },
      { ...identity, name: 'insertLineBreak', from: 20, to: 20, revision: 4 },
      { ...identity, name: 'insertParagraph', from: 22, to: 22, revision: 5 },
    ]);

    // Studio's self-heal path can answer with its current revision rather
    // than the one this buffer is awaiting (5): a stale ack (4, behind it)
    // must not release the sixth entry.
    runtime.acceptRichTextApplied({ ...target, revision: 4, anchor: 24, head: 24, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toHaveLength(5);

    // An ack at or beyond the awaited revision (6, ahead of 5) means Studio
    // has moved past the op this buffer was waiting on — release the next
    // entry, at the positions this restore places the caret at.
    runtime.acceptRichTextApplied({ ...target, revision: 6, anchor: 26, head: 26, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertParagraph', from: 14, to: 14, revision: 1 },
      { ...identity, name: 'insertLineBreak', from: 16, to: 16, revision: 2 },
      { ...identity, name: 'insertParagraph', from: 18, to: 18, revision: 3 },
      { ...identity, name: 'insertLineBreak', from: 20, to: 20, revision: 4 },
      { ...identity, name: 'insertParagraph', from: 22, to: 22, revision: 5 },
      { ...identity, name: 'insertLineBreak', from: 26, to: 26, revision: 6 },
    ]);
  });

  it('flushes nothing when the field blurs before the restore arrives', async () => {
    richTextRoot.focus();
    document.getSelection()!.removeAllRanges();
    beforeInput('insertParagraph', {});

    // A real blur: focus leaves the root for an in-document element outside
    // it, before Studio's ack ever arrives.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    richTextRoot.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside })
    );

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 14, head: 14, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toHaveLength(0);
  });

  it('flushes nothing when the field is deactivated before the restore arrives', async () => {
    richTextRoot.focus();
    document.getSelection()!.removeAllRanges();
    beforeInput('insertParagraph', {});

    runtime.setRichTextEditing(target, false);

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 14, head: 14, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toHaveLength(0);
  });

  it('leaves ordinary typing (a resolvable selection) untouched', () => {
    const text = textNodeFor('Rich ');
    const event = beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'a' });

    expect(event.defaultPrevented).toBe(false);
    expect(posted('theme:rich-text-command')).toHaveLength(0);

    text.data = 'Rica h ';
    input('insertText', 'a', text);

    expect(posted('theme:rich-text-input')).toEqual([
      {
        ...identity,
        from: 17,
        to: 17,
        text: 'a',
        revision: 1,
      },
    ]);
    expect(posted('theme:rich-text-command')).toHaveLength(0);
  });

  // --- click-then-type on an unmarked root: queued buffer (round 10) -------
  //
  // Live round 10 finding: typing immediately after clicking into a
  // rich-text root lost the keystrokes — the root is document.activeElement
  // but not yet marked data-eldra-rich-text-editing (Studio's
  // editor:rich-text-editing echo arrives ~14ms later), so the unmarked-root
  // guard prevented every beforeinput and only re-posted the selection.
  // Same class as round 7/8's toolbar-then-Enter gap; the fix generalizes
  // that single-slot mechanism into the same ordered, per-field buffer,
  // flushed either when the root is marked (here) or when
  // restoreRichTextSelection places a selection (round 7), whichever comes
  // first.

  it('coalesces a click-then-type burst of plain characters into one insertFromPaste (round 11), reposting the selection once, flushed on mark', () => {
    runtime.setRichTextEditing(target, false);
    richTextRoot.focus();
    select(textNodeFor('Rich '), 2);
    post.mockClear();

    const eventA = beforeInput('insertText', { data: 'a' });
    const eventB = beforeInput('insertText', { data: 'b' });
    const eventC = beforeInput('insertText', { data: 'c' });

    expect(eventA.defaultPrevented).toBe(true);
    expect(eventB.defaultPrevented).toBe(true);
    expect(eventC.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toHaveLength(0);
    // Re-posted once for the whole run, not once per key.
    expect(posted('theme:rich-text-selection')).toHaveLength(1);

    runtime.setRichTextEditing(target, true);

    // One command, not three: Studio applies theme:rich-text-command
    // literally at from/to with no position tracking between messages, so
    // three one-character commands flushed one at a time would each land at
    // the same (by-then stale) position and reverse the typed order
    // ("a","b","c" -> "cba"). Coalescing while queuing keeps a run of plain
    // typed characters as the single edit the operator actually made.
    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertFromPaste', from: 17, to: 17, text: 'abc', revision: 1 },
    ]);
  });

  it('flushes a, Enter, b one at a time — the first on mark, each next only after Studio applies and restores the one before it', async () => {
    runtime.setRichTextEditing(target, false);
    richTextRoot.focus();
    select(textNodeFor('Rich '), 2);
    post.mockClear();

    // The insertParagraph in the middle ends the coalescing run: "a" and "b"
    // stay two separate entries either side of it, not one "ab".
    beforeInput('insertText', { data: 'a' });
    beforeInput('insertParagraph', {});
    beforeInput('insertText', { data: 'b' });

    runtime.setRichTextEditing(target, true);

    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertFromPaste', from: 17, to: 17, text: 'a', revision: 1 },
    ]);

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 18, head: 18, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertFromPaste', from: 17, to: 17, text: 'a', revision: 1 },
      { ...identity, name: 'insertParagraph', from: 18, to: 18, revision: 2 },
    ]);

    runtime.acceptRichTextApplied({ ...target, revision: 2, anchor: 21, head: 21, rerender: true });
    await flushRestore();

    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertFromPaste', from: 17, to: 17, text: 'a', revision: 1 },
      { ...identity, name: 'insertParagraph', from: 18, to: 18, revision: 2 },
      { ...identity, name: 'insertFromPaste', from: 21, to: 21, text: 'b', revision: 3 },
    ]);
  });

  it('queues Enter (insertParagraph) in the same unmarked-root window', () => {
    runtime.setRichTextEditing(target, false);
    richTextRoot.focus();
    select(textNodeFor('Rich '), 2);
    post.mockClear();

    const event = beforeInput('insertParagraph', {});
    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toHaveLength(0);

    runtime.setRichTextEditing(target, true);

    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertParagraph', from: 17, to: 17, revision: 1 },
    ]);
  });

  it('flushes nothing when the field blurs before the root is ever marked', () => {
    runtime.setRichTextEditing(target, false);
    richTextRoot.focus();
    select(textNodeFor('Rich '), 2);
    beforeInput('insertText', { data: 'a' });
    post.mockClear();

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    richTextRoot.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside })
    );

    runtime.setRichTextEditing(target, true);

    expect(posted('theme:rich-text-command')).toHaveLength(0);
  });

  it('does nothing when the root is marked before the operator ever types (Studio-first)', () => {
    runtime.setRichTextEditing(target, false);
    richTextRoot.focus();
    select(textNodeFor('Rich '), 2);
    post.mockClear();

    runtime.setRichTextEditing(target, true);

    expect(posted('theme:rich-text-command')).toHaveLength(0);
  });

  it('caps the buffer at 64 entries, dropping the oldest with one debug line per drop', () => {
    runtime.setRichTextEditing(target, false);
    richTextRoot.focus();
    select(textNodeFor('Rich '), 2);
    post.mockClear();
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // A real paste (inputType insertFromPaste, not insertText) never
    // coalesces with its neighbors — unlike round 10's cap test, 65 plain
    // typed characters would now coalesce into a single entry and never
    // reach the cap at all, so 65 distinct pastes exercise it instead.
    for (let i = 0; i < 65; i += 1) {
      beforeInput('insertFromPaste', { pasted: String(i) });
    }

    expect(debug).toHaveBeenCalledTimes(1);
    debug.mockRestore();

    runtime.setRichTextEditing(target, true);

    // Only the oldest surviving entry (i === 1 — i === 0 was dropped) posts;
    // round 11 flushes one at a time, not the whole buffer, so this is also
    // proof the cap kept the *order* of the 64 survivors, not just the count.
    expect(posted('theme:rich-text-command')).toEqual([
      { ...identity, name: 'insertFromPaste', from: 17, to: 17, text: '1', revision: 1 },
    ]);
  });

  // --- deferred rendering --------------------------------------------------

  it('defers the field from the first native op, and says so exactly once', () => {
    const changes: unknown[] = [];
    runtime.onRichTextRenderState((change) => changes.push(change));
    const text = textNodeFor('Rich ');

    expect(runtime.isRichTextRenderDeferred(target)).toBe(false);
    beforeInput('insertText', { target: text, ranges: [at(text, 1)], data: 'a' });
    input('insertText', 'a', text);
    beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'b' });
    input('insertText', 'b', text);

    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);
    // Deferring is a state, not an event stream: the second op does not
    // re-announce it.
    expect(changes).toEqual([{ ...identity, deferred: true }]);
  });

  it('is deferred per field, not per theme', () => {
    const other = richTextRoot.cloneNode(true) as HTMLElement;
    other.setAttribute('data-eldra-field', 'summary');
    block.appendChild(other);
    runtime.rescan();
    const text = textNodeFor('Rich ');

    beforeInput('insertText', { target: text, ranges: [at(text, 1)], data: 'a' });
    input('insertText', 'a', text);

    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);
    expect(runtime.isRichTextRenderDeferred({ ...target, fieldPath: 'summary' })).toBe(false);
    expect(runtime.isRichTextRenderDeferred({ ...target, locale: 'is-IS' })).toBe(false);
  });

  it('hands the field back when a command takes over', () => {
    const changes: Array<{ deferred: boolean }> = [];
    runtime.onRichTextRenderState((change) => changes.push(change));
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { target: text, ranges: [at(text, 1)], data: 'a' });
    input('insertText', 'a', text);

    // Studio performs a command, so its result must be rendered.
    beforeInput('insertParagraph', { target: text, ranges: [at(text, 2)] });

    expect(runtime.isRichTextRenderDeferred(target)).toBe(false);
    expect(changes.map((change) => change.deferred)).toEqual([true, false]);
  });

  it.each([
    [
      'the caret leaves the root',
      (): void => {
        const outside = document.createElement('p');
        outside.textContent = 'elsewhere';
        document.body.appendChild(outside);
        select(outside.firstChild!, 1);
        flushSelection();
      },
    ],
    [
      'Studio closes the editor',
      (): void => {
        runtime.setRichTextEditing(target, false);
      },
    ],
    [
      'edit mode ends',
      (): void => {
        runtime.setMode('preview');
      },
    ],
    [
      'the capability closes',
      (): void => {
        runtime.setRichTextEnabled(false);
      },
    ],
    [
      'the bridge is torn down',
      (): void => {
        runtime.stop();
      },
    ],
  ])('hands the field back when %s', (_name, end) => {
    const text = textNodeFor('Rich ');
    select(text, 1);
    flushSelection();
    beforeInput('insertText', { target: text, ranges: [at(text, 1)], data: 'a' });
    input('insertText', 'a', text);
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);

    end();

    expect(runtime.isRichTextRenderDeferred(target)).toBe(false);
  });

  it('keeps the deferral when a command is classified but nothing is posted', () => {
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { ranges: [at(text, 2)], data: 'a' });
    input('insertText', 'a', richTextRoot);
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);
    post.mockClear();

    // An HTML-only paste mid-typing: prevented, but nothing goes out.
    const event = beforeInput('insertFromPaste', { ranges: [at(text, 3)], pasted: '' });

    expect(event.defaultPrevented).toBe(true);
    expect(post).not.toHaveBeenCalled();
    // Handing the field back over a message nobody sent would let the next
    // content update replace the DOM the operator is still typing into.
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);
  });

  it('releases only the field Studio closes, not every field on the page', () => {
    const second = block.cloneNode(true) as HTMLElement;
    second.setAttribute('data-eldra-layout-node', 'OtherNode');
    document.body.appendChild(second);
    runtime.rescan();
    const secondRoot = second.querySelector<HTMLElement>('[data-eldra-rich-text]')!;
    const other = { ...target, layoutNodeId: 'OtherNode' };
    const here = { ...target, layoutNodeId: 'ArticleNode' };

    const text = textNodeFor('Rich ');
    beforeInput('insertText', { ranges: [at(text, 2)], data: 'a' });
    input('insertText', 'a', richTextRoot);
    const otherText = secondRoot.querySelector('p')!.firstChild as Text;
    beforeInput('insertText', { target: secondRoot, ranges: [at(otherText, 2)], data: 'b' });
    input('insertText', 'b', secondRoot);
    expect(runtime.isRichTextRenderDeferred(here)).toBe(true);
    expect(runtime.isRichTextRenderDeferred(other)).toBe(true);

    runtime.setRichTextEditing(here, false);

    expect(runtime.isRichTextRenderDeferred(here)).toBe(false);
    // The other placement is still being typed into.
    expect(runtime.isRichTextRenderDeferred(other)).toBe(true);
  });

  it('releases the field it is leaving when Studio moves to another one', () => {
    const second = block.cloneNode(true) as HTMLElement;
    second.setAttribute('data-eldra-layout-node', 'OtherNode');
    document.body.appendChild(second);
    runtime.rescan();
    const here = { ...target, layoutNodeId: 'ArticleNode' };
    const other = { ...target, layoutNodeId: 'OtherNode' };
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { ranges: [at(text, 2)], data: 'a' });
    input('insertText', 'a', richTextRoot);
    runtime.setRichTextEditing(here, true);

    runtime.setRichTextEditing(other, true);

    expect(runtime.isRichTextRenderDeferred(here)).toBe(false);
    expect(second.querySelector('[data-eldra-rich-text-editing]')).not.toBeNull();
  });

  it('releases only the named field when the target cannot be resolved', () => {
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { ranges: [at(text, 2)], data: 'a' });
    input('insertText', 'a', richTextRoot);

    // A field this page does not render: the mark goes, and so does that
    // field's deferral — but this one is untouched.
    runtime.setRichTextEditing({ ...target, fieldPath: 'gone' }, true);

    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);
  });

  it('releases a deferral whose root has gone, so it cannot outlive it', () => {
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { ranges: [at(text, 2)], data: 'a' });
    input('insertText', 'a', richTextRoot);
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);

    // The block navigated away; the ack arrives afterwards and names no
    // placement, so nothing is keyed to it any more.
    richTextRoot.remove();
    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 2, head: 2, rerender: true });

    expect(runtime.isRichTextRenderDeferred(target)).toBe(false);
  });

  it('stops notifying an unsubscribed listener', () => {
    const changes: unknown[] = [];
    const unsubscribe = runtime.onRichTextRenderState((change) => changes.push(change));
    unsubscribe();
    const text = textNodeFor('Rich ');

    beforeInput('insertText', { target: text, ranges: [at(text, 1)], data: 'a' });
    input('insertText', 'a', text);

    expect(changes).toEqual([]);
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);
  });

  // --- fail closed ---------------------------------------------------------

  it.each([
    'deleteByDrag',
    'deleteSoftLineBackward',
    'deleteSoftLineForward',
    'deleteHardLineBackward',
    'deleteHardLineForward',
    'insertTranspose',
    'insertOrderedList',
    'insertUnorderedList',
    'formatFontName',
    'formatJustifyCenter',
    'insertLink',
    'formatIndent',
  ])(
    'prevents %s and posts nothing, rather than letting the browser run it unreported',
    (inputType) => {
      const text = textNodeFor('Rich ');

      const event = beforeInput(inputType, { ranges: [at(text, 2)] });

      // Fail closed: an edit nobody reports would desynchronise the document
      // from what the operator sees, and every later position with it.
      expect(event.defaultPrevented, inputType).toBe(true);
      expect(posted('theme:rich-text-command'), inputType).toHaveLength(0);
      expect(posted('theme:rich-text-input'), inputType).toHaveLength(0);
    }
  );

  it('classifies an unnameable inputType as ignore, and the runtime still prevents it', () => {
    const event = new InputEvent('beforeinput', { inputType: 'formatFontName', data: 'Comic' });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [at(textNodeFor('Rich '), 1)] });

    // The classifier reports what it is; the policy of preventing it is the
    // runtime's, so the two stay separable.
    expect(classifyBeforeInput(event, richTextRoot).kind).toBe('ignore');
  });

  it('prevents an edit whose range it cannot resolve at all', () => {
    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    document.body.appendChild(outside);

    const event = beforeInput('insertText', { ranges: [at(outside.firstChild!, 1)], data: 'a' });

    expect(event.defaultPrevented).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  // --- what counts as a text run -------------------------------------------

  it('treats a collapsed delete as a command: backspace is a join, however small', () => {
    const text = textNodeFor('Rich ');
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward' });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [at(text, 2)] });

    expect(classifyBeforeInput(event, richTextRoot)).toEqual({
      kind: 'command',
      from: 17,
      to: 17,
      name: 'deleteContentBackward',
    });
  });

  it('treats a caret on a mark boundary as a command, in either direction', () => {
    const plain = textNodeFor('Rich ');
    const bold = textNodeFor('paragraph');

    // `Rich |<strong>paragraph` — whether the character inherits the mark is
    // the browser's guess, and its answer is not the document's.
    const trailing = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x' });
    Object.defineProperty(trailing, 'getTargetRanges', {
      value: () => [at(plain, plain.data.length)],
    });
    expect(classifyBeforeInput(trailing, richTextRoot)).toEqual({
      kind: 'command',
      from: 20,
      to: 20,
      name: 'insertFromPaste',
    });

    const leading = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x' });
    Object.defineProperty(leading, 'getTargetRanges', { value: () => [at(bold, 0)] });
    expect(classifyBeforeInput(leading, richTextRoot)).toEqual({
      kind: 'command',
      from: 20,
      to: 20,
      name: 'insertFromPaste',
    });

    // One character in from either side is an ordinary text run edit again.
    const inside = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x' });
    Object.defineProperty(inside, 'getTargetRanges', { value: () => [at(plain, 2)] });
    expect(classifyBeforeInput(inside, richTextRoot)).toEqual({ kind: 'native', from: 17, to: 17 });
  });

  it('treats a caret that is not in a text run at all as a command', () => {
    // An empty paragraph: there is no run to extend, and where the browser
    // would put the text node is its decision, not the document's.
    const empty = document.createElement('p');
    empty.setAttribute('data-eldra-node', 'paragraph');
    empty.setAttribute('data-eldra-pos', '30');
    richTextRoot.appendChild(empty);
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x' });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [at(empty, 0)] });

    expect(classifyBeforeInput(event, richTextRoot)).toEqual({
      kind: 'command',
      from: 31,
      to: 31,
      name: 'insertFromPaste',
    });
  });

  // --- the target range itself ---------------------------------------------

  it('falls back to the live selection when the engine reports no target ranges', () => {
    const text = textNodeFor('Rich ');
    select(text, 2);

    // No getTargetRanges at all — older engines, and jsdom.
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'a' });

    expect(classifyBeforeInput(event, richTextRoot)).toEqual({ kind: 'native', from: 17, to: 17 });
  });

  it('ignores an event with neither a target range nor a selection', () => {
    document.getSelection()!.removeAllRanges();

    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'a' });

    expect(classifyBeforeInput(event, richTextRoot)).toEqual({ kind: 'ignore', from: 0, to: 0 });
  });

  it('never calls a multi-range edit native, however innocent each range looks', () => {
    const text = textNodeFor('Rich ');
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward' });
    Object.defineProperty(event, 'getTargetRanges', {
      value: () => [
        { startContainer: text, startOffset: 1, endContainer: text, endOffset: 2 },
        { startContainer: text, startOffset: 3, endContainer: text, endOffset: 4 },
      ],
    });

    // Both ranges are inside one text run, so the run test alone would pass
    // them — but only the first would ever be reported.
    expect(classifyBeforeInput(event, richTextRoot)).toEqual({
      kind: 'command',
      from: 16,
      to: 17,
      name: 'deleteContentBackward',
    });
  });

  // --- composition ---------------------------------------------------------

  it('does not capture a composition started over a selection spanning runs', () => {
    select(textNodeFor('Rich '), 1, textNodeFor('paragraph'), 3);
    richTextRoot.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

    // The beforeinput that follows is the command, and it clears any capture.
    const event = beforeInput('insertCompositionText', {
      data: 'に',
      ranges: [
        {
          startContainer: textNodeFor('Rich '),
          startOffset: 1,
          endContainer: textNodeFor('paragraph'),
          endOffset: 3,
        },
      ],
    });
    richTextRoot.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: 'にほん' })
    );

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toHaveLength(1);
    // Exactly one message for one edit: no text op follows the command.
    expect(posted('theme:rich-text-input')).toHaveLength(0);
  });

  // --- positions after native ops ------------------------------------------

  it('reports document-correct positions in a later block after two native ops', () => {
    // The operator types two characters into the first block. Studio echoes a
    // document where everything after them has moved by two, and the binding
    // re-stamps rather than re-rendering (the caret is in there). A selection
    // in the *second* block must then be reported against the new document,
    // not the one the render was built from.
    const text = textNodeFor('Rich ');
    beforeInput('insertText', { ranges: [at(text, 2)], data: 'a' });
    text.data = 'Riach ';
    input('insertText', 'a', richTextRoot);
    beforeInput('insertText', { ranges: [at(text, 3)], data: 'b' });
    text.data = 'Riabch ';
    input('insertText', 'b', richTextRoot);
    expect(runtime.isRichTextRenderDeferred(target)).toBe(true);

    const echoed = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Rich heading' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Riabch ' },
            { type: 'text', text: 'paragraph', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    };
    expect(restampRichTextPositions(richTextRoot, echoed)).toBe(true);
    post.mockClear();

    select(textNodeFor('paragraph'), 1);
    flushSelection();

    // The bold run now starts at 22, not 20.
    expect(posted('theme:rich-text-selection')[0]).toMatchObject({ anchor: 23, head: 23 });
    expect(
      computeRichTextPositions(echoed).nodes.filter((node) => node.type === 'text')[2]!.pos
    ).toBe(22);
  });

  // --- placements ----------------------------------------------------------

  it('keeps two placements of the same field apart', () => {
    const second = block.cloneNode(true) as HTMLElement;
    second.setAttribute('data-eldra-layout-node', 'OtherNode');
    document.body.appendChild(second);
    runtime.rescan();
    const secondRoot = second.querySelector<HTMLElement>('[data-eldra-rich-text]')!;
    const placed = { ...target, layoutNodeId: 'ArticleNode' };
    const other = { ...target, layoutNodeId: 'OtherNode' };

    const text = secondRoot.querySelector('p')!.firstChild as Text;
    beforeInput('insertText', { target: secondRoot, ranges: [at(text, 1)], data: 'a' });
    input('insertText', 'a', secondRoot);

    expect(runtime.isRichTextRenderDeferred(other)).toBe(true);
    expect(runtime.isRichTextRenderDeferred(placed)).toBe(false);
    expect(posted('theme:rich-text-input')[0]).toMatchObject({ layoutNodeId: 'OtherNode' });

    // Studio's ack names the placement it came from, and releases only it.
    runtime.acceptRichTextApplied({ ...other, revision: 1, anchor: 2, head: 2, rerender: true });
    expect(runtime.isRichTextRenderDeferred(other)).toBe(false);
  });

  // --- boundaries ----------------------------------------------------------

  it('drops an HTML-only paste rather than sending it as an empty insertion', () => {
    const text = textNodeFor('Rich ');

    const event = beforeInput('insertFromPaste', { ranges: [at(text, 2)], pasted: '' });

    // Still prevented — the browser must not paste markup the theme cannot
    // describe — but nothing is posted: an empty text would make Studio delete
    // the selection and insert nothing.
    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-command')).toHaveLength(0);
  });

  it('posts a blur for a selection that starts in one root and ends in another', () => {
    const second = block.cloneNode(true) as HTMLElement;
    second.setAttribute('data-eldra-layout-node', 'OtherNode');
    document.body.appendChild(second);
    runtime.rescan();
    select(textNodeFor('Rich '), 1);
    flushSelection();
    post.mockClear();

    const secondText = second.querySelector('p')!.firstChild!;
    select(textNodeFor('Rich '), 1, secondText, 2);
    flushSelection();

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: null,
        head: null,
        rect: null,
        rootRect: null,
        marks: [],
        block: null,
        revision: 0,
      },
    ]);
  });

  it('ignores an applied outside edit mode', () => {
    runtime.setMode('preview');
    select(heading.firstChild!, 0);

    runtime.acceptRichTextApplied({ ...target, revision: 1, anchor: 17, head: 17, rerender: true });

    expect(document.getSelection()!.focusNode).toBe(heading.firstChild);
  });

  it('clamps a restored selection to what the theme has actually rendered', async () => {
    select(heading.firstChild!, 0);

    // Studio's document is ahead of this render; the caret still has to land.
    runtime.acceptRichTextApplied({
      ...target,
      revision: 1,
      anchor: 900,
      head: 900,
      rerender: true,
    });
    await flushRestore();

    const selection = document.getSelection()!;
    expect(richTextRoot.contains(selection.focusNode!)).toBe(true);
    expect(resolveDomPosition(richTextRoot, selection.focusNode!, selection.focusOffset)).toBe(30);
  });

  it('discards a pending native op when the input lands in a different root', () => {
    const second = block.cloneNode(true) as HTMLElement;
    second.setAttribute('data-eldra-layout-node', 'OtherNode');
    document.body.appendChild(second);
    runtime.rescan();
    const text = textNodeFor('Rich ');

    beforeInput('insertText', { ranges: [at(text, 2)], data: 'a' });
    // Focus moved between the two events; this input is not that op's.
    input('insertText', 'a', second.querySelector('[data-eldra-rich-text]')!);

    expect(posted('theme:rich-text-input')).toHaveLength(0);
    // ...and the stale capture is gone, so the next input cannot claim it.
    input('insertText', 'a', richTextRoot);
    expect(posted('theme:rich-text-input')).toHaveLength(0);
  });

  // --- activation gate: a root Studio has not (yet) activated --------------

  it('prevents a keystroke on an unmarked root, posts nothing, and re-posts the selection once', () => {
    runtime.setRichTextEditing(target, false);
    const text = textNodeFor('Rich ');
    select(text, 2);
    flushSelection();
    post.mockClear();

    const event = beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'a' });

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-input')).toHaveLength(0);
    expect(posted('theme:rich-text-command')).toHaveLength(0);
    // Exactly one selection report, at the current (unmoved) positions — the
    // retry path Studio needs to catch up and activate the field.
    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: 17,
        head: 17,
        rect: null,
        rootRect: ZERO_ROOT_RECT,
        marks: [],
        block: { type: 'paragraph' },
        revision: 0,
      },
    ]);
  });

  it('prevents a deletion on an unmarked root just as it prevents an insertion', () => {
    runtime.setRichTextEditing(target, false);
    const text = textNodeFor('Rich ');

    const event = beforeInput('deleteContentBackward', {
      target: text,
      ranges: [{ startContainer: text, startOffset: 1, endContainer: text, endOffset: 2 }],
    });

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-input')).toHaveLength(0);
    expect(posted('theme:rich-text-command')).toHaveLength(0);
  });

  it('behaves exactly as before on a marked root — the same keystroke still runs natively', () => {
    // The default (marked) fixture from beforeEach, unchanged: the gate must
    // not affect a root Studio has actually activated.
    const text = textNodeFor('Rich ');
    const event = beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'a' });

    expect(event.defaultPrevented).toBe(false);
    expect(posted('theme:rich-text-command')).toHaveLength(0);
    expect(posted('theme:rich-text-input')).toHaveLength(0);

    text.data = 'Rica h ';
    input('insertText', 'a', text);

    expect(posted('theme:rich-text-input')).toEqual([
      {
        ...identity,
        from: 17,
        to: 17,
        text: 'a',
        revision: 1,
      },
    ]);
  });

  it('prevents an insertCompositionText beforeinput on an unmarked root, same as any other op', () => {
    runtime.setRichTextEditing(target, false);
    const text = textNodeFor('Rich ');
    select(text, 2);
    flushSelection();
    post.mockClear();

    const event = beforeInput('insertCompositionText', {
      target: text,
      ranges: [at(text, 2)],
      data: 'に',
    });
    input('insertCompositionText', 'に', text);

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-input')).toHaveLength(0);
    expect(posted('theme:rich-text-selection')).toHaveLength(1);
  });

  it('prevents an IME composition from starting on an unmarked root and re-posts the selection', () => {
    runtime.setRichTextEditing(target, false);
    const text = textNodeFor('Rich ');
    select(text, 2);
    flushSelection();
    post.mockClear();

    const event = new CompositionEvent('compositionstart', { bubbles: true, cancelable: true });
    text.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(posted('theme:rich-text-selection')).toHaveLength(1);

    // Nothing was captured, so a compositionend that follows posts nothing.
    text.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'にほん' }));
    expect(posted('theme:rich-text-input')).toHaveLength(0);
  });

  it('posts one selection report on focusin into an unmarked root', () => {
    runtime.setRichTextEditing(target, false);
    select(textNodeFor('Rich '), 2);
    post.mockClear();

    paragraph.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: 17,
        head: 17,
        rect: null,
        rootRect: ZERO_ROOT_RECT,
        marks: [],
        block: { type: 'paragraph' },
        revision: 0,
      },
    ]);
  });

  it('posts no extra selection report on focusin into an already-marked root', () => {
    select(textNodeFor('Rich '), 2);
    post.mockClear();

    paragraph.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(posted('theme:rich-text-selection')).toHaveLength(0);
  });

  // --- floating toolbar: in-document focus departure is a blur -------------

  it('posts one blur when focus leaves an editable root for an in-document element outside it', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    post.mockClear();

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    paragraph.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));

    expect(posted('theme:rich-text-selection')).toEqual([
      {
        ...identity,
        anchor: null,
        head: null,
        rect: null,
        rootRect: null,
        marks: [],
        block: null,
        revision: 0,
      },
    ]);
  });

  it('posts nothing when focus leaves the iframe window entirely (relatedTarget null)', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    post.mockClear();

    paragraph.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));

    expect(posted('theme:rich-text-selection')).toHaveLength(0);
  });

  it('posts nothing when the related target is still inside the same root', () => {
    select(textNodeFor('Rich '), 2);
    flushSelection();
    post.mockClear();

    paragraph.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: heading }));

    expect(posted('theme:rich-text-selection')).toHaveLength(0);
  });

  // --- editing mark and locate --------------------------------------------

  it('editing:true marks the root and leaves its content visible', () => {
    runtime.setRichTextEditing(target, true);

    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(true);
    // §4.1: no hiding — the theme keeps showing its own text, because that
    // text is the editing surface.
    expect(heading.style.visibility).toBe('');
    expect(paragraph.style.visibility).toBe('');
    expect(heading.hasAttribute('style')).toBe(false);
    expect(paragraph.hasAttribute('style')).toBe(false);
  });

  it('editing:false unmarks, posting nothing', () => {
    runtime.setRichTextEditing(target, true);
    post.mockClear();

    runtime.setRichTextEditing(target, false);

    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('an unresolvable editing target clears any existing mark', () => {
    runtime.setRichTextEditing(target, true);
    post.mockClear();

    runtime.setRichTextEditing({ ...target, fieldPath: 'gone' }, true);

    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('follows the root through a rerender that replaces the element', () => {
    runtime.setRichTextEditing(target, true);
    const replacement = richTextRoot.cloneNode(true) as HTMLElement;
    richTextRoot.replaceWith(replacement);

    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);

    expect(replacement.hasAttribute('data-eldra-rich-text-editing')).toBe(true);
  });

  it('reasserts the editing mark synchronously on rescan(), so a keystroke right after a content-update rerender is not swallowed', () => {
    runtime.setRichTextEditing(target, true);
    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(true);

    // A content-update rerender: a *fresh* tree carrying the same identity
    // attributes findRichTextRoot matches on, but — unlike a plain
    // cloneNode(true) of the already-marked root — none of the runtime's own
    // state (no editing mark, no contenteditable yet), exactly like
    // buildRichTextTree's output.
    const replacement = document.createElement('div');
    replacement.setAttribute('data-eldra-rich-text', '');
    replacement.setAttribute('data-eldra-field', 'body');
    replacement.setAttribute('data-eldra-entry', 'block-1');
    replacement.setAttribute('data-eldra-locale', 'en-US');
    renderInto(replacement, buildRichTextTree(BODY_DOC, { safeHref }));
    richTextRoot.replaceWith(replacement);

    // theme-vue calls this synchronously on every editor:content-update —
    // no scroll, no timer advance, nothing that would let
    // scheduleRichTextSync's rAF run first.
    runtime.rescan();

    expect(replacement.hasAttribute('data-eldra-rich-text-editing')).toBe(true);
    expect(replacement.getAttribute('contenteditable')).toBe('true');

    const text = replacement.querySelector('p')!.firstChild as Text;
    const event = beforeInput('insertText', { target: text, ranges: [at(text, 2)], data: 'a' });
    input('insertText', 'a', text);

    // Not swallowed: the keystroke ran natively and was reported.
    expect(event.defaultPrevented).toBe(false);
    expect(posted('theme:rich-text-input')).toEqual([
      {
        ...identity,
        from: 17,
        to: 17,
        text: 'a',
        revision: 1,
      },
    ]);
  });

  it('reasserts onto the correct placement after a rerender, not the first one in document order', () => {
    // A second placement of the same entry+field+locale, under a different
    // data-eldra-layout-node ancestor.
    const second = block.cloneNode(true) as HTMLElement;
    second.setAttribute('data-eldra-layout-node', 'OtherNode');
    document.body.appendChild(second);
    runtime.rescan();
    const secondRoot = second.querySelector<HTMLElement>('[data-eldra-rich-text]')!;
    const other = { ...target, layoutNodeId: 'OtherNode' };

    // Mark the *second* placement as the one Studio is editing.
    runtime.setRichTextEditing(other, true);
    expect(secondRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(true);
    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(false);

    // A content-update rerender of the second placement only: a fresh tree
    // with the same identity attributes, still nested under its OtherNode
    // ancestor. Once this element is detached, `closest` on it can no longer
    // see that ancestor — which is exactly the drift the captured identity
    // must survive.
    const replacement = document.createElement('div');
    replacement.setAttribute('data-eldra-rich-text', '');
    replacement.setAttribute('data-eldra-field', 'body');
    replacement.setAttribute('data-eldra-entry', 'block-1');
    replacement.setAttribute('data-eldra-locale', 'en-US');
    renderInto(replacement, buildRichTextTree(BODY_DOC, { safeHref }));
    secondRoot.replaceWith(replacement);

    // Synchronous path, exactly as theme-vue drives it — no scroll, no timer
    // advance.
    runtime.rescan();

    // The mark must follow the second placement's replacement, never fall
    // back to the first candidate in document order (the original
    // richTextRoot, under ArticleNode).
    expect(replacement.hasAttribute('data-eldra-rich-text-editing')).toBe(true);
    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(false);
  });

  it('matches an unlocalized field only on a locale-less target', () => {
    richTextRoot.removeAttribute('data-eldra-locale');

    runtime.setRichTextEditing(target, true);
    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(false);

    runtime.setRichTextEditing({ ...target, locale: null }, true);
    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(true);
  });

  it('leaving edit mode clears the mark and posts nothing', () => {
    runtime.setRichTextEditing(target, true);
    post.mockClear();

    runtime.setMode('preview');

    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('closing the capability mid-session clears the mark silently', () => {
    runtime.setRichTextEditing(target, true);
    post.mockClear();

    runtime.setRichTextEnabled(false);

    expect(richTextRoot.hasAttribute('data-eldra-rich-text-editing')).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('locate scrolls the root into view, focuses it and puts the caret at the end', () => {
    // jsdom has no layout and therefore no scrollIntoView implementation.
    const scrollIntoView = vi.fn();
    Object.defineProperty(richTextRoot, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    select(heading.firstChild!, 0);

    runtime.locateRichText(target);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    const selection = document.getSelection()!;
    // The end of the document: after the paragraph, which is position 30.
    expect(richTextRoot.contains(selection.focusNode!)).toBe(true);
    expect(selection.isCollapsed).toBe(true);
  });

  it('locate does nothing without the capability', () => {
    runtime.setRichTextEnabled(false);
    const scrollIntoView = vi.fn();
    Object.defineProperty(richTextRoot, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });

    runtime.locateRichText(target);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('posts field-clicked on a click inside the selected block, without navigating', () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    paragraph.dispatchEvent(event);

    expect(posted('theme:field-clicked')).toHaveLength(1);
    // A rich-text document can contain links; the click that puts the caret
    // in the theme's own render must never navigate the iframe.
    expect(event.defaultPrevented).toBe(true);
  });

  it('a click on an unselected block still only selects it', () => {
    runtime.setSelected(null);
    post.mockClear();

    paragraph.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(posted('theme:field-clicked')).toHaveLength(0);
    expect(posted('theme:block-clicked')).toHaveLength(1);
  });

  it('prevents navigation for a link inside a rich-text root that is actively being edited (navigation guard)', () => {
    // Putting the caret in a link's text must not navigate — the guard does
    // not exempt an anchor just because it sits inside the field the
    // operator is actively editing.
    const link = document.createElement('a');
    link.href = '/inline-link';
    link.textContent = 'inline link';
    paragraph.appendChild(link);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(debug).toHaveBeenCalledWith('[eldra] navigation prevented', '/inline-link');
    debug.mockRestore();
  });
});

/** jsdom delivers MutationObserver records on the microtask queue. */
async function flushMutations(): Promise<void> {
  for (let index = 0; index < 3; index += 1) await Promise.resolve();
}

// jsdom performs no layout (getBoundingClientRect is all zeros) and does not
// provide a PointerEvent constructor, so the drop-mode tests stub both:
// rects are derived from inline styles, and pointer events are emulated with
// a MouseEvent subclass that carries clientX/clientY.
class PointerEventStub extends MouseEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId: number;
  constructor(
    type: string,
    init: MouseEventInit & { clientX?: number; clientY?: number; pointerId?: number } = {}
  ) {
    super(type, init);
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.pointerId = init.pointerId ?? 0;
  }
}

function styleRect(element: Element): {
  x: number;
  y: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} {
  const style = (element as HTMLElement).style;
  const num = (value: string): number => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const x = num(style.left);
  const y = num(style.top);
  const width = num(style.width);
  const height = num(style.height);
  return { x, y, left: x, top: y, right: x + width, bottom: y + height, width, height };
}

describe('drop mode', () => {
  let post: Mock<OverlayRuntimeOptions['post']>;
  let overlay: OverlayRuntime;
  let rectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    post = vi.fn<OverlayRuntimeOptions['post']>();
    document.body.innerHTML = '';
    vi.stubGlobal('PointerEvent', PointerEventStub);
    rectSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) {
        return styleRect(this) as DOMRect;
      });
  });

  afterEach(() => {
    overlay?.stop();
    vi.unstubAllGlobals();
    rectSpy?.mockRestore();
  });

  it('posts theme:drop-candidate and theme:node-dropped for a pointerup over a layout node', () => {
    overlay = createOverlayRuntime({ post });
    document.body.innerHTML = `
      <div data-eldra-layout-node="grid-1" style="position:absolute;left:0;top:0;width:300px;height:200px">
        <div data-eldra-block="entry-1" data-eldra-layout-node="hero-1" style="position:absolute;left:10px;top:10px;width:100px;height:40px"></div>
      </div>`;
    overlay.start();
    overlay.setDragPayload({ kind: 'palette-block', id: 'tile-hero', apiId: 'hero' });
    const block = document.querySelector('[data-eldra-block]')!;
    const rect = block.getBoundingClientRect();
    block.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 5,
        clientY: rect.top + 5,
        bubbles: true,
      })
    );
    expect(post).toHaveBeenCalledWith(
      'theme:drop-candidate',
      expect.objectContaining({
        layoutNodeId: 'hero-1',
        placement: expect.stringMatching(/before|after|inside/),
      })
    );
    block.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: rect.left + 5,
        clientY: rect.top + 5,
        bubbles: true,
      })
    );
    expect(post).toHaveBeenCalledWith(
      'theme:node-dropped',
      expect.objectContaining({
        payload: { kind: 'palette-block', id: 'tile-hero', apiId: 'hero' },
        layoutNodeId: 'hero-1',
      })
    );
  });

  it('posts theme:drop-candidate null when the pointer leaves every node', () => {
    overlay = createOverlayRuntime({ post });
    document.body.innerHTML =
      '<div data-eldra-layout-node="grid-1" style="width:300px;height:200px"></div>';
    overlay.start();
    overlay.setDragPayload({ kind: 'palette-block', id: 'tile-hero', apiId: 'hero' });
    document.body.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 9999, clientY: 9999, bubbles: true })
    );
    expect(post).toHaveBeenCalledWith('theme:drop-candidate', null);
  });

  it('clears drop mode and posts nothing on drop without a payload', () => {
    overlay = createOverlayRuntime({ post });
    overlay.start();
    post.mockClear(); // start() reports theme:blocks-rendered; isolate the drop path
    overlay.setDragPayload(null);
    document.body.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 10, clientY: 10, bubbles: true })
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('resolves a pointer over a slot marker to slotId + host node + placement inside', () => {
    overlay = createOverlayRuntime({ post });
    document.body.innerHTML = `
      <div data-eldra-layout-node="grid-1" style="position:absolute;left:0;top:0;width:300px;height:200px">
        <div data-eldra-block="entry-1" data-eldra-layout-node="hero-1" style="position:absolute;left:10px;top:10px;width:100px;height:40px">
          <div data-eldra-slot-marker data-eldra-slot-id="actions" data-eldra-layout-node-id="hero-1"
               style="position:absolute;left:20px;top:20px;width:80px;height:20px"></div>
        </div>
      </div>`;
    overlay.start();
    overlay.setDragPayload({ kind: 'palette-block', id: 'tile-hero', apiId: 'hero' });
    const marker = document.querySelector('[data-eldra-slot-marker]')!;
    const rect = marker.getBoundingClientRect();
    const at = { clientX: rect.left + 5, clientY: rect.top + 5, bubbles: true };
    marker.dispatchEvent(new PointerEvent('pointermove', at));
    expect(post).toHaveBeenCalledWith('theme:drop-candidate', {
      layoutNodeId: 'hero-1',
      placement: 'inside',
      rect: { x: 20, y: 20, width: 80, height: 20 },
      slotId: 'actions',
    });
    marker.dispatchEvent(new PointerEvent('pointerup', at));
    expect(post).toHaveBeenCalledWith('theme:node-dropped', {
      payload: { kind: 'palette-block', id: 'tile-hero', apiId: 'hero' },
      layoutNodeId: 'hero-1',
      placement: 'inside',
      slotId: 'actions',
    });
  });

  it('emits a slot candidate even when the marker rect overlaps no layout node', () => {
    overlay = createOverlayRuntime({ post });
    document.body.innerHTML = `
      <div data-eldra-layout-node="grid-1" style="position:absolute;left:0;top:0;width:300px;height:200px"></div>
      <div data-eldra-slot-marker data-eldra-slot-id="hero-actions" data-eldra-layout-node-id="hero-1"
           style="position:absolute;left:400px;top:400px;width:80px;height:20px"></div>`;
    overlay.start();
    overlay.setDragPayload({ kind: 'palette-block', id: 'tile-hero', apiId: 'hero' });
    document.body.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 405, clientY: 405, bubbles: true })
    );
    expect(post).toHaveBeenCalledWith('theme:drop-candidate', {
      layoutNodeId: 'hero-1',
      placement: 'inside',
      rect: { x: 400, y: 400, width: 80, height: 20 },
      slotId: 'hero-actions',
    });
  });

  it('does not attach slotId when dropping over a plain layout node', () => {
    overlay = createOverlayRuntime({ post });
    document.body.innerHTML = `
      <div data-eldra-layout-node="grid-1" style="position:absolute;left:0;top:0;width:300px;height:200px">
        <div data-eldra-block="entry-1" data-eldra-layout-node="hero-1" style="position:absolute;left:10px;top:10px;width:100px;height:40px"></div>
      </div>`;
    overlay.start();
    overlay.setDragPayload({ kind: 'palette-block', id: 'tile-hero', apiId: 'hero' });
    const block = document.querySelector('[data-eldra-block]')!;
    const rect = block.getBoundingClientRect();
    block.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 5,
        clientY: rect.top + 5,
        bubbles: true,
      })
    );
    const candidate = post.mock.calls.find(([type]) => type === 'theme:drop-candidate');
    expect(candidate).toBeDefined();
    expect(candidate![1]).not.toHaveProperty('slotId');
    block.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: rect.left + 5,
        clientY: rect.top + 5,
        bubbles: true,
      })
    );
    const dropped = post.mock.calls.find(([type]) => type === 'theme:node-dropped');
    expect(dropped).toBeDefined();
    expect(dropped![1]).not.toHaveProperty('slotId');
  });
});

/**
 * A real browser's getBoundingClientRect() on an element reflects any
 * `transform` applied to it: `transform: scale(z)` with a given
 * `transform-origin` grows the reported box around that origin point. jsdom
 * computes no layout/transform at all, so these framing tests stub the
 * image's rect to reproduce that, starting from a fixed, un-transformed
 * `layout` box and reading the `scale(z)`/`ox% oy%` the overlay itself wrote
 * via `applyFraming()` (defaulting to zoom 1 / origin 50% 50% before any
 * framing interaction has run). This keeps `unscaledFrameRect`'s inversion —
 * which the outline and badge both depend on — exercised the way a
 * real browser would actually drive it, rather than a flat, zoom-blind mock.
 */
function stubTransformedRect(
  image: HTMLElement,
  layout: { x: number; y: number; width: number; height: number }
): void {
  vi.spyOn(image, 'getBoundingClientRect').mockImplementation(() => {
    const scaleMatch = /scale\(([\d.]+)\)/.exec(image.style.transform);
    const z = scaleMatch ? Number(scaleMatch[1]) : 1;
    const [oxRaw, oyRaw] = image.style.transformOrigin
      .split(' ')
      .map((part) => Number.parseFloat(part));
    const ox = Number.isFinite(oxRaw) ? oxRaw : 50;
    const oy = Number.isFinite(oyRaw) ? oyRaw : 50;
    const originX = layout.x + (layout.width * ox) / 100;
    const originY = layout.y + (layout.height * oy) / 100;
    const width = layout.width * z;
    const height = layout.height * z;
    const x = originX + (layout.x - originX) * z;
    const y = originY + (layout.y - originY) * z;
    return {
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

// jsdom provides no PointerEvent constructor and no pointer capture, so the
// framing tests reuse the PointerEventStub above (extended with pointerId);
// the runtime itself feature-detects setPointerCapture.
describe('framing mode', () => {
  let post: Mock<OverlayRuntimeOptions['post']>;
  let runtime: OverlayRuntime;
  let image: HTMLImageElement;
  let section: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('PointerEvent', PointerEventStub);
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    post = vi.fn<OverlayRuntimeOptions['post']>();
    document.body.innerHTML = '';
    section = document.createElement('section');
    section.setAttribute('data-eldra-block', 'block-1');
    section.setAttribute('data-eldra-schema', 'hero');
    image = document.createElement('img');
    image.setAttribute('data-eldra-framing', 'image');
    image.setAttribute('data-eldra-framing-entry', 'block-1');
    image.setAttribute('data-eldra-framing-value', '0.5,0.5,1');
    section.appendChild(image);
    document.body.appendChild(section);
    stubTransformedRect(image, { x: 0, y: 0, width: 400, height: 200 });
    runtime = createOverlayRuntime({ post });
    runtime.start();
    runtime.setMode('edit');
    runtime.setSelected('block-1');
    // These tests exercise framing behaviour once the editor has negotiated
    // the capability; the capability-gating tests below manage their own
    // enabled/disabled state explicitly.
    runtime.setFramingEnabled(true);
    // setMode/setSelected above each call reposition(), which schedules a
    // coalesced reportBlocks() frame; flush it before mockClear() so it
    // does not fire mid-test and inflate a later post-count assertion.
    vi.advanceTimersByTime(16);
    post.mockClear();
  });

  afterEach(() => {
    runtime.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const click = (target: Element) =>
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  it("enters framing on a click on the selected block's framed image and posts the frame rect", () => {
    click(image);
    expect(post).toHaveBeenCalledWith('theme:framing-target', {
      entryId: 'block-1',
      fieldPath: 'image',
      rect: { x: 0, y: 0, width: 400, height: 200 },
    });
    expect(post).not.toHaveBeenCalledWith('theme:block-clicked', expect.anything());
    expect(runtime.chromeState().framing).toBe('block');
  });

  it('selects the block instead when the framed image belongs to an unselected block', () => {
    runtime.setSelected('other');
    post.mockClear();
    click(image);
    expect(post).toHaveBeenCalledWith(
      'theme:block-clicked',
      expect.objectContaining({ entryId: 'block-1' })
    );
    expect(post).not.toHaveBeenCalledWith('theme:framing-target', expect.anything());
  });

  it('drags the focal point, throttles live posts to one per frame and posts a final value on pointer up', () => {
    click(image);
    image.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
      })
    );
    image.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 140, clientY: 100, pointerId: 1 })
    );
    image.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 180, clientY: 100, pointerId: 1 })
    );
    expect(post).not.toHaveBeenCalledWith('theme:framing-changed', expect.anything());
    vi.advanceTimersByTime(16);
    expect(post).toHaveBeenCalledTimes(2); // target + one live frame
    expect(post).toHaveBeenLastCalledWith('theme:framing-changed', {
      entryId: 'block-1',
      fieldPath: 'image',
      framing: { x: 0.3, y: 0.5, zoom: 1 },
      final: false,
    });
    image.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, clientX: 180, clientY: 100, pointerId: 1 })
    );
    expect(post).toHaveBeenLastCalledWith('theme:framing-changed', {
      entryId: 'block-1',
      fieldPath: 'image',
      framing: { x: 0.3, y: 0.5, zoom: 1 },
      final: true,
    });
    expect(image.style.getPropertyValue('object-position')).toBe('30% 50%');
    expect(image.getAttribute('data-eldra-framing-value')).toBe('0.3,0.5,1');
  });

  it('zooms with the wheel, consumes the event and settles after 200 ms', () => {
    click(image);
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -Math.log(2) / 0.002,
      ctrlKey: true,
    });
    image.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(16);
    const live = post.mock.calls.find(
      ([type, payload]) =>
        type === 'theme:framing-changed' &&
        (payload as BridgePayloads['theme:framing-changed']).final === false
    ) as [type: 'theme:framing-changed', payload: BridgePayloads['theme:framing-changed']];
    expect(live[1].framing.zoom).toBeCloseTo(2, 6);
    expect(image.style.getPropertyValue('transform')).toBe('scale(2)');
    vi.advanceTimersByTime(200);
    expect(post).toHaveBeenLastCalledWith(
      'theme:framing-changed',
      expect.objectContaining({ final: true })
    );
  });

  it('leaves on Escape, on a click outside and on selection change', () => {
    click(image);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(post).toHaveBeenLastCalledWith('theme:framing-target', { entryId: null });
    expect(runtime.chromeState().framing).toBe('none');

    click(image);
    click(document.body);
    expect(post).toHaveBeenLastCalledWith('theme:framing-target', { entryId: null });

    click(image);
    runtime.setSelected(null);
    expect(post).toHaveBeenLastCalledWith('theme:framing-target', { entryId: null });
  });

  it('enters and leaves through setFramingMode and stays inert in preview mode', () => {
    runtime.setFramingMode({ entryId: 'block-1', fieldPath: 'image' });
    expect(post).toHaveBeenLastCalledWith(
      'theme:framing-target',
      expect.objectContaining({ entryId: 'block-1' })
    );
    runtime.setFramingMode(null);
    expect(post).toHaveBeenLastCalledWith('theme:framing-target', { entryId: null });

    runtime.setMode('preview');
    post.mockClear();
    click(image);
    expect(post).not.toHaveBeenCalledWith('theme:framing-target', expect.anything());
    expect(runtime.chromeState().framing).toBe('none');
  });

  it('setFramingMode posts nothing in preview mode, but enters once edit mode resumes', () => {
    runtime.setMode('preview');
    post.mockClear();
    runtime.setFramingMode({ entryId: 'block-1', fieldPath: 'image' });
    expect(post).not.toHaveBeenCalled();
    expect(runtime.chromeState().framing).toBe('none');

    runtime.setMode('edit');
    runtime.setFramingMode({ entryId: 'block-1', fieldPath: 'image' });
    expect(post).toHaveBeenLastCalledWith(
      'theme:framing-target',
      expect.objectContaining({ entryId: 'block-1' })
    );
    expect(runtime.chromeState().framing).toBe('block');
  });

  it('is inert after stop(): setFramingMode adds no listeners and posts nothing', () => {
    runtime.stop();
    post.mockClear();
    runtime.setFramingMode({ entryId: 'block-1', fieldPath: 'image' });
    expect(post).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(post).not.toHaveBeenCalled();
  });

  it('posts the null target when stop() runs while framing is active', () => {
    click(image);
    post.mockClear();
    runtime.stop();
    expect(post).toHaveBeenLastCalledWith('theme:framing-target', { entryId: null });
  });

  it('retargets directly from one framed image to another without an intervening null target', () => {
    const image2 = document.createElement('img');
    image2.setAttribute('data-eldra-framing', 'image2');
    image2.setAttribute('data-eldra-framing-entry', 'block-1');
    image2.setAttribute('data-eldra-framing-value', '0.5,0.5,1');
    section.appendChild(image2);
    stubTransformedRect(image2, { x: 0, y: 0, width: 400, height: 200 });

    click(image);
    post.mockClear();
    click(image2);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenLastCalledWith('theme:framing-target', {
      entryId: 'block-1',
      fieldPath: 'image2',
      rect: { x: 0, y: 0, width: 400, height: 200 },
    });
  });

  // Regression (I14 wheel snap-back): the renderer re-applies `style` and
  // `data-eldra-framing-value` from the *draft* on every editor:content-update,
  // and Studio only commits a framing value 200 ms after the last wheel event.
  // A content update that lands inside that window (the previous wheel click's
  // own commit echo, or an autosave acknowledgement) used to leave the stale
  // committed value on the image until the next commit echo — the operator saw
  // the zoom jump in and straight back out.
  it('re-asserts the in-flight gesture value when a re-render rewrites the framed image mid-gesture', () => {
    click(image);
    image.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -Math.log(2) / 0.002 })
    );
    vi.advanceTimersByTime(16);
    expect(image.style.getPropertyValue('transform')).toBe('scale(2)');

    // Studio's debounced editor:content-update lands before the 200 ms settle:
    // Vue patches the same node back to the last committed framing.
    image.style.setProperty('transform', '');
    image.style.setProperty('object-position', '50% 50%');
    image.setAttribute('data-eldra-framing-value', '0.5,0.5,1');
    runtime.rescan();

    expect(image.getAttribute('data-eldra-framing-value')).toBe('0.5,0.5,2');
    expect(image.style.getPropertyValue('transform')).toBe('scale(2)');
    vi.advanceTimersByTime(200);
    expect(post).toHaveBeenLastCalledWith('theme:framing-changed', {
      entryId: 'block-1',
      fieldPath: 'image',
      framing: { x: 0.5, y: 0.5, zoom: 2 },
      final: true,
    });
  });

  it('adopts a re-rendered framing value when no gesture is in flight', () => {
    click(image);
    // No gesture pending: the draft is authoritative (inspector slider, undo,
    // a reset). The overlay must follow it instead of stomping it back.
    image.style.setProperty('transform', 'scale(3)');
    image.style.setProperty('transform-origin', '50% 50%');
    image.setAttribute('data-eldra-framing-value', '0.5,0.5,3');
    runtime.rescan();
    expect(image.getAttribute('data-eldra-framing-value')).toBe('0.5,0.5,3');

    // the next gesture starts from the adopted value, not from the stale one
    post.mockClear();
    image.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 0 }));
    vi.advanceTimersByTime(16);
    expect(post).toHaveBeenLastCalledWith('theme:framing-changed', {
      entryId: 'block-1',
      fieldPath: 'image',
      framing: { x: 0.5, y: 0.5, zoom: 3 },
      final: false,
    });
  });

  it('recovers the zoom-independent frame rect from a scaled getBoundingClientRect, and hides the outline on exit', () => {
    click(image);
    expect(runtime.chromeState().frameRect).toEqual({ x: 0, y: 0, width: 400, height: 200 });
    image.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -Math.log(2) / 0.002 })
    );
    vi.advanceTimersByTime(16);
    // The scaled getBoundingClientRect at zoom 2 (origin 50% 50%) is
    // {-200, -100, 800, 400}; unscaledFrameRect recovers the same
    // zoom-independent {0, 0, 400, 200} frame the outline and badge use.
    expect(runtime.chromeState().frameRect).toEqual({ x: 0, y: 0, width: 400, height: 200 });
    expect(runtime.chromeState().framing).toBe('block');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(runtime.chromeState().framing).toBe('none');
  });

  describe('capability gating (contract §17)', () => {
    beforeEach(() => {
      // Undo the shared beforeEach's opt-in: these tests own the enabled state.
      runtime.setFramingEnabled(false);
      post.mockClear();
    });

    it("is disabled by default: a click on the selected block's framed image posts no framing messages and chromeState().framing stays none", () => {
      click(image);
      expect(post).not.toHaveBeenCalledWith('theme:framing-target', expect.anything());
      expect(post).not.toHaveBeenCalledWith('theme:framing-changed', expect.anything());
      expect(runtime.chromeState().framing).toBe('none');
    });

    it('falls through to the ordinary block click when disabled, as if framing did not exist', () => {
      click(image);
      expect(post).toHaveBeenCalledWith(
        'theme:block-clicked',
        expect.objectContaining({ entryId: 'block-1' })
      );
      expect(post).not.toHaveBeenCalledWith('theme:framing-target', expect.anything());
    });

    it('setFramingMode is a no-op while disabled', () => {
      runtime.setFramingMode({ entryId: 'block-1', fieldPath: 'image' });
      expect(post).not.toHaveBeenCalled();
      expect(runtime.chromeState().framing).toBe('none');
    });

    it('enabling then clicking enters framing', () => {
      runtime.setFramingEnabled(true);
      click(image);
      expect(post).toHaveBeenCalledWith(
        'theme:framing-target',
        expect.objectContaining({ entryId: 'block-1' })
      );
      expect(runtime.chromeState().framing).toBe('block');
    });

    it('disabling mid-session exits a live framing session and posts nothing', () => {
      runtime.setFramingEnabled(true);
      click(image);
      expect(runtime.chromeState().framing).toBe('block');
      post.mockClear();
      runtime.setFramingEnabled(false);
      expect(post).not.toHaveBeenCalled();
      expect(runtime.chromeState().framing).toBe('none');
    });

    it("disabling mid-drag exits silently without posting the drag's finalizing theme:framing-changed", () => {
      runtime.setFramingEnabled(true);
      click(image);
      image.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
          button: 0,
          pointerId: 1,
        })
      );
      image.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 140, clientY: 100, pointerId: 1 })
      );
      post.mockClear();
      runtime.setFramingEnabled(false);
      expect(post).not.toHaveBeenCalled();
      expect(runtime.chromeState().framing).toBe('none');
    });
  });
});

// --- theme:block-hovered -----------------------------------------------------
//
// The editor anchors an "add block" affordance to the hovered block's bottom
// edge, so it needs the hovered block's identity and rect — geometry the
// theme already tracks for its own hover outline but never reported. The
// message is edit-mode only, gated on the negotiated `block-hover`
// capability, posted when the hovered *block* changes (not on every pointer
// move inside it), null on leave, and refreshed on scroll/resize.
describe('block hover reporting', () => {
  let post: Mock<OverlayRuntimeOptions['post']>;
  let runtime: OverlayRuntime;
  let blockA: HTMLElement;
  let blockB: HTMLElement;
  let heading: HTMLElement;
  let richTextRoot: HTMLElement;

  function stubRect(element: Element, rect: { x: number; y: number }): void {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: rect.x,
      y: rect.y,
      width: 300,
      height: 80,
      top: rect.y,
      left: rect.x,
      right: rect.x + 300,
      bottom: rect.y + 80,
      toJSON: () => ({}),
    } as DOMRect);
  }

  const over = (element: Element): void => {
    element.dispatchEvent(new Event('pointerover', { bubbles: true }));
  };
  /** A bubbled pointerout with a null relatedTarget: the pointer left the
   * document entirely, which is the only case the runtime treats as a leave. */
  const outOfDocument = (element: Element): void => {
    element.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
  };
  const hovers = (): unknown[] =>
    post.mock.calls.filter((call) => call[0] === 'theme:block-hovered').map((call) => call[1]);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    post = vi.fn<OverlayRuntimeOptions['post']>();
    document.body.innerHTML = '';

    blockA = document.createElement('section');
    blockA.setAttribute('data-eldra-block', 'block-1');
    blockA.setAttribute('data-eldra-schema', 'hero');
    blockA.setAttribute('data-eldra-layout-node', 'placement-1');
    heading = document.createElement('h2');
    heading.setAttribute('data-eldra-field', 'heading');
    heading.textContent = 'Hello';
    richTextRoot = document.createElement('div');
    richTextRoot.setAttribute('data-eldra-rich-text', '');
    richTextRoot.setAttribute('data-eldra-entry', 'block-1');
    richTextRoot.setAttribute('data-eldra-field', 'body');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Body copy';
    richTextRoot.appendChild(paragraph);
    blockA.append(heading, richTextRoot);

    const placement = document.createElement('div');
    placement.setAttribute('data-eldra-layout-node', 'component-node');
    placement.setAttribute('data-eldra-reusable-placement', 'footer-a');
    blockB = document.createElement('section');
    blockB.setAttribute('data-eldra-block', 'block-2');
    blockB.setAttribute('data-eldra-schema', 'footer');
    placement.appendChild(blockB);

    document.body.append(blockA, placement);
    stubRect(blockA, { x: 0, y: 100 });
    stubRect(blockB, { x: 0, y: 400 });
    // A descendant's own rect must never be the one reported.
    stubRect(heading, { x: 8, y: 108 });
    stubRect(richTextRoot, { x: 8, y: 150 });

    runtime = createOverlayRuntime({ post });
    runtime.start();
    runtime.setMode('edit');
    runtime.setBlockHoverEnabled(true);
    // setMode calls reposition(), which schedules coalesced frames; flush them
    // before mockClear() so they cannot inflate a later assertion.
    vi.advanceTimersByTime(16);
    post.mockClear();
  });

  afterEach(() => {
    runtime.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports the hovered block's own identity and rect, not the descendant the pointer is over", () => {
    over(heading);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([
      {
        entryId: 'block-1',
        rect: { x: 0, y: 100, width: 300, height: 80 },
        layoutNodeId: 'placement-1',
      },
    ]);
  });

  it('carries the reusable placement identity when the block is placed through one', () => {
    over(blockB);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([
      {
        entryId: 'block-2',
        rect: { x: 0, y: 400, width: 300, height: 80 },
        layoutNodeId: 'component-node',
        reusablePlacementId: 'footer-a',
      },
    ]);
  });

  it('reports the containing block and nothing finer for a node inside a rich-text root', () => {
    over(richTextRoot.firstElementChild!);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([
      {
        entryId: 'block-1',
        rect: { x: 0, y: 100, width: 300, height: 80 },
        layoutNodeId: 'placement-1',
      },
    ]);
  });

  it('posts null when the pointer moves off the block onto the page background', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    over(document.body);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([null]);
  });

  it('posts null when the pointer leaves the document altogether', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    outOfDocument(blockA);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([null]);
  });

  it('posts nothing when the pointer moves between descendants of the block it is already on', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    over(blockA);
    over(richTextRoot);
    over(heading);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([]);
  });

  it('posts nothing when a hover, a scroll and a leave all land in the same frame', () => {
    // The scroll marks the geometry stale while the pointerover's frame is
    // still armed; the leave empties the hover before anything was posted.
    // Nothing was ever reported, so there is no leave to report either.
    over(heading);
    window.dispatchEvent(new Event('scroll'));
    outOfDocument(blockA);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([]);
  });

  it('coalesces a pointer sweep across blocks into one post carrying the block it settled on', () => {
    over(blockA);
    over(blockB);
    over(heading);
    over(blockB);
    expect(hovers()).toEqual([]); // nothing until the frame runs
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([
      {
        entryId: 'block-2',
        rect: { x: 0, y: 400, width: 300, height: 80 },
        layoutNodeId: 'component-node',
        reusablePlacementId: 'footer-a',
      },
    ]);
  });

  it('posts nothing when a sweep within one frame returns to the block already reported', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    over(blockB);
    over(heading);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([]);
  });

  it('re-posts the hovered rect on scroll, coalescing a burst into one post per frame', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    stubRect(blockA, { x: 0, y: 240 });
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(hovers()).toEqual([]);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([
      {
        entryId: 'block-1',
        rect: { x: 0, y: 240, width: 300, height: 80 },
        layoutNodeId: 'placement-1',
      },
    ]);
  });

  it('goes quiet again after a scroll re-post, once the pointer only moves inside that block', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    stubRect(blockA, { x: 0, y: 240 });
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);
    post.mockClear();

    over(richTextRoot);
    over(heading);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([]);
  });

  it('re-posts the hovered rect on resize', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    stubRect(blockA, { x: 0, y: 40 });
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([
      {
        entryId: 'block-1',
        rect: { x: 0, y: 40, width: 300, height: 80 },
        layoutNodeId: 'placement-1',
      },
    ]);
  });

  it('re-posts nothing on scroll while no block is hovered', () => {
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([]);
  });

  it('posts the leave message once a rerender detaches the hovered block', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    // The real path a rerender takes: the binding replaces the DOM and calls
    // rescan(). No pointerout ever fires for a node that was removed under a
    // motionless pointer, so this is the only thing that can tell the editor
    // its affordance is anchored to a block that no longer exists.
    blockA.remove();
    runtime.rescan();
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([null]);
  });

  it('posts the leave message on the next scroll when a detached block was never rescanned', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    blockA.remove();
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([null]);
  });

  it('posts nothing in preview mode, and leaves edit mode without a leave message', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    // Studio drove the mode change and knows the hover is over; a preview-mode
    // theme reports no hover at all, so neither the exit nor anything after it
    // may post.
    runtime.setMode('preview');
    vi.advanceTimersByTime(16);
    expect(hovers()).toEqual([]);

    over(heading);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);
    expect(hovers()).toEqual([]);
  });

  it('re-reports from scratch when edit mode resumes, without resurrecting the stale hover', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    // Silent on both sides of the round trip: no leave message on the way
    // out, and re-entering edit mode must not report a hover the pointer
    // never re-established.
    runtime.setMode('preview');
    runtime.setMode('edit');
    vi.advanceTimersByTime(16);
    expect(hovers()).toEqual([]);

    over(heading);
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([
      {
        entryId: 'block-1',
        rect: { x: 0, y: 100, width: 300, height: 80 },
        layoutNodeId: 'placement-1',
      },
    ]);
  });

  it('posts nothing until the editor negotiates the block-hover capability', () => {
    runtime.stop();
    const gated = vi.fn<OverlayRuntimeOptions['post']>();
    const ungatedRuntime = createOverlayRuntime({ post: gated });
    ungatedRuntime.start();
    ungatedRuntime.setMode('edit');
    vi.advanceTimersByTime(16);

    over(heading);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);

    expect(gated.mock.calls.filter((call) => call[0] === 'theme:block-hovered')).toEqual([]);
    ungatedRuntime.stop();
  });

  it('lets no pending frame post after stop()', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    over(blockB); // arms a frame that would post block-2
    runtime.stop();
    vi.advanceTimersByTime(16);

    expect(hovers()).toEqual([]);
  });

  it('posts nothing for a runtime the editor drives before start()', () => {
    const early = vi.fn<OverlayRuntimeOptions['post']>();
    const idle = createOverlayRuntime({ post: early });
    // setMode/setSelected both call reposition(), which schedules the hover
    // report; none of it may reach the bridge before the runtime is started.
    idle.setBlockHoverEnabled(true);
    idle.setMode('edit');
    idle.setSelected('block-1', 'placement-1');
    vi.advanceTimersByTime(16);

    expect(early.mock.calls.filter((call) => call[0] === 'theme:block-hovered')).toEqual([]);
  });

  it('forgets the reported hover silently when the capability closes mid-session', () => {
    over(heading);
    vi.advanceTimersByTime(16);
    post.mockClear();

    runtime.setBlockHoverEnabled(false);
    vi.advanceTimersByTime(16);
    expect(hovers()).toEqual([]);

    over(blockB);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);
    expect(hovers()).toEqual([]);

    // Re-opening the capability starts from nothing reported: the block the
    // editor last heard about is not one it can still be showing chrome for.
    runtime.setBlockHoverEnabled(true);
    over(heading);
    vi.advanceTimersByTime(16);
    expect(hovers()).toEqual([
      {
        entryId: 'block-1',
        rect: { x: 0, y: 100, width: 300, height: 80 },
        layoutNodeId: 'placement-1',
      },
    ]);
  });
});

describe('breakpoint-hidden layout nodes', () => {
  let post: Mock<OverlayRuntimeOptions['post']>;
  let runtime: OverlayRuntime;
  let node: HTMLElement;

  function renderedBlocks(
    call: unknown[] | undefined
  ): BridgePayloads['theme:blocks-rendered']['blocks'] {
    if (call === undefined) throw new Error('no theme:blocks-rendered post');
    return (call[1] as BridgePayloads['theme:blocks-rendered']).blocks;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    post = vi.fn<OverlayRuntimeOptions['post']>();
    document.head.innerHTML = '';
    // The shape a framework binding renders: the layout node's class, its
    // hidden breakpoints and the block identity all on one element. `Inside`
    // is hidden only because its container is — its own node is not.
    document.body.innerHTML =
      '<div data-eldra-layout-node="Placement" data-eldra-hidden="mobile" ' +
      'data-eldra-block="block-1" data-eldra-schema="hero"></div>' +
      '<div data-eldra-layout-node="Shown" data-eldra-block="block-2" ' +
      'data-eldra-schema="hero"></div>' +
      '<div data-eldra-layout-node="Container" data-eldra-hidden="mobile">' +
      '<div data-eldra-layout-node="Inside" data-eldra-block="block-3" ' +
      'data-eldra-schema="hero"></div></div>';
    node = document.querySelector<HTMLElement>('[data-eldra-hidden]')!;
    runtime = createOverlayRuntime({ post });
    runtime.start();
  });

  afterEach(() => {
    runtime.stop();
    document.head.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('marks a hidden node for edit mode only, so preview and static keep display:none', () => {
    expect(node.hasAttribute('data-eldra-edit-mode')).toBe(false);

    runtime.setMode('edit');
    expect(node.getAttribute('data-eldra-edit-mode')).toBe('');
    expect(
      document
        .querySelector('[data-eldra-layout-node="Shown"]')!
        .hasAttribute('data-eldra-edit-mode')
    ).toBe(false);

    runtime.setMode('preview');
    expect(node.hasAttribute('data-eldra-edit-mode')).toBe(false);
  });

  it('waits for start(): a mode set on a stopped runtime decorates nothing', () => {
    runtime.stop();
    const idle = createOverlayRuntime({ post });
    idle.setMode('edit');
    expect(node.hasAttribute('data-eldra-edit-mode')).toBe(false);

    idle.start();
    expect(node.getAttribute('data-eldra-edit-mode')).toBe('');
    idle.stop();
  });

  it('marks nodes a rerender brought in, and unmarks everything on stop', () => {
    runtime.setMode('edit');
    node.remove();
    const replacement = document.createElement('div');
    replacement.className = 'hidden-node';
    replacement.setAttribute('data-eldra-layout-node', 'Placement');
    replacement.setAttribute('data-eldra-hidden', 'mobile');
    document.body.appendChild(replacement);
    expect(replacement.hasAttribute('data-eldra-edit-mode')).toBe(false);

    runtime.rescan();
    expect(replacement.getAttribute('data-eldra-edit-mode')).toBe('');

    runtime.stop();
    expect(replacement.hasAttribute('data-eldra-edit-mode')).toBe(false);
  });

  function reportedBlocks(): BridgePayloads['theme:blocks-rendered']['blocks'] {
    post.mockClear();
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    return renderedBlocks(post.mock.calls.find(([type]) => type === 'theme:blocks-rendered'));
  }

  it('reports hiddenAtBreakpoint for a node hidden at the breakpoint in force, on render and on click', () => {
    vi.stubGlobal('innerWidth', 400);
    expect(reportedBlocks()).toEqual([
      expect.objectContaining({ entryId: 'block-1', hiddenAtBreakpoint: true }),
      expect.objectContaining({ entryId: 'block-2' }),
      expect.objectContaining({ entryId: 'block-3' }),
    ]);

    post.mockClear();
    document
      .querySelector('[data-eldra-block="block-1"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(post).toHaveBeenCalledWith(
      'theme:block-clicked',
      expect.objectContaining({ entryId: 'block-1', hiddenAtBreakpoint: true })
    );

    post.mockClear();
    document
      .querySelector('[data-eldra-block="block-2"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const clicked = post.mock.calls.find(([type]) => type === 'theme:block-clicked');
    expect(clicked?.[1] && 'hiddenAtBreakpoint' in clicked[1]).toBe(false);
  });

  it('is own-node: a block hidden only by its container never claims it', () => {
    vi.stubGlobal('innerWidth', 400);
    const inside = reportedBlocks().find((block) => block.entryId === 'block-3')!;
    expect('hiddenAtBreakpoint' in inside).toBe(false);
    expect(
      document.querySelector('[data-eldra-layout-node="Inside"]')!.closest('[data-eldra-hidden]')
    ).not.toBeNull();
  });

  it('reads the breakpoint in force, not the attribute: an unmatched breakpoint is not hidden', () => {
    vi.stubGlobal('innerWidth', 1280);
    expect(reportedBlocks().some((block) => 'hiddenAtBreakpoint' in block)).toBe(false);
  });

  it("resolves the viewport against the theme's own breakpoints, not the kit defaults", () => {
    runtime.stop();
    vi.stubGlobal('innerWidth', 900);
    const themed = createOverlayRuntime({ post, breakpoints: { tablet: 950, normal: 1600 } });
    themed.start();
    // 900px is `tablet` under the kit defaults (768/1024) and `mobile` under
    // this theme's own (950/1600) — the stylesheet wrote its `@media` blocks
    // with the latter, so anything reading the defaults gets it wrong.
    document
      .querySelector('[data-eldra-layout-node="Placement"]')!
      .setAttribute('data-eldra-hidden', 'mobile');
    expect(reportedBlocks()[0]).toEqual(
      expect.objectContaining({ entryId: 'block-1', hiddenAtBreakpoint: true })
    );
    themed.stop();
  });
});
