// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { isBuilt, itFailsWithoutDist } from '../../../test/built';

const dist = fileURLToPath(new URL('../../../../dist/', import.meta.url));
const built = isBuilt(`${dist}index.js`, `${dist}tabler-icons/000.js`);

describe('TablerIcon as published', () => {
  itFailsWithoutDist(built);

  it.runIf(built)('server-renders its paths from dist/, with no DOM at all', async () => {
    const { TablerIcon } = (await import(/* @vite-ignore */ `${dist}index.js`)) as {
      TablerIcon: Component;
    };
    const html = await renderToString(
      createSSRApp({ render: () => h(TablerIcon, { name: 'cash-register' }) })
    );
    expect(html).toMatch(/ data-tabler-icon="IconCashRegister"[^>]*><path d="[^"]+"\/>/);
  });
});
