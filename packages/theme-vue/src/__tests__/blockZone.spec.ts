import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { EldraBlockZone, getBlockSchemaApiId } from '../EldraBlockZone';

const hero = { id: 'b1', schemaApiId: 'hero', data: { heading: 'Hi' } };
const nestedSchema = { id: 'b2', schema: { apiId: 'hero' }, data: { heading: 'Nested' } };
const prefixed = { id: 'b4', schemaApiId: 'test-theme:hero', data: { heading: 'Wire' } };
const prefixedNested = {
  id: 'b5',
  schema: { apiId: 'test-theme:hero' },
  data: { heading: 'Wire nested' },
};
const otherTheme = { id: 'b6', schemaApiId: 'other-theme:hero', data: {} };
const unknown = { id: 'b3', schemaApiId: 'not-in-theme', data: {} };

describe('EldraBlockZone', () => {
  it('renders known blocks in annotated wrappers and preserves order', async () => {
    const wrapper = mount(EldraBlockZone, { props: { blocks: [hero, nestedSchema] } });
    await flushPromises();
    const blocks = wrapper.findAll('[data-eldra-block]');
    expect(blocks.map((block) => block.attributes('data-eldra-block'))).toEqual(['b1', 'b2']);
    expect(blocks.every((block) => block.attributes('data-eldra-schema') === 'hero')).toBe(true);
    expect(blocks.map((block) => block.find('h1').text())).toEqual(['Hi', 'Nested']);
  });

  it('supports both schemaApiId gateway shapes', () => {
    expect(getBlockSchemaApiId(hero)).toBe('hero');
    expect(getBlockSchemaApiId(nestedSchema)).toBe('hero');
    expect(getBlockSchemaApiId({ id: 'none', data: {} })).toBeNull();
  });

  it('maps the wire spelling <themeId>:<apiId> back to the bare block id', async () => {
    expect(getBlockSchemaApiId(prefixed)).toBe('hero');
    expect(getBlockSchemaApiId(prefixedNested)).toBe('hero');
    const wrapper = mount(EldraBlockZone, { props: { blocks: [prefixed, prefixedNested] } });
    await flushPromises();
    const blocks = wrapper.findAll('[data-eldra-block]');
    // data-eldra-schema stays bare: the overlay and the builder match on it.
    expect(blocks.map((block) => block.attributes('data-eldra-schema'))).toEqual(['hero', 'hero']);
    expect(blocks.map((block) => block.find('h1').text())).toEqual(['Wire', 'Wire nested']);
  });

  it("strips only this theme's own prefix", () => {
    expect(getBlockSchemaApiId(otherTheme)).toBe('other-theme:hero');
    expect(getBlockSchemaApiId({ id: 'c', schemaApiId: 'catalog:product', data: {} })).toBe(
      'catalog:product'
    );
  });

  it('skips unknown schemas with a hidden marker and warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mount(EldraBlockZone, { props: { blocks: [unknown] } });
    await flushPromises();
    const marker = wrapper.find('[data-eldra-missing-block="not-in-theme"]');
    expect(marker.exists()).toBe(true);
    expect(marker.attributes('style')).toContain('display: none');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not-in-theme'));
  });
});
