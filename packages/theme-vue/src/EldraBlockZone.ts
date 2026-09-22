import { defineAsyncComponent, defineComponent, h, type Component, type PropType } from 'vue';
import type { EntryDoc } from '@eldrajs/theme-core';
import blockImports from 'virtual:eldra/blocks';

/** Resolve the schema API id across both supported gateway response shapes. */
export function getBlockSchemaApiId(entry: EntryDoc): string | null {
  const direct = entry.schemaApiId;
  if (typeof direct === 'string') return direct;
  const schema = entry.schema;
  if (
    typeof schema === 'object' &&
    schema !== null &&
    typeof (schema as { apiId?: unknown }).apiId === 'string'
  ) {
    return (schema as { apiId: string }).apiId;
  }
  return null;
}

const componentCache = new Map<string, Component>();

/** Internal renderer lookup shared by the flat and responsive layout adapters. */
export function getBlockComponent(apiId: string): Component | null {
  const importer = blockImports[apiId];
  if (importer === undefined) return null;
  let component = componentCache.get(apiId);
  if (component === undefined) {
    component = defineAsyncComponent(async () => (await importer()).default);
    componentCache.set(apiId, component);
  }
  return component;
}

export const EldraBlockZone = defineComponent({
  name: 'EldraBlockZone',
  props: {
    blocks: { type: Array as PropType<EntryDoc[]>, required: true },
  },
  setup(props) {
    return () =>
      props.blocks.map((entry) => {
        const apiId = getBlockSchemaApiId(entry);
        const component = apiId === null ? null : getBlockComponent(apiId);
        if (apiId === null || component === null) {
          console.warn(
            `[eldra] no theme block component for schemaApiId "${String(apiId)}" (entry ${entry.id})`
          );
          return h('div', {
            key: entry.id,
            style: 'display:none',
            'data-eldra-missing-block': apiId ?? 'unknown',
          });
        }
        return h(
          'div',
          {
            key: entry.id,
            'data-eldra-block': entry.id,
            'data-eldra-schema': apiId,
          },
          [h(component, { entry })]
        );
      });
  },
});
