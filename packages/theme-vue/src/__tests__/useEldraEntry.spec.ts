import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { EldraClient, EntryDoc } from '@eldrajs/theme-core';
import { provideEldra, type EldraContext } from '../context';
import { useEldraEntry } from '../useEldraEntry';

function clientStub(overrides: Partial<EldraClient> = {}): EldraClient {
  return {
    getEntries: vi.fn(),
    getEntry: vi.fn().mockResolvedValue({ id: 'e1', data: { title: 'published' } }),
    getEntryByUniqueField: vi.fn(),
    resolveEntryListField: vi.fn(),
    resolveEntryList: vi.fn(),
    getTypeScriptDefinitions: vi.fn(),
    enablePreview: vi.fn(),
    disablePreview: vi.fn(),
    previewEnabled: false,
    encodeEntryDataStega: vi.fn((_id, data) => data),
    ...overrides,
  } as EldraClient;
}

describe('useEldraEntry', () => {
  function mountHarness(
    client: EldraClient,
    setupChild: () => void,
    captureContext?: (context: EldraContext) => void
  ): void {
    const Child = defineComponent({
      setup() {
        setupChild();
        return () => h('div');
      },
    });
    mount(
      defineComponent({
        setup() {
          const context = provideEldra({ client });
          captureContext?.(context);
          return () => h(Child);
        },
      })
    );
  }

  it('fetches by id and reactively overlays streamed drafts', async () => {
    const client = clientStub();
    let context!: EldraContext;
    let result!: ReturnType<typeof useEldraEntry>;
    mountHarness(
      client,
      () => {
        result = useEldraEntry({ schemaApiId: 'hero', entryId: 'e1' });
      },
      (provided) => {
        context = provided;
      }
    );
    await flushPromises();
    expect(client.getEntry).toHaveBeenCalledWith('hero', 'e1', undefined);
    expect(result.entry.value?.data.title).toBe('published');

    context.preview.drafts.e1 = { title: 'draft' };
    context.preview.revision += 1;
    await nextTick();
    expect(result.entry.value?.data.title).toBe('draft');
  });

  it('reacts to id changes and exposes fetch errors', async () => {
    const entryId = ref<string | undefined>('e1');
    const getEntry = vi
      .fn<(schema: string, id: string) => Promise<EntryDoc>>()
      .mockResolvedValueOnce({ id: 'e1', data: {} })
      .mockRejectedValueOnce(new Error('gateway unavailable'));
    const client = clientStub({ getEntry });
    let result!: ReturnType<typeof useEldraEntry>;
    mountHarness(client, () => {
      result = useEldraEntry({ schemaApiId: 'hero', entryId });
    });
    await flushPromises();
    entryId.value = 'e2';
    await flushPromises();
    expect(getEntry).toHaveBeenLastCalledWith('hero', 'e2', undefined);
    expect(result.error.value).toBe('gateway unavailable');
    expect(result.pending.value).toBe(false);
  });

  it('fetches through a unique field when no entry id is supplied', async () => {
    const getEntryByUniqueField = vi.fn().mockResolvedValue({ id: 'e1', data: { slug: 'home' } });
    const client = clientStub({ getEntryByUniqueField });
    mountHarness(client, () => {
      useEldraEntry({
        schemaApiId: 'page',
        uniqueField: { fieldId: 'slug', value: 'home' },
        query: { locale: 'en-US' },
      });
    });
    await flushPromises();
    expect(getEntryByUniqueField).toHaveBeenCalledWith('page', 'slug', 'home', { locale: 'en-US' });
  });
});
