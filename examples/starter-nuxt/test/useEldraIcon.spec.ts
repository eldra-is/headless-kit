// @vitest-environment jsdom
//
// `useEldraIcon` branches on `inject(ICON_FETCHER_KEY, undefined)`:
//
//  - no injected fetcher (the real app, Storybook, a plain `mount()`): a
//    synchronous lookup in `app/icons.ts`, the icons the theme bundles at build
//    time. No server route, no fetch — which is what makes an icon work on a
//    static host and in Studio's preview the moment an editor types a name.
//  - an injected fetcher: resolved asynchronously through a plain
//    `Promise`-returning function instead, for a spec that wants to drive it.
//
// `inject()` only works inside an active component's `setup()`, so every case
// here mounts a tiny host component and captures the composable's returned ref
// from its `setup()` closure.
import { defineComponent, ref, type Ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { encodeStega } from '@eldrajs/theme-core';
import { useEldraIcon } from '../app/composables/useEldraIcon';
import { THEME_ICONS } from '../app/icons';
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

describe('useEldraIcon — default path (the bundled icons)', () => {
  it('resolves a bundled icon synchronously, with no await and no request', () => {
    const { result } = mountIcon('lock');
    expect(result.value).toBe(THEME_ICONS['lock']);
    expect(result.value).toContain('<svg');
    expect(result.value).toContain('stroke="currentColor"');
  });

  it('returns null for a name the theme does not bundle', () => {
    expect(mountIcon('does-not-exist-xyz').result.value).toBeNull();
    expect(mountIcon('').result.value).toBeNull();
    expect(mountIcon(undefined).result.value).toBeNull();
  });

  it('does not resolve a name that only differs by surrounding whitespace by accident', () => {
    expect(mountIcon('  lock  ').result.value).toBe(THEME_ICONS['lock']);
  });

  it('strips the stega payload an entry field carries, so edit mode resolves the same icon', () => {
    // Inside Studio's preview the icon name is a rendered CMS field value. Left encoded it is
    // `lock\ufeff…`, which matches no key and blanks every icon in edit mode only.
    const encoded = encodeStega('lock', {
      entryId: 'entry-1',
      fieldPath: 'features.0.icon',
      locale: 'en-US',
    });
    expect(encoded).not.toBe('lock');
    expect(mountIcon(encoded).result.value).toBe(THEME_ICONS['lock']);
  });

  it('follows the name ref reactively', () => {
    const name = ref<string | undefined>('lock');
    const { result } = mountIcon(name);
    expect(result.value).toBe(THEME_ICONS['lock']);

    name.value = 'truck';
    expect(result.value).toBe(THEME_ICONS['truck']);
  });
});

describe('useEldraIcon — injected fetcher', () => {
  it('resolves the svg the injected fetcher returns', async () => {
    const fetcher: IconFetcher = async (name) =>
      name === 'lock' ? '<svg data-x="1"></svg>' : null;
    const { result } = mountIcon('lock', fetcher);

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
    const name = ref<string | undefined>('lock');
    const { result } = mountIcon(name, fetcher);

    await flushPromises();
    expect(result.value).toBe('<svg>lock</svg>');

    name.value = 'truck';
    await flushPromises();
    expect(result.value).toBe('<svg>truck</svg>');
  });
});
