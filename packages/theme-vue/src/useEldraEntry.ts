import { ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import type { EntryDoc, EntryQuery } from '@eldrajs/theme-core';
import { useEldra } from './context';

export function useEldraEntry(opts: {
  schemaApiId: string;
  entryId?: MaybeRefOrGetter<string | undefined>;
  uniqueField?: { fieldId: string; value: MaybeRefOrGetter<string> };
  query?: EntryQuery;
}): {
  entry: Ref<EntryDoc | null>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
  refresh: () => Promise<void>;
} {
  const context = useEldra();
  const entry = ref<EntryDoc | null>(null);
  const pending = ref(false);
  const error = ref<string | null>(null);
  let requestVersion = 0;

  function overlayDraft(): void {
    const current = entry.value;
    if (current === null) return;
    const draft = context.preview.drafts[current.id];
    if (draft !== undefined) entry.value = { ...current, data: draft };
  }

  async function refresh(): Promise<void> {
    const version = ++requestVersion;
    pending.value = true;
    error.value = null;
    try {
      const id = toValue(opts.entryId);
      let result: EntryDoc | null;
      if (id !== undefined) {
        result = await context.client.getEntry(opts.schemaApiId, id, opts.query);
      } else if (opts.uniqueField !== undefined) {
        result = await context.client.getEntryByUniqueField(
          opts.schemaApiId,
          opts.uniqueField.fieldId,
          toValue(opts.uniqueField.value),
          opts.query
        );
      } else {
        result = null;
      }
      if (version !== requestVersion) return;
      entry.value = result;
      overlayDraft();
    } catch (cause) {
      if (version !== requestVersion) return;
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (version === requestVersion) pending.value = false;
    }
  }

  watch(
    () => [
      toValue(opts.entryId),
      opts.uniqueField === undefined ? undefined : toValue(opts.uniqueField.value),
    ],
    () => {
      void refresh();
    },
    { immediate: true }
  );
  watch(() => context.preview.revision, overlayDraft);

  return { entry, pending, error, refresh };
}
