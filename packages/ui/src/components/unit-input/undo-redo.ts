import { ref, type Ref, type WritableComputedRef } from 'vue';

/**
 * Undo and redo for a field whose text is rewritten on every keystroke — ported, behaviour for
 * behaviour, from the private library's `formatted-input/undo-redo.ts`.
 *
 * A formatted field cannot use the browser's own history: every input handler writes `value`
 * back onto the element, and a scripted write clears the undo stack in every engine. So the field
 * keeps its own, and it is deliberately **coarse**: one entry per keystroke that actually changed
 * the value, recorded with the caret position it was made at.
 *
 * The 2 ms `setTimeout` is how a keystroke is recorded *after* the component has reformatted the
 * value it produced: `keydown` fires before `input`, so reading the value synchronously here would
 * push the state the previous keystroke left. It has to outlast the `input` handler's own
 * `nextTick` reconciliation, which is why it is 2 ms rather than 0.
 */
interface UndoRedoEntry {
  cursor: number;
  value: string;
}

export interface UseUndoRedoReturn {
  /** Call first from the field's own `keydown` handler. Handles Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. */
  onKeydown: (event: KeyboardEvent) => void;
}

export function useUndoRedo(value: WritableComputedRef<string> | Ref<string>): UseUndoRedoReturn {
  const undo = ref<UndoRedoEntry[]>([]);
  const redo = ref<UndoRedoEntry[]>([]);

  const onKeydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;

    const controlKey = event.ctrlKey || event.metaKey;
    const zKey = event.key === 'z' || event.key === 'Z';
    const isUndo = controlKey && zKey;
    const isRedo = isUndo && event.shiftKey;
    const cursor = target.selectionStart || 0;

    if (isRedo) {
      const latest = redo.value.pop();
      if (latest) {
        event.preventDefault();
        event.stopPropagation();
        undo.value.push({ cursor, value: value.value });
        value.value = latest.value;
        setTimeout(() => {
          target.setSelectionRange(latest.cursor, latest.cursor);
        });
      }
      return;
    }

    if (isUndo) {
      event.preventDefault();
      event.stopPropagation();
      const latest = undo.value.pop();
      if (latest) {
        redo.value.push({ cursor, value: value.value });
        value.value = latest.value;
        setTimeout(() => {
          target.setSelectionRange(latest.cursor, latest.cursor);
        });
      }
      return;
    }

    const before = value.value;
    setTimeout(() => {
      if (before === value.value) return;
      undo.value.push({ cursor, value: before });
      redo.value = [];
    }, 2);
  };

  return { onKeydown };
}
