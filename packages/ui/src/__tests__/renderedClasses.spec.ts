import { composeStories } from '@storybook/vue3-vite';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { conflicting } from '../test/kitMerge';

/**
 * Every story, mounted, read element by element. A component writes one class per concern, so no
 * element may carry two `eldra:` classes that conflict (which one paints would be the stylesheet's
 * order, not the code's); every class it renders is `eldra:`-prefixed, except the ones the story
 * itself passes in as a consumer would; and no `classes` object lands as an attribute.
 */
const modules = import.meta.glob<Record<string, unknown>>('../components/**/*.stories.ts', {
  eager: true,
});
const sources = import.meta.glob<string>('../components/**/*.stories.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
});

/** `@tabler/icons-vue` puts its own `tabler-icon tabler-icon-<name>` on every icon it draws. */
const OWN = /^tabler-icon(-|$)/;

function describeElement(el: Element): string {
  const part = el.getAttribute('data-part');
  return part ? `${el.tagName.toLowerCase()}[data-part=${part}]` : el.tagName.toLowerCase();
}

const cases = Object.entries(modules).flatMap(([path, mod]) =>
  Object.entries(composeStories(mod as never)).map(([name, Story]) => ({
    id: `${path.replace('../components/', '')} › ${name}`,
    Story,
    source: sources[path]!,
  }))
);

describe('the classes every story renders', () => {
  it('finds the stories', () => {
    expect(cases.length).toBeGreaterThan(400);
  });

  it.each(cases)('$id', async ({ Story, source }) => {
    const wrapper = mount(Story as never, { attachTo: document.body });
    await nextTick();
    const conflicts: string[] = [];
    const unprefixed = new Set<string>();
    // A `classes` object given to a component without that prop falls through as an attribute.
    const strayClasses = [...document.body.querySelectorAll('[classes]')].map(describeElement);
    for (const el of document.body.querySelectorAll('[class]')) {
      const tokens = [...el.classList];
      const kit = tokens.filter((token) => token.startsWith('eldra:'));
      const lost = conflicting(kit);
      if (lost.length)
        conflicts.push(`${describeElement(el)}: ${lost.join(' ')} (${kit.join(' ')})`);
      for (const token of tokens)
        if (!token.startsWith('eldra:') && !OWN.test(token) && !source.includes(token))
          unprefixed.add(token);
    }
    wrapper.unmount();
    document.body.innerHTML = '';
    expect({ conflicts, unprefixed: [...unprefixed], strayClasses }).toEqual({
      conflicts: [],
      unprefixed: [],
      strayClasses: [],
    });
  });
});
