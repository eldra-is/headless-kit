// useEldraIcon.ts calls the Nuxt-auto-imported `useFetch` as a bare global
// (no import in the source file — that's how Nuxt's unimport makes it
// available at build time). Outside a Nuxt build, plain Vitest has no such
// global, so we install one ourselves with `vi.stubGlobal('useFetch', ...)`
// before invoking the composable; the bare `useFetch` identifier in the
// module then resolves through the JS global scope to our stub. This is
// simpler and more direct here than mocking a `#imports`/`nuxt/app` module
// specifier, since the composable never imports `useFetch` from anywhere.
import { ref, unref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeStega } from '@eldra/theme-core';
import { useEldraIcon } from '../app/composables/useEldraIcon';

describe('useEldraIcon', () => {
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
    useEldraIcon('bolt');

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
    const result = useEldraIcon('bolt');
    expect(result.value).toBe('<svg data-x="1"></svg>');
  });

  it('returns null when the response has no svg', () => {
    useFetchMock.mockReturnValue({ data: ref({ svg: null }) });
    const result = useEldraIcon('does-not-exist-xyz');
    expect(result.value).toBeNull();
  });

  it('returns null when the response itself is missing', () => {
    useFetchMock.mockReturnValue({ data: ref(undefined) });
    const result = useEldraIcon('bolt');
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

    useEldraIcon(encoded);

    const opts = useFetchMock.mock.calls[0][1] as { query: { name: unknown }; key: unknown };
    expect(unref(opts.query.name as Ref<string>)).toBe('lock');
    expect(unref(opts.key as Ref<string>)).toBe('eldra-icon:lock');
  });

  it('strips reactively, so an echoed draft keeps resolving', () => {
    const name = ref('lock');
    useEldraIcon(name);
    const opts = useFetchMock.mock.calls[0][1] as { query: { name: unknown } };

    name.value = encodeStega('bolt', {
      entryId: 'entry-1',
      fieldPath: 'features.0.icon',
      locale: null,
    });

    expect(unref(opts.query.name as Ref<string>)).toBe('bolt');
  });

  it('updates the query and cache key reactively when the name ref changes', () => {
    const name = ref('bolt');
    useEldraIcon(name);

    const opts = useFetchMock.mock.calls[0][1] as { query: { name: unknown }; key: unknown };
    expect(unref(opts.query.name as Ref<string>)).toBe('bolt');
    expect(unref(opts.key as Ref<string>)).toBe('eldra-icon:bolt');

    name.value = 'lock';

    expect(unref(opts.query.name as Ref<string>)).toBe('lock');
    expect(unref(opts.key as Ref<string>)).toBe('eldra-icon:lock');
  });
});
