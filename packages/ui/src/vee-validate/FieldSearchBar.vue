<script setup lang="ts">
/**
 * `SearchBar` bound to a vee-validate field, for a Search page whose query is validated before it
 * is sent.
 *
 * `label` is the one prop that means the same thing on both sides — the field's accessible name and
 * the name a rule message uses — so it is handed to `useField` *and* forwarded to the control,
 * rather than being kept back like `rules`.
 */
import SearchBar from '../components/search-bar/SearchBar.vue';
import type { FieldSearchBarProps } from './types';
import { useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldSearchBarProps>();

/**
 * `hasIdProp: false`: a `SearchBar` sets the id on its own field after its attribute fall-through,
 * and its native `name` is always `q` (its form posts to the Search page) — so neither is this
 * component's to hand over, and a `Form`'s error summary lists this field by name rather than
 * linking to an id that would not exist.
 */
const { model, onBlur } = useFieldControl<string>(props, { empty: '', hasIdProp: false });

// `name` is kept back too: a `SearchBar` has no `name` prop and its native field is always
// `q`, because its form posts to the Search page. `label` is forwarded, because there it
// means the same thing on both sides.
const control = useControlProps(props, ['path', 'rules', 'id', 'name'] as const);
</script>

<template>
  <SearchBar v-bind="control" v-model="model" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </SearchBar>
</template>
