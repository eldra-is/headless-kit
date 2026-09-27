// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Component } from 'vue';
import { ICON_FETCHER_KEY, type IconFetcher } from '../app/composables/iconFetcher';
import { tablerIconSvg } from '../server/utils/tablerIcon';
import manifest from '../.eldra/manifest.json';
import { mountOptions } from './support/mountBlock';

/**
 * A published page keeps block entries written against an OLDER version of the block: after a
 * version bump Core retires or renames fields, and a field the new `block.json` marks required
 * can still be absent from an entry that predates it (the default org's home page carried
 * version-1 `cta` entries; one unguarded `.trim()` there made `nuxi generate` prerender `/` as a
 * 500 and ship no `index.html`). So "required" only describes what Studio enforces on write —
 * a block must render *any* entry shape without throwing, and the emptiest shape is `{}`.
 *
 * Every block directory is mounted here with no field data at all. Rendering nothing is fine;
 * throwing is not. Errors raised inside Vue's own scheduler (a watcher, a mounted hook) are
 * turned into test failures through `errorHandler`, since Vue would otherwise only warn.
 */
const blockModules = import.meta.glob<{ default: Component }>('../blocks/*/Block.vue', {
  eager: true,
});
const stubIconFetcher: IconFetcher = async (name) => tablerIconSvg(name);

const blocks = Object.entries(blockModules)
  .map(([path, module]) => [path.split('/')[2]!, module.default] as const)
  .sort(([a], [b]) => a.localeCompare(b));

describe('every block renders an entry with no field data at all', () => {
  it('covers every block the manifest declares', () => {
    expect(blocks.map(([apiId]) => apiId)).toEqual(
      manifest.blocks.map((block) => block.apiId).sort((a, b) => a.localeCompare(b))
    );
  });

  it.each(blocks)('%s mounts with `data: {}` without throwing', (apiId, Block) => {
    const options = mountOptions({ entry: { id: `${apiId}-empty`, data: {} } });
    options.global.provide[ICON_FETCHER_KEY] = stubIconFetcher;
    let asyncError: unknown = null;
    const wrapper = mount(Block, {
      ...options,
      global: {
        ...options.global,
        config: {
          errorHandler: (error) => {
            asyncError = error;
          },
        },
      },
    });
    expect(wrapper.exists()).toBe(true);
    expect(asyncError).toBeNull();
  });
});
