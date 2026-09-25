import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import {
  normalizeText,
  useListbox,
  type ListboxOption,
  type UseListboxReturn,
} from '../useListbox';
import { currentOpen, registerOpen, unregisterOpen } from '../openRegistry';

/**
 * `useListbox` is the half of `Select` that `MultiSelect` will reuse verbatim, so it is exercised
 * on its own as well as through the component: these specs are the contract Task 13 inherits.
 */
const ROWS: ListboxOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo', disabled: true },
  { value: 'c', label: 'Charlie' },
  { value: 'd', label: 'Delta' },
  { value: 'e', label: 'Éclair' },
];

interface Harness {
  listbox: UseListboxReturn;
  calls: string[];
  isOpen: { value: boolean };
  searchable: { value: boolean };
  dispose: () => void;
}

function harness(
  options: {
    rows?: ListboxOption[];
    open?: boolean;
    searchable?: boolean;
    clearable?: boolean;
  } = {}
): Harness {
  const rows = options.rows ?? ROWS;
  const isOpen = ref(options.open ?? false);
  const searchable = ref(options.searchable ?? false);
  const calls: string[] = [];
  const scope = effectScope();
  const listbox = scope.run(() =>
    useListbox<ListboxOption>({
      options: () => rows,
      isOpen: () => isOpen.value,
      searchable: () => searchable.value,
      optionId: (value) => `opt-${value}`,
      open: (edge) => {
        calls.push(`open:${edge}`);
        isOpen.value = true;
      },
      close: () => {
        calls.push('close');
        isOpen.value = false;
      },
      select: (option) => calls.push(`select:${option.value}`),
      clear: () => {
        calls.push('clear');
        return options.clearable ?? false;
      },
      startQuery: (character) => calls.push(`query:${character}`),
      escape: () => {
        calls.push('escape');
        return false;
      },
    })
  ) as UseListboxReturn;
  return { listbox, calls, isOpen, searchable, dispose: () => scope.stop() };
}

const scopes: Array<() => void> = [];
function make(...args: Parameters<typeof harness>): Harness {
  const created = harness(...args);
  scopes.push(created.dispose);
  return created;
}

afterEach(() => {
  for (const dispose of scopes.splice(0)) dispose();
});

function press(h: Harness, init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  h.listbox.onKeydown(event);
  return event;
}

describe('normalizeText', () => {
  it('folds case and strips diacritics', () => {
    expect(normalizeText('Ísland')).toBe('island');
    expect(normalizeText('Éclair')).toBe('eclair');
    expect(normalizeText('MEXICO')).toBe('mexico');
  });
});

describe('useListbox — the active row', () => {
  it('moves by one, skipping disabled rows, and stops at both ends', () => {
    const h = make({ open: true });
    h.listbox.first();
    expect(h.listbox.activeValue.value).toBe('a');
    h.listbox.move(1);
    // "Bravo" is disabled, so it is not a place the arrows can land.
    expect(h.listbox.activeValue.value).toBe('c');
    h.listbox.move(-1);
    expect(h.listbox.activeValue.value).toBe('a');
    h.listbox.move(-1);
    expect(h.listbox.activeValue.value).toBe('a');
    h.listbox.last();
    expect(h.listbox.activeValue.value).toBe('e');
    h.listbox.move(1);
    expect(h.listbox.activeValue.value).toBe('e');
  });

  it('starts from the right end when nothing is active yet', () => {
    const down = make({ open: true });
    down.listbox.move(1);
    expect(down.listbox.activeValue.value).toBe('a');

    const up = make({ open: true });
    up.listbox.move(-1);
    expect(up.listbox.activeValue.value).toBe('e');
  });

  it('activates a given value, or the first enabled row when it cannot', () => {
    const h = make({ open: true });
    h.listbox.activateFrom('d');
    expect(h.listbox.activeValue.value).toBe('d');
    // A disabled row is not selectable, so it falls back.
    h.listbox.activateFrom('b');
    expect(h.listbox.activeValue.value).toBe('a');
    h.listbox.activateFrom(undefined);
    expect(h.listbox.activeValue.value).toBe('a');
  });

  it('exposes the active row as an element id', () => {
    const h = make({ open: true });
    expect(h.listbox.activeId.value).toBeUndefined();
    h.listbox.setActive('c');
    expect(h.listbox.activeId.value).toBe('opt-c');
  });

  it('refuses to select a disabled row', () => {
    const h = make({ open: true });
    h.listbox.setActive('b');
    h.listbox.selectActive();
    expect(h.calls).toEqual([]);
  });
});

describe('useListbox — the closed keyboard table', () => {
  it.each([['ArrowDown'], ['Enter'], [' ']])('opens at the start on %s', (key) => {
    const h = make();
    const event = press(h, { key });
    expect(event.defaultPrevented).toBe(true);
    expect(h.calls).toEqual(['open:start']);
  });

  it('opens at the end on ArrowUp, but at the start when a search field will take focus', () => {
    const plain = make();
    press(plain, { key: 'ArrowUp' });
    expect(plain.calls).toEqual(['open:end']);

    const searchable = make({ searchable: true });
    press(searchable, { key: 'ArrowUp' });
    expect(searchable.calls).toEqual(['open:start']);
  });

  it('consumes Backspace and Delete only when something was actually cleared', () => {
    const clearable = make({ clearable: true });
    expect(press(clearable, { key: 'Backspace' }).defaultPrevented).toBe(true);
    expect(press(clearable, { key: 'Delete' }).defaultPrevented).toBe(true);

    const fixed = make();
    expect(press(fixed, { key: 'Backspace' }).defaultPrevented).toBe(false);
  });

  it('hands a printable key to the query when searchable, and to type-ahead when not', () => {
    const searchable = make({ searchable: true });
    press(searchable, { key: 'd' });
    expect(searchable.calls).toEqual(['open:start', 'query:d']);

    const plain = make();
    press(plain, { key: 'd' });
    expect(plain.calls).toEqual(['open:start']);
    expect(plain.listbox.activeValue.value).toBe('d');
  });

  it('ignores a chord', () => {
    const h = make();
    expect(press(h, { key: 'a', metaKey: true }).defaultPrevented).toBe(false);
    expect(h.calls).toEqual([]);
  });
});

describe('useListbox — the open keyboard table', () => {
  it('moves by ten with PageDown and PageUp', () => {
    const rows: ListboxOption[] = Array.from({ length: 30 }, (_, i) => ({
      value: `v${i}`,
      label: `Row ${i}`,
    }));
    const h = make({ rows, open: true });
    h.listbox.first();
    press(h, { key: 'PageDown' });
    expect(h.listbox.activeValue.value).toBe('v10');
    press(h, { key: 'PageUp' });
    expect(h.listbox.activeValue.value).toBe('v0');
  });

  it('gives Home, End and Space to the caret while a search field is showing', () => {
    const h = make({ open: true, searchable: true });
    h.listbox.setActive('c');
    for (const key of ['Home', 'End', ' ']) {
      expect(press(h, { key }).defaultPrevented, key).toBe(false);
    }
    expect(h.listbox.activeValue.value).toBe('c');
    expect(h.calls).toEqual([]);
  });

  it('selects on Enter, and on Alt+ArrowUp without moving', () => {
    const h = make({ open: true });
    h.listbox.setActive('c');
    press(h, { key: 'Enter' });
    expect(h.calls).toEqual(['select:c']);
    press(h, { key: 'ArrowUp', altKey: true });
    expect(h.calls).toEqual(['select:c', 'select:c']);
  });

  it('closes on Tab without preventing the default focus move', () => {
    const h = make({ open: true });
    const event = press(h, { key: 'Tab' });
    expect(event.defaultPrevented).toBe(false);
    expect(h.calls).toEqual(['close']);
  });

  it('consumes Escape only when the caller cleared a query with it', () => {
    const untouched = make({ open: true });
    expect(press(untouched, { key: 'Escape' }).defaultPrevented).toBe(false);

    const scope = effectScope();
    let consumed = true;
    const listbox = scope.run(() =>
      useListbox<ListboxOption>({
        options: () => ROWS,
        isOpen: () => true,
        searchable: () => true,
        optionId: (value) => value,
        open: () => {},
        close: () => {},
        select: () => {},
        escape: () => consumed,
      })
    ) as UseListboxReturn;
    scopes.push(() => scope.stop());
    const event = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });
    listbox.onKeydown(event);
    expect(event.defaultPrevented).toBe(true);
    consumed = false;
    const second = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });
    listbox.onKeydown(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it('never acts on a key another handler already consumed', () => {
    const h = make({ open: true });
    const event = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowDown' });
    event.preventDefault();
    h.listbox.onKeydown(event);
    expect(h.listbox.activeValue.value).toBeUndefined();
  });
});

describe('useListbox — type-ahead', () => {
  it('walks to the next match on a repeated single character and drops the buffer after 0.6s', () => {
    vi.useFakeTimers();
    try {
      const rows: ListboxOption[] = [
        { value: 'd1', label: 'Delta' },
        { value: 'd2', label: 'Denim' },
        { value: 'x', label: 'Xenon' },
      ];
      const h = make({ rows, open: true });
      press(h, { key: 'd' });
      expect(h.listbox.activeValue.value).toBe('d1');
      press(h, { key: 'd' });
      // A second 'd' inside the buffer window matches "dd", which nothing starts with.
      expect(h.listbox.activeValue.value).toBe('d1');

      vi.advanceTimersByTime(700);
      press(h, { key: 'd' });
      expect(h.listbox.activeValue.value).toBe('d2');

      press(h, { key: 'e' });
      press(h, { key: 'l' });
      expect(h.listbox.activeValue.value).toBe('d1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores case and diacritics', () => {
    const h = make({ open: true });
    press(h, { key: 'E' });
    expect(h.listbox.activeValue.value).toBe('e');
  });

  it('skips disabled rows', () => {
    const h = make({ open: true });
    press(h, { key: 'b' });
    expect(h.listbox.activeValue.value).toBeUndefined();
  });

  it('resets on demand', () => {
    const h = make({ open: true });
    press(h, { key: 'd' });
    h.listbox.resetTypeahead();
    press(h, { key: 'e' });
    expect(h.listbox.activeValue.value).toBe('e');
  });
});

describe('openRegistry', () => {
  it('closes the popup that held the slot, and leaves the new owner alone', () => {
    const closed: string[] = [];
    const first = (): void => {
      closed.push('first');
      unregisterOpen(first);
    };
    const second = (): void => {
      closed.push('second');
      unregisterOpen(second);
    };

    registerOpen(first);
    expect(currentOpen()).toBe(first);
    registerOpen(second);
    expect(closed).toEqual(['first']);
    expect(currentOpen()).toBe(second);

    unregisterOpen(first);
    expect(currentOpen()).toBe(second);
    unregisterOpen(second);
    expect(currentOpen()).toBeNull();
  });

  it('registering the same popup twice does not close it', () => {
    let closes = 0;
    const only = (): void => {
      closes += 1;
    };
    registerOpen(only);
    registerOpen(only);
    expect(closes).toBe(0);
    unregisterOpen(only);
  });
});
