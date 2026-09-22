// @vitest-environment jsdom
//
// `useEldraIcon` now branches on `inject(ICON_FETCHER_KEY, undefined)`:
//
//  - no injected fetcher (the real Nuxt app): falls back to Nuxt's
//    auto-imported `useFetch` as a bare global (no import in the source
//    file — that's how Nuxt's unimport makes it available at build time).
//    Outside a Nuxt build, plain Vitest has no such global, so these tests
//    install one with `vi.stubGlobal('useFetch', ...)` before invoking the
//    composable, same as before this task.
//  - an injected fetcher (Storybook, or a test like this one): resolved
//    asynchronously through a plain `Promise`-returning function instead.
//
// `inject()` only works inside an active component's `setup()`, so every
// case here mounts a tiny host component and captures the composable's
// returned ref from its `setup()` closure, rather than calling
// `useEldraIcon()` at the top level of the test as the pre-injection
// version did.
import { defineComponent, ref, unref, type Ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeStega } from '@eldrajs/theme-core';
import { useEldraIcon } from '../app/composables/useEldraIcon';
import { ICON_FETCHER_KEY, type IconFetcher } from '../app/composables/iconFetcher';

function mountIcon(
  name: Ref<string | undefined> | string,
  fetcher?: IconFetcher
): { result: Ref<string | null> } {
  let result!: Ref<string | null>;
  const Host = defineComponent({
    setup() {
      result = useEldraIcon(name);
      return () => null;
    },
  });
  mount(Host, fetcher ? { global: { provide: { [ICON_FETCHER_KEY]: fetcher } } } : undefined);
  return { result };
}

describe('useEldraIcon — default path (no injected fetcher)', () => {
  let useFetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useFetchMock = vi.fn((_url: string, opts: { default?: () => unknown }) => ({
      data: ref(opts?.default ? opts.default() : undefined),
    }));
    vi.stubGlobal('useFetch', useFetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls useFetch with the icon endpoint, the name as the query, and a matching cache key', () => {
    mountIcon('bolt');

    expect(useFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = useFetchMock.mock.calls[0] as [
      string,
      { query: { name: unknown }; key: unknown },
    ];
    expect(url).toBe('/api/eldra-icon');
    expect(unref(opts.query.name as Ref<string>)).toBe('bolt');
    expect(unref(opts.key as Ref<string>)).toBe('eldra-icon:bolt');
  });

  it('returns the fetched svg when the response has one', () => {
    useFetchMock.mockReturnValue({ data: ref({ svg: '<svg data-x="1"></svg>' }) });
    const { result } = mountIcon('bolt');
    expect(result.value).toBe('<svg data-x="1"></svg>');
  });

  it('returns null when the response has no svg', () => {
    useFetchMock.mockReturnValue({ data: ref({ svg: null }) });
    const { result } = mountIcon('does-not-exist-xyz');
    expect(result.value).toBeNull();
  });

  it('returns null when the response itself is missing', () => {
    useFetchMock.mockReturnValue({ data: ref(undefined) });
    const { result } = mountIcon('bolt');
    expect(result.value).toBeNull();
  });

  it('strips the stega payload an entry field carries, so the request URL is a plain name', () => {
    // Inside Studio's preview the icon name is a rendered CMS field value.
    // Left encoded it reaches the endpoint as `?name=lock%EF%BB%BF…`, which
    // resolves to nothing and blanks every icon in edit mode only.
    const encoded = encodeStega('lock', {
      entryId: 'entry-1',
      fieldPath: 'features.0.icon',
      locale: 'en-US',
    });
    expect(encoded).not.toBe('lock');

    mountIcon(encoded);

    const opts = useFetchMock.mock.calls[0][1] as { query: { name: unknown }; key: unknown };
    expect(unref(opts.query.name as Ref<string>)).toBe('lock');
    expect(unref(opts.key as Ref<string>)).toBe('eldra-icon:lock');
  });

  it('updates the query and cache key reactively when the name ref changes', () => {
    const name = ref<string | undefined>('bolt');
    mountIcon(name);

    const opts = useFetchMock.mock.calls[0][1] as { query: { name: unknown }; key: unknown };
    expect(unref(opts.query.name as Ref<string>)).toBe('bolt');
    expect(unref(opts.key as Ref<string>)).toBe('eldra-icon:bolt');

    name.value = 'lock';

    expect(unref(opts.query.name as Ref<string>)).toBe('lock');
    expect(unref(opts.key as Ref<string>)).toBe('eldra-icon:lock');
  });
});

describe('useEldraIcon — injected fetcher', () => {
  it('resolves the svg the injected fetcher returns', async () => {
    const fetcher: IconFetcher = async (name) =>
      name === 'bolt' ? '<svg data-x="1"></svg>' : null;
    const { result } = mountIcon('bolt', fetcher);

    await flushPromises();
    expect(result.value).toBe('<svg data-x="1"></svg>');
  });

  it('returns null for a name the fetcher does not resolve', async () => {
    const fetcher: IconFetcher = async () => null;
    const { result } = mountIcon('does-not-exist-xyz', fetcher);

    await flushPromises();
    expect(result.value).toBeNull();
  });

  it('strips the stega payload before calling the injected fetcher', async () => {
    const seen: string[] = [];
    const fetcher: IconFetcher = async (name) => {
      seen.push(name);
      return null;
    };
    const encoded = encodeStega('lock', {
      entryId: 'entry-1',
      fieldPath: 'features.0.icon',
      locale: 'en-US',
    });

    mountIcon(encoded, fetcher);
    await flushPromises();

    expect(seen).toEqual(['lock']);
  });

  it('re-resolves reactively when the name ref changes', async () => {
    const fetcher: IconFetcher = async (name) => `<svg>${name}</svg>`;
    const name = ref<string | undefined>('bolt');
    const { result } = mountIcon(name, fetcher);

    await flushPromises();
    expect(result.value).toBe('<svg>bolt</svg>');

    name.value = 'lock';
    await flushPromises();
    expect(result.value).toBe('<svg>lock</svg>');
  });
});
