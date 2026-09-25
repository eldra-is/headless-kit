import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterNumericBeforeInput, type NumericInputFilterOptions } from '../numeric-input';

/**
 * The `beforeinput` filter behind both numeric controls.
 *
 * The defect it guards is the operator's own report about `QuantityStepper`: "I can type anything
 * into it". Both numeric fields are `type="text"` (a native number input cannot hold a
 * locale-grouped value — see `QuantityStepper.vue`'s doc comment), which also means neither gets
 * the browser's own numeric filtering, and both only corrected themselves on blur.
 *
 * Every case here goes through a **real** `InputEvent` dispatched at a **real** `<input>` in the
 * document, because the filter's whole job is to read `inputType`, `data`, the element's value and
 * its selection, and then either cancel the event or rewrite the value in place. happy-dom
 * implements `InputEvent` with `inputType`/`data` and `preventDefault`, so nothing here is a stub.
 */

const live: HTMLInputElement[] = [];

afterEach(() => {
  live.length = 0;
  document.body.innerHTML = '';
});

/** A focused text field with a value and a caret (or a selection) in it. */
function field(value = '', start = value.length, end = start): HTMLInputElement {
  const element = document.createElement('input');
  element.type = 'text';
  element.value = value;
  document.body.append(element);
  element.setSelectionRange(start, end);
  live.push(element);
  return element;
}

interface Dispatched {
  /** Whether the filter cancelled the browser's own insertion. */
  prevented: boolean;
  /** The element's value after the filter ran — the sanitised insertion, when there was one. */
  value: string;
  /** Every `input` event the filter fired itself, with the text it inserted. */
  inputs: string[];
}

function beforeInput(
  element: HTMLInputElement,
  data: string | null,
  options: NumericInputFilterOptions = {},
  inputType = 'insertText',
  dataTransfer?: DataTransfer
): Dispatched {
  const inputs: string[] = [];
  const onInput = (event: Event): void => {
    inputs.push((event as InputEvent).data ?? '');
  };
  const onBeforeInput = (event: Event): void => {
    filterNumericBeforeInput(event as InputEvent, options);
  };
  element.addEventListener('beforeinput', onBeforeInput);
  element.addEventListener('input', onInput);
  const event = new InputEvent('beforeinput', {
    inputType,
    data,
    cancelable: true,
    bubbles: true,
  });
  // happy-dom's `InputEvent` does not carry `dataTransfer` through its init dictionary, so the
  // Chromium-shaped paste is built by defining the property on the event itself. The filter reads
  // `event.dataTransfer`, which is exactly what it then finds.
  if (dataTransfer !== undefined) {
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer, configurable: true });
  }
  element.dispatchEvent(event);
  element.removeEventListener('beforeinput', onBeforeInput);
  element.removeEventListener('input', onInput);
  return { prevented: event.defaultPrevented, value: element.value, inputs };
}

describe('filterNumericBeforeInput — typing', () => {
  it('lets a digit through untouched', () => {
    const element = field('12');
    const result = beforeInput(element, '3');
    expect(result.prevented).toBe(false);
    // Not cancelled, so the browser does the insertion: the filter must not have touched the value.
    expect(result.value).toBe('12');
    expect(result.inputs).toEqual([]);
  });

  it('prevents a letter', () => {
    const element = field('12');
    const result = beforeInput(element, 'a');
    expect(result.prevented).toBe(true);
    expect(result.value).toBe('12');
    // Nothing was salvageable, so no `input` event is fired either: the model must not be told
    // about an edit that did not happen.
    expect(result.inputs).toEqual([]);
  });

  it.each(['a', ' ', '$', 'e', '+', '/'])('prevents %o', (character) => {
    expect(beforeInput(field('5'), character).prevented).toBe(true);
  });

  /**
   * The group separator is a decimal field's, never a whole-number field's (operator ruling). The
   * character means different things in different locales — `1,5` reads as "one thousand five" to
   * the parser and as "one point five" to an Icelandic customer — so a quantity field committed 15
   * while showing something that looked like 1.5.
   */
  it('accepts the locale group separator on a decimal field', () => {
    // Pasting "1,234.50" into a price means 1234.5; stripping the comma out would give 123450.
    expect(beforeInput(field('1'), ',', { allowDecimal: true, locale: 'en-US' }).prevented).toBe(
      false
    );
    expect(beforeInput(field('1'), '.', { allowDecimal: true, locale: 'is-IS' }).prevented).toBe(
      false
    );
  });

  it('refuses the locale group separator on a whole-number field', () => {
    expect(beforeInput(field('1'), ',', { locale: 'en-US' }).prevented).toBe(true);
    expect(beforeInput(field('1'), '.', { locale: 'is-IS' }).prevented).toBe(true);
  });

  it('sanitises a grouped paste into a whole-number field to its digits', () => {
    // Refusing the character does not refuse the paste: "1,000" is a thousand, and the digits are
    // what survives — the field then shows 1000, which is what it holds.
    const element = field('');
    const result = beforeInput(element, '1,000', { locale: 'en-US' }, 'insertFromPaste');
    expect(result.prevented).toBe(true);
    expect(element.value).toBe('1000');
  });
});

describe('filterNumericBeforeInput — the minus sign', () => {
  it('refuses a minus when negatives are not allowed', () => {
    expect(beforeInput(field(''), '-').prevented).toBe(true);
  });

  it('allows a leading minus when they are', () => {
    expect(beforeInput(field(''), '-', { allowNegative: true }).prevented).toBe(false);
  });

  it('refuses a minus that would not be leading', () => {
    // The caret is at the end of "12", so this would produce "12-".
    expect(beforeInput(field('12'), '-', { allowNegative: true }).prevented).toBe(true);
  });

  it('allows a minus typed in front of an existing value', () => {
    expect(beforeInput(field('12', 0), '-', { allowNegative: true }).prevented).toBe(false);
  });

  it('refuses a second minus', () => {
    expect(beforeInput(field('-1', 0), '-', { allowNegative: true }).prevented).toBe(true);
  });
});

describe('filterNumericBeforeInput — decimals', () => {
  it('refuses a decimal separator on a whole-number field', () => {
    expect(beforeInput(field('12'), '.', { locale: 'en-US' }).prevented).toBe(true);
  });

  it('allows the locale decimal separator when decimals are on', () => {
    const enUS = beforeInput(field('12'), '.', { allowDecimal: true, locale: 'en-US' });
    expect(enUS.prevented).toBe(false);
    const isIS = beforeInput(field('12'), ',', { allowDecimal: true, locale: 'is-IS' });
    expect(isIS.prevented).toBe(false);
  });

  it('refuses the other locale separator in the decimal position', () => {
    // `,` is is-IS's decimal point and en-US's group separator — so `12,` is a number in progress
    // under is-IS and `12.` is one under en-US, and neither locale accepts the other's spelling as
    // a decimal point. Under en-US, `.` after a `.` is the case that has to fail.
    expect(beforeInput(field('12.'), '.', { allowDecimal: true, locale: 'en-US' }).prevented).toBe(
      true
    );
    expect(beforeInput(field('12,'), ',', { allowDecimal: true, locale: 'is-IS' }).prevented).toBe(
      true
    );
  });

  it('refuses a second decimal separator anywhere in the value', () => {
    expect(
      beforeInput(field('1.5', 1), '.', { allowDecimal: true, locale: 'en-US' }).prevented
    ).toBe(true);
  });

  it('allows a decimal separator that replaces the one already selected', () => {
    // "1.5" with the "." selected: the result is still "1.5", one separator.
    expect(
      beforeInput(field('1.5', 1, 2), '.', { allowDecimal: true, locale: 'en-US' }).prevented
    ).toBe(false);
  });
});

describe('filterNumericBeforeInput — pasting', () => {
  it('inserts only the digits of a mixed paste, rather than refusing it', () => {
    const element = field('');
    const result = beforeInput(element, '12ab3', {}, 'insertFromPaste');
    expect(result.prevented).toBe(true);
    expect(result.value).toBe('123');
    // The insertion was done by the filter, so it has to announce it — `input` is the only event
    // the component's own handler listens to.
    expect(result.inputs).toEqual(['123']);
    expect(element.selectionStart).toBe(3);
  });

  it('inserts the sanitised text at the caret, keeping what is around it', () => {
    const element = field('19', 1);
    const result = beforeInput(element, 'x5y', {}, 'insertFromPaste');
    expect(result.value).toBe('159');
    expect(element.selectionStart).toBe(2);
  });

  it('replaces the selection rather than adding to it', () => {
    const element = field('1234', 1, 3);
    const result = beforeInput(element, '99kg', {}, 'insertFromPaste');
    expect(result.value).toBe('1994');
  });

  it('keeps a pasted decimal only when decimals are allowed', () => {
    const whole = field('');
    beforeInput(whole, '2.5', { locale: 'en-US' }, 'insertFromPaste');
    expect(whole.value).toBe('25');

    const fractional = field('');
    const result = beforeInput(
      fractional,
      '2.5',
      { allowDecimal: true, locale: 'en-US' },
      'insertFromPaste'
    );
    // Nothing needed removing, so the event is left to the browser and the value is untouched here.
    expect(result.prevented).toBe(false);
    expect(fractional.value).toBe('');
  });

  it('drops a paste with nothing numeric in it', () => {
    const element = field('7');
    const result = beforeInput(element, 'kilograms', {}, 'insertFromPaste');
    expect(result.prevented).toBe(true);
    expect(element.value).toBe('7');
    expect(result.inputs).toEqual([]);
  });

  it('reads the text off the DataTransfer when the event carries no data', () => {
    // Chromium puts a paste's text on `dataTransfer` and leaves `data` null; other engines do the
    // reverse. Both are read, so the filter is not engine-specific.
    const transfer = { getData: vi.fn().mockReturnValue('4a2') } as unknown as DataTransfer;
    const element = field('');
    const result = beforeInput(element, null, {}, 'insertFromPaste', transfer);
    expect(result.prevented).toBe(true);
    expect(element.value).toBe('42');
  });
});

describe('filterNumericBeforeInput — what it never touches', () => {
  it.each([
    'deleteContentBackward',
    'deleteContentForward',
    'deleteByCut',
    'historyUndo',
    'historyRedo',
    'formatBold',
  ])('leaves %s alone', (inputType) => {
    const element = field('abc');
    const result = beforeInput(element, null, {}, inputType);
    expect(result.prevented).toBe(false);
    expect(element.value).toBe('abc');
  });

  it('leaves an insertion with no text at all alone', () => {
    expect(beforeInput(field('1'), '').prevented).toBe(false);
  });

  it('filters an IME composition the same way it filters typing', () => {
    expect(beforeInput(field('1'), 'あ', {}, 'insertCompositionText').prevented).toBe(true);
    expect(beforeInput(field('1'), '2', {}, 'insertCompositionText').prevented).toBe(false);
  });

  it('ignores an event whose target is not a text control', () => {
    const div = document.createElement('div');
    document.body.append(div);
    const event = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'a',
      cancelable: true,
      bubbles: true,
    });
    div.addEventListener('beforeinput', (e) => filterNumericBeforeInput(e as InputEvent));
    div.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
