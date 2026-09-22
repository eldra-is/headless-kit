import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { EldraBlockZone, getBlockSchemaApiId } from '../EldraBlockZone';

const hero = { id: 'b1', schemaApiId: 'hero', data: { heading: 'Hi' } };
const nestedSchema = { id: 'b2', schema: { apiId: 'hero' }, data: { heading: 'Nested' } };
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
